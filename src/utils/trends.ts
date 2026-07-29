import {
  startOfWeek, startOfMonth, addWeeks, addMonths,
  format, parseISO, isValid,
} from 'date-fns';
import { LogEntry, LogStatus } from '../types';

export type TrendGranularity = 'week' | 'month';

// 차트에 그릴 최근 구간 수
export const TREND_WINDOW: Record<TrendGranularity, number> = { week: 8, month: 6 };

// 최근 vs 이전 비교에 쓰는 구간 수 (윈도의 절반)
export const COMPARE_SPAN: Record<TrendGranularity, number> = { week: 4, month: 3 };

// 비율 비교를 신뢰할 최소 기록 수.
// 기록 2~3개짜리 구간의 회피율은 한 건에 33%p씩 튀므로 추세로 읽으면 안 된다.
export const MIN_COMPARE_SAMPLE = 5;

// 추세 차트는 status 기준으로 분류한다.
// outcome 은 상세 기록에만 있고 간편 기록(3탭 경로)에는 비어 있어서,
// outcome 으로 묶으면 실제로 가장 많이 쌓이는 기록이 통째로 빠진다.
// status 는 useLogStore.migrate 가 모든 기록에 항상 채워 준다.
export interface TrendBucket {
  key: string;            // 구간 시작일 (yyyy-MM-dd)
  label: string;          // x축 라벨
  total: number;
  overcome: number;       // 편안함
  blocked: number;        // 막힘
  avoided: number;        // 회피
  avoidRate: number | null;      // 기록 없는 구간은 null
  overcomeRate: number | null;
  avgFear: number | null;        // 말하기 전 긴장도 (상세 기록만)
  avgDifficulty: number | null;  // 실제 체감 어려움 (상세 기록만)
}

export interface PeriodStats {
  entryCount: number;
  overcomeRate: number;
  avoidRate: number;
}

export interface TrendComparison {
  span: number;                   // 비교한 구간 수
  recent: PeriodStats;
  previous: PeriodStats | null;   // 이전 구간에 기록이 아예 없으면 null
  /** 양쪽 구간 모두 MIN_COMPARE_SAMPLE 이상일 때만 비율 변화를 보여줄 수 있다 */
  reliable: boolean;
}

interface Accumulator {
  total: number;
  overcome: number;
  blocked: number;
  avoided: number;
  fearSum: number;
  fearCount: number;
  difficultySum: number;
  difficultyCount: number;
}

function emptyAccumulator(): Accumulator {
  return {
    total: 0, overcome: 0, blocked: 0, avoided: 0,
    fearSum: 0, fearCount: 0, difficultySum: 0, difficultyCount: 0,
  };
}

const STATUS_FIELD: Record<LogStatus, 'overcome' | 'blocked' | 'avoided'> = {
  overcome: 'overcome',
  blocked: 'blocked',
  avoided: 'avoided',
};

function startOfBucket(date: Date, granularity: TrendGranularity): Date {
  return granularity === 'week'
    ? startOfWeek(date, { weekStartsOn: 1 })   // 월요일 시작
    : startOfMonth(date);
}

function shiftBucket(date: Date, amount: number, granularity: TrendGranularity): Date {
  return granularity === 'week' ? addWeeks(date, amount) : addMonths(date, amount);
}

function bucketKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function bucketLabel(date: Date, granularity: TrendGranularity): string {
  return granularity === 'week' ? format(date, 'M/d') : format(date, 'M월');
}

function entryDate(entry: LogEntry): Date | null {
  if (!entry.createdAt) return null;
  const parsed = parseISO(entry.createdAt);
  return isValid(parsed) ? parsed : null;
}

function accumulate(target: Accumulator, entry: LogEntry): void {
  target.total += 1;
  target[STATUS_FIELD[entry.status] ?? 'blocked'] += 1;
  if (entry.expectedFear !== undefined) {
    target.fearSum += entry.expectedFear;
    target.fearCount += 1;
  }
  if (entry.actualDifficulty !== undefined) {
    target.difficultySum += entry.actualDifficulty;
    target.difficultyCount += 1;
  }
}

