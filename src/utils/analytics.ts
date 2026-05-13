import { LogEntry, OutcomeTag, SituationTag, TacticTag } from '../types';
import { isTransitionPhoneme, parseTransition } from './phonetics';

const AVOID_OUTCOMES = new Set<OutcomeTag>(['상대가_대신_말함', '중간에_포기함', '아예_회피함']);

export function getSituationStats(
  entries: LogEntry[]
): { situation: string; count: number; avoidRate: number }[] {
  const map = new Map<SituationTag, { count: number; avoided: number }>();
  for (const e of entries) {
    const isAvoid = e.outcome ? AVOID_OUTCOMES.has(e.outcome) : false;
    for (const sit of (e.situations ?? [])) {
      const cur = map.get(sit) ?? { count: 0, avoided: 0 };
      map.set(sit, { count: cur.count + 1, avoided: cur.avoided + (isAvoid ? 1 : 0) });
    }
  }
  return [...map.entries()]
    .map(([sit, { count, avoided }]) => ({
      situation: sit.replace(/_/g, ' '),
      count,
      avoidRate: count > 0 ? Math.round((avoided / count) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export function getOutcomeDistribution(
  entries: LogEntry[]
): { outcome: OutcomeTag; count: number }[] {
  const map = new Map<OutcomeTag, number>();
  for (const e of entries) {
    if (!e.outcome) continue;
    map.set(e.outcome, (map.get(e.outcome) ?? 0) + 1);
  }
  const ALL: OutcomeTag[] = [
    '그대로_자연스럽게', '막혔지만_끝까지_말함', '다른_단어로_바꿈',
    '우회해서_말함', '상대가_대신_말함', '중간에_포기함', '아예_회피함',
  ];
  return ALL.map(o => ({ outcome: o, count: map.get(o) ?? 0 }))
    .filter(({ count }) => count > 0);
}

export function getFearGapStats(
  entries: LogEntry[]
): { averageFear: number; averageDifficulty: number; sampleSize: number } {
  const valid = entries.filter(
    e => e.expectedFear !== undefined && e.actualDifficulty !== undefined
  );
  const sampleSize = valid.length;
  if (sampleSize === 0) return { averageFear: 0, averageDifficulty: 0, sampleSize: 0 };
  const avgFear = valid.reduce((sum, e) => sum + e.expectedFear!, 0) / sampleSize;
  const avgDiff = valid.reduce((sum, e) => sum + e.actualDifficulty!, 0) / sampleSize;
  return {
    averageFear: Math.round(avgFear * 10) / 10,
    averageDifficulty: Math.round(avgDiff * 10) / 10,
    sampleSize,
  };
}

export function getTacticInsights(
  entries: LogEntry[]
): { tactic: TacticTag; usageCount: number; comfortableCount: number; comfortableRatio: number }[] {
  const map = new Map<TacticTag, { usageCount: number; comfortableCount: number }>();
  for (const entry of entries) {
    if (!entry.tactics || entry.tactics.length === 0) continue;
    const comfortable = entry.status === 'overcome';
    for (const tactic of entry.tactics) {
      const cur = map.get(tactic) ?? { usageCount: 0, comfortableCount: 0 };
      map.set(tactic, {
        usageCount: cur.usageCount + 1,
        comfortableCount: cur.comfortableCount + (comfortable ? 1 : 0),
      });
    }
  }
  return [...map.entries()]
    .map(([tactic, { usageCount, comfortableCount }]) => ({
      tactic,
      usageCount,
      comfortableCount,
      comfortableRatio: usageCount > 0 ? comfortableCount / usageCount : 0,
    }))
    .sort((a, b) =>
      b.comfortableRatio !== a.comfortableRatio
        ? b.comfortableRatio - a.comfortableRatio
        : b.usageCount - a.usageCount
    );
}

// 전이 음소(연결 발음 막힘) 빈도 집계
export function getTransitionStats(
  entries: LogEntry[]
): { transition: string; label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    for (const p of (e.phonemes ?? [])) {
      if (!p || !isTransitionPhoneme(p)) continue;
      const parsed = parseTransition(p);
      if (!parsed) continue;
      map.set(p, (map.get(p) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([key, count]) => {
      const [a, b] = parseTransition(key)!;
      return { transition: key, label: `${a} → ${b}`, count };
    })
    .sort((a, b) => b.count - a.count);
}