function groupByBucket(
  entries: LogEntry[],
  granularity: TrendGranularity
): Map<string, Accumulator> {
  const map = new Map<string, Accumulator>();
  for (const entry of entries) {
    const date = entryDate(entry);
    if (!date) continue;
    const key = bucketKey(startOfBucket(date, granularity));
    const acc = map.get(key) ?? emptyAccumulator();
    accumulate(acc, entry);
    map.set(key, acc);
  }
  return map;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 최근 TREND_WINDOW 개 구간을 빈 구간까지 포함해 순서대로 돌려준다.
 * 기록이 없는 주를 건너뛰면 x축이 압축돼 "꾸준히 기록한 것처럼" 보이므로 반드시 채운다.
 */
export function getTrendBuckets(
  entries: LogEntry[],
  granularity: TrendGranularity,
  now: Date = new Date()
): TrendBucket[] {
  const grouped = groupByBucket(entries, granularity);
  const windowSize = TREND_WINDOW[granularity];
  const current = startOfBucket(now, granularity);

  const buckets: TrendBucket[] = [];
  for (let i = windowSize - 1; i >= 0; i--) {
    const start = shiftBucket(current, -i, granularity);
    const key = bucketKey(start);
    const acc = grouped.get(key) ?? emptyAccumulator();
    buckets.push({
      key,
      label: bucketLabel(start, granularity),
      total: acc.total,
      overcome: acc.overcome,
      blocked: acc.blocked,
      avoided: acc.avoided,
      avoidRate: acc.total > 0 ? Math.round((acc.avoided / acc.total) * 100) : null,
      overcomeRate: acc.total > 0 ? Math.round((acc.overcome / acc.total) * 100) : null,
      avgFear: acc.fearCount > 0 ? round1(acc.fearSum / acc.fearCount) : null,
      avgDifficulty: acc.difficultyCount > 0
        ? round1(acc.difficultySum / acc.difficultyCount)
        : null,
    });
  }
  return buckets;
}

/** 기록이 실제로 존재하는 구간 수 — 추세를 보여줄지 판단하는 기준 */
export function countActiveBuckets(
  entries: LogEntry[],
  granularity: TrendGranularity
): number {
  return groupByBucket(entries, granularity).size;
}

function summarize(entries: LogEntry[]): PeriodStats {
  const total = entries.length;
  if (total === 0) return { entryCount: 0, overcomeRate: 0, avoidRate: 0 };
  const overcome = entries.filter(e => e.status === 'overcome').length;
  const avoided  = entries.filter(e => e.status === 'avoided').length;
  return {
    entryCount: total,
    overcomeRate: Math.round((overcome / total) * 100),
    avoidRate: Math.round((avoided / total) * 100),
  };
}

/**
 * 최근 COMPARE_SPAN 개 구간과 그 직전 같은 길이의 구간을 비교한다.
 * 경계는 [start, end) — 한 기록이 양쪽에 이중 계산되지 않는다.
 */
export function getTrendComparison(
  entries: LogEntry[],
  granularity: TrendGranularity,
  now: Date = new Date()
): TrendComparison {
  const span = COMPARE_SPAN[granularity];
  const current = startOfBucket(now, granularity);
  // 최근 구간: [recentStart, recentEnd) — 현재 구간을 포함하므로 끝은 다음 구간 시작
  const recentEnd   = shiftBucket(current, 1, granularity);
  const recentStart = shiftBucket(recentEnd, -span, granularity);
  const previousStart = shiftBucket(recentStart, -span, granularity);

  const inRange = (from: Date, to: Date) => entries.filter(e => {
    const date = entryDate(e);
    return date !== null && date >= from && date < to;
  });

  const recentEntries   = inRange(recentStart, recentEnd);
  const previousEntries = inRange(previousStart, recentStart);

  const recent   = summarize(recentEntries);
  const previous = previousEntries.length > 0 ? summarize(previousEntries) : null;

  return {
    span,
    recent,
    previous,
    reliable:
      recent.entryCount >= MIN_COMPARE_SAMPLE &&
      previousEntries.length >= MIN_COMPARE_SAMPLE,
  };
}
