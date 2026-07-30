// 주간 기록 내러티브 — 통계 숫자를 일주일에 한 번 짧은 산문으로 바꿔 읽힌다.
//
// 왜 만드나:
// 숫자를 스스로 해석하는 일은 잘 안 하게 된다. 막대 그래프를 봐도 "그래서 뭐?"로 끝난다.
// 같은 내용이 문장으로 오면 패턴이 박힌다. 그게 이 모듈의 전부다.
//
// ★ 절대 원칙 — 이걸 어기면 기능 자체가 해롭다.
// 이 앱은 **유창성을 목표로 삼지 않는다.** 내러티브는 관찰만 서술한다.
//   1. 진단 금지        — 원인 추정 일체
//   2. 유창성 칭찬 금지  — "이번 주 덜 막혔네요" 류
//   3. 격려·응원·위로 금지
//   4. 조언·처방 금지
//   5. 데이터에 없는 것을 말하지 않기
//
// LLM 은 시키지 않으면 응원단장이 되려는 습성이 강하다. 프롬프트만으로는 강제되지 않는다.
// 그래서 안전장치를 두 겹으로 둔다:
//   (1) 숫자는 전부 여기 TypeScript 에서 계산한다. Gemini 에게는 "이 사실들을 문장으로 엮어라"만.
//       산수를 맡기면 틀린 숫자를 자신 있게 말한다.
//   (2) 생성 결과를 검사한다 — 금지 어휘, 존댓말, 문장 수, 그리고 ★사실 목록에 없는 숫자.
//       하나라도 걸리면 그 출력을 버리고 결정론적 템플릿 문장으로 되돌아간다.
//
// 템플릿 폴백은 Gemini 키가 없을 때도 쓰는 경로다 — 그 자체로 읽을 만해야 한다.

import {
  startOfWeek, addWeeks, addDays, format, parseISO, isValid,
} from 'date-fns';
import { LogEntry } from '../types';
import {
  getFearGapStats, getTacticInsights, getSituationStats, getOutcomeDistribution,
} from './analytics';
import { getTrendComparison, MIN_COMPARE_SAMPLE } from './trends';
import { getTacticLabel } from '../data/strategies';
import { callGemini, parseGeminiJson, hasGeminiKey } from './gemini';

/** 이 미만이면 아예 보여주지 않는다 — 기록 2~3건으로 "패턴"을 서술하면 그건 거짓말이다. */
export const MIN_WEEKLY_ENTRIES = 5;

const CACHE_KEY = 'stutter_weekly_narrative';

// 생성이 계속 검사에 걸리는 주에 매번 다시 부르면 돈만 쓴다. 두 번까지만 시도한다.
const MAX_ATTEMPTS = 2;

const TIMEOUT_MS = 15000;

// ── 사실 계산 ─────────────────────────────────────────────
// 여기서 나오는 숫자만이 문장에 등장할 수 있다.

export interface WeeklyFacts {
  /** 이번 주 월요일 (yyyy-MM-dd) — 캐시 키이자 주의 식별자 */
  weekStart: string;
  /** "7월 28일~8월 3일" */
  weekLabel: string;

  total: number;
  overcome: number;
  blocked: number;
  avoided: number;
  /** 기록이 하나라도 있는 날의 수 */
  activeDays: number;

  /** 전략을 함께 적은 기록 / 적지 않은 기록. blocked 는 그중 막힘으로 남은 건수. */
  withTactic: { count: number; blocked: number };
  withoutTactic: { count: number; blocked: number };
  /** 이번 주 가장 많이 적은 전략 */
  topTactic: { label: string; usageCount: number } | null;

  topSituation: { label: string; count: number } | null;
  topOutcome: { label: string; count: number } | null;

  fear: {
    /** 긴장도와 실제 어려움을 함께 적은 기록 수 */
    sampleSize: number;
    averageFear: number;
    averageDifficulty: number;
    /** 두 값을 모두 적은 기록이 있는 날의 수 */
    daysWithBoth: number;
    /** 그중 그날 평균이 '예상 > 실제' 였던 날의 수 */
    daysExpectationBeaten: number;
  };

  /** 이번 주에 두 번 이상 나온 단어 (가장 많이 나온 것 하나) */
  repeatedWord: { word: string; count: number } | null;

  previousWeekTotal: number;

  /**
   * 최근 N주 vs 직전 N주 비율 비교.
   * ★ 양쪽 표본이 MIN_COMPARE_SAMPLE 이상일 때만 값이 있다 — trends.ts 의 기존 규칙 그대로다.
   * 표본이 적은 구간의 비율은 한 건에 수십 %p 씩 튀어서 추세로 읽으면 안 된다.
   */
  spanCompare: {
    span: number;
    recentAvoidRate: number;
    previousAvoidRate: number;
    recentOvercomeRate: number;
    previousOvercomeRate: number;
  } | null;
}

function entryDate(entry: LogEntry): Date | null {
  if (!entry.createdAt) return null;
  const parsed = parseISO(entry.createdAt);
  return isValid(parsed) ? parsed : null;
}

/** 한 주(월요일 시작)에 속하는 기록만 골라낸다. 경계는 [start, end) — 이중 계산 없음. */
function entriesInRange(entries: LogEntry[], from: Date, to: Date): LogEntry[] {
  return entries.filter(e => {
    const date = entryDate(e);
    return date !== null && date >= from && date < to;
  });
}

export function computeWeeklyFacts(entries: LogEntry[], now: Date = new Date()): WeeklyFacts {
  const start = startOfWeek(now, { weekStartsOn: 1 });   // 월요일 시작 — trends.ts 와 동일
  const end = addWeeks(start, 1);
  const week = entriesInRange(entries, start, end);
  const previousWeek = entriesInRange(entries, addWeeks(start, -1), start);

  const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');
  const activeDays = new Set(
    week.map(entryDate).filter((d): d is Date => d !== null).map(dayKey)
  ).size;

  const hasTactic = (e: LogEntry) => (e.tactics?.length ?? 0) > 0;
  const countBlocked = (list: LogEntry[]) => list.filter(e => e.status === 'blocked').length;
  const used = week.filter(hasTactic);
  const notUsed = week.filter(e => !hasTactic(e));

  // '가장 많이'는 2번부터 성립한다. 전부 한 번씩인 주에 하나를 골라 "가장 많이"라고 부르면
  // 없는 패턴을 만들어내는 것이다 — 그런 주에는 아예 말하지 않는다.
  const atLeastTwice = <T>(count: number, build: () => T): T | null => (count >= 2 ? build() : null);

  // getTacticInsights 는 '편안함 비율' 순으로 정렬하지만, 내러티브가 말할 것은
  // 잘 들은 전략이 아니라 **많이 적은 전략**이다. 비율로 줄 세우면 그 자체가 평가가 된다.
  const topTacticRaw = [...getTacticInsights(week)].sort((a, b) => b.usageCount - a.usageCount)[0];
  const topTactic = topTacticRaw
    ? atLeastTwice(topTacticRaw.usageCount, () => ({
        label: getTacticLabel(topTacticRaw.tactic),
        usageCount: topTacticRaw.usageCount,
      }))
    : null;

  const topSituationRaw = getSituationStats(week)[0];
  const topSituation = topSituationRaw
    ? atLeastTwice(topSituationRaw.count, () => ({
        label: topSituationRaw.situation,
        count: topSituationRaw.count,
      }))
    : null;

  const topOutcomeRaw = [...getOutcomeDistribution(week)].sort((a, b) => b.count - a.count)[0];
  const topOutcome = topOutcomeRaw
    ? atLeastTwice(topOutcomeRaw.count, () => ({
        label: topOutcomeRaw.outcome.replace(/_/g, ' '),
        count: topOutcomeRaw.count,
      }))
    : null;

  const gap = getFearGapStats(week);

  // '예상보다 실제가 나았던 날' — 기록 단위가 아니라 날 단위로 센다.
  // 하루에 여러 건을 남기면 기록 단위 집계는 그날 하나를 여러 표로 세는 셈이 된다.
  const perDay = new Map<string, { fear: number; difficulty: number; n: number }>();
  for (const e of week) {
    const date = entryDate(e);
    if (!date || e.expectedFear === undefined || e.actualDifficulty === undefined) continue;
    const key = dayKey(date);
    const cur = perDay.get(key) ?? { fear: 0, difficulty: 0, n: 0 };
    perDay.set(key, {
      fear: cur.fear + e.expectedFear,
      difficulty: cur.difficulty + e.actualDifficulty,
      n: cur.n + 1,
    });
  }
  const daysExpectationBeaten =
    [...perDay.values()].filter(d => d.fear / d.n > d.difficulty / d.n).length;

  // 같은 단어가 반복해서 걸린 것은 그 자체로 사실이다(왜 그런지는 말하지 않는다).
  const wordCount = new Map<string, number>();
  for (const e of week) {
    const w = (e.word ?? '').trim();
    if (!w) continue;
    wordCount.set(w, (wordCount.get(w) ?? 0) + 1);
  }
  const topWord = [...wordCount.entries()].sort((a, b) => b[1] - a[1])[0];
  const repeatedWord = topWord && topWord[1] >= 2 ? { word: topWord[0], count: topWord[1] } : null;

  const comparison = getTrendComparison(entries, 'week', now);
  const spanCompare = comparison.previous && comparison.reliable
    ? {
        span: comparison.span,
        recentAvoidRate: comparison.recent.avoidRate,
        previousAvoidRate: comparison.previous.avoidRate,
        recentOvercomeRate: comparison.recent.overcomeRate,
        previousOvercomeRate: comparison.previous.overcomeRate,
      }
    : null;

  return {
    weekStart: format(start, 'yyyy-MM-dd'),
    weekLabel: `${format(start, 'M월 d일')}~${format(addDays(start, 6), 'M월 d일')}`,
    total: week.length,
    overcome: week.filter(e => e.status === 'overcome').length,
    blocked: countBlocked(week),
    avoided: week.filter(e => e.status === 'avoided').length,
    activeDays,
    withTactic: { count: used.length, blocked: countBlocked(used) },
    withoutTactic: { count: notUsed.length, blocked: countBlocked(notUsed) },
    topTactic,
    topSituation,
    topOutcome,
    fear: {
      sampleSize: gap.sampleSize,
      averageFear: gap.averageFear,
      averageDifficulty: gap.averageDifficulty,
      daysWithBoth: perDay.size,
      daysExpectationBeaten,
    },
    repeatedWord,
    previousWeekTotal: previousWeek.length,
    spanCompare,
  };
}

// ── 사실 목록 ─────────────────────────────────────────────
// 프롬프트에 넣는 줄이자, **문장에 등장해도 되는 숫자의 원천**이다.
// 두 용도가 같은 문자열에서 나와야 "우리가 준 적 없는 숫자"를 정확히 걸러낼 수 있다.
export function buildFactLines(facts: WeeklyFacts): string[] {
  const lines: string[] = [
    `기간: ${facts.weekLabel}`,
    `총 기록: ${facts.total}건 (기록한 날 ${facts.activeDays}일)`,
    `상태 구성: 편안함 ${facts.overcome}건, 막힘 ${facts.blocked}건, 회피 ${facts.avoided}건`,
    `전략을 적은 기록: ${facts.withTactic.count}건, 그중 막힘 ${facts.withTactic.blocked}건`,
    `전략을 적지 않은 기록: ${facts.withoutTactic.count}건, 그중 막힘 ${facts.withoutTactic.blocked}건`,
  ];

  if (facts.topTactic) {
    lines.push(`가장 많이 적은 전략: '${facts.topTactic.label}' ${facts.topTactic.usageCount}번`);
  }
  if (facts.topSituation) {
    lines.push(`가장 많이 적은 상황: '${facts.topSituation.label}' ${facts.topSituation.count}번`);
  }
  if (facts.topOutcome) {
    lines.push(`가장 많이 고른 결과: '${facts.topOutcome.label}' ${facts.topOutcome.count}번`);
  }
  if (facts.fear.sampleSize > 0) {
    lines.push(
      `긴장도와 실제 어려움을 함께 적은 기록: ${facts.fear.sampleSize}건 ` +
      `(평균 긴장도 ${facts.fear.averageFear}, 평균 실제 어려움 ${facts.fear.averageDifficulty}, 둘 다 5점 만점)`
    );
    lines.push(
      `예상보다 실제가 나았던 날: 두 값을 적은 ${facts.fear.daysWithBoth}일 중 ${facts.fear.daysExpectationBeaten}일`
    );
  }
  if (facts.repeatedWord) {
    lines.push(`두 번 이상 나온 단어: '${facts.repeatedWord.word}' ${facts.repeatedWord.count}번`);
  }
  lines.push(`지난주 총 기록: ${facts.previousWeekTotal}건`);
  if (facts.spanCompare) {
    const c = facts.spanCompare;
    lines.push(
      `최근 ${c.span}주 회피율 ${c.recentAvoidRate}%, 직전 ${c.span}주 회피율 ${c.previousAvoidRate}% ` +
      `(양쪽 모두 ${MIN_COMPARE_SAMPLE}건 이상이라 비교 가능)`
    );
    lines.push(
      `최근 ${c.span}주 편안함 비율 ${c.recentOvercomeRate}%, 직전 ${c.span}주 ${c.previousOvercomeRate}%`
    );
  }
  return lines;
}

// ── 템플릿 폴백 ───────────────────────────────────────────
// Gemini 키가 없을 때의 기본 경로이기도 하다. 그래서 "폴백처럼" 보이면 안 된다.
// 아래 문장들은 금지 어휘 검사를 그대로 통과하도록 쓰였다 —
// 방향을 말하는 낱말(줄었다/늘었다/나아졌다)을 하나도 쓰지 않는다.
export function buildTemplateNarrative(facts: WeeklyFacts): string {
  const sentences: string[] = [];

  sentences.push(
    facts.activeDays > 1
      ? `이번 주 기록은 ${facts.total}건, ${facts.activeDays}일에 걸쳐 남겼어요.`
      : `이번 주 기록은 ${facts.total}건이에요.`
  );
  sentences.push(
    `편안함 ${facts.overcome}건, 막힘 ${facts.blocked}건, 회피 ${facts.avoided}건이었어요.`
  );

  const { withTactic: on, withoutTactic: off } = facts;
  if (on.count > 0 && off.count > 0) {
    sentences.push(
      `전략을 쓴 ${on.count}번 중 ${on.blocked}번이 막혔고, ` +
      `안 쓴 ${off.count}번 중 막힌 건 ${off.blocked}번이었어요.`
    );
  } else if (on.count > 0) {
    sentences.push(`이번 주 기록은 모두 전략을 함께 적었고, 그중 ${on.blocked}번이 막혔어요.`);
  } else {
    sentences.push('이번 주에는 전략을 함께 적은 기록이 없었어요.');
  }

  if (facts.fear.daysWithBoth > 0) {
    sentences.push(
      facts.fear.daysExpectationBeaten > 0
        ? `긴장도와 실제를 함께 적은 ${facts.fear.daysWithBoth}일 중, ` +
          `예상보다 실제가 나았던 날이 ${facts.fear.daysExpectationBeaten}일이었어요.`
        : `긴장도와 실제를 함께 적은 날이 ${facts.fear.daysWithBoth}일이었는데, ` +
          '예상보다 실제가 나았던 날은 없었어요.'
    );
  }

  if (facts.topSituation) {
    sentences.push(`'${facts.topSituation.label}' 상황에서 ${facts.topSituation.count}번 기록했어요.`);
  }

  // 3문장이 안 되면(상세 항목이 비어 있는 주) 지난주 건수로 채운다 — 이것도 사실이다.
  if (sentences.length < 3) {
    sentences.push(`지난주 기록은 ${facts.previousWeekTotal}건이었어요.`);
  }

  return sentences.slice(0, 5).join(' ');
}

// ── 출력 검사 ─────────────────────────────────────────────

/**
 * 금지 어휘.
 *
 * 넓게 잡는 쪽이 옳다. 걸러서 템플릿으로 떨어지면 손해가 '문장이 조금 밋밋해지는 것'뿐이지만,
 * 놓치면 "좋아지고 있어요" 같은 문장이 사용자에게 나간다 — 그건 이 앱이 하지 않기로 한 말이다.
 *
 * 부분 문자열로 검사한다. 사실 목록에 등장하는 표시명(전략·상황·결과 이름)과 겹치지 않도록
 * 확인해 두었다: '첫 음절 늘리기'('늘리'≠'늘려'), '속도 30% 감속'('감속'≠'감소'),
 * '성공 기억 떠올리기'('성공'≠'성공적'), '중간에 포기함'('포기함'≠'포기하지').
 */
export const BANNED_PHRASES: string[] = [
  // ① 유창성 평가·칭찬 — 이 앱은 유창성을 목표로 삼지 않는다
  '좋', '나아지', '나아졌', '나아질', '개선', '향상', '발전', '성장', '진전', '호전',
  '훌륭', '대단', '멋지', '인상적', '뿌듯', '자랑', '성공적', '최고', '완벽', '잘 됐',
  '유창', '극복', '이겨', '덜', '나빠', '악화', '최악', '실패',

  // ② 변화의 '방향'을 말하는 낱말. 숫자는 나란히 놓되 어느 쪽이 나은지는 말하지 않는다.
  '줄었', '줄어', '늘었', '늘어', '증가', '감소', '떨어졌', '올랐', '오르', '내려갔', '높아', '낮아',

  // ③ 격려·응원·위로
  '잘하', '잘했', '잘 하', '화이팅', '파이팅', '응원', '괜찮', '힘내', '힘들',
  '충분히', '자신감', '용기', '수고', '고생', '축하', '기특', '다행', '아쉬', '안타',
  '걱정', '포기하지', '기대', '믿어',

  // ④ 진단·원인 추정
  '때문', '탓', '원인', '이유', '영향', '아마', '추측', '짐작', '가능성',
  '같아요', '같습니다', '듯', '보여요', '보이네', '보입니다', '수도 있', '싶어',
  '뜻이', '의미', '시사', '해석', '경향',

  // ⑤ 조언·처방
  '해보세', '해 보세', '보세요', '해보면', '시도', '권해', '추천', '필요',
  '도움', '하시면', '하면 좋', '연습', '앞으로', '다음 주엔', '다음 주에는', '다음엔',
  '계속', '유지', '노력', '목표', '도전', '실천', '습관', '바꿔', '줄여', '늘려',
  '어떨까', '어떠세', '어떠신',
];

/** 사실 목록에 없는 숫자를 지어내지 못하게 — 허용 숫자 집합 */
function allowedNumbers(facts: WeeklyFacts): Set<number> {
  const set = new Set<number>();
  for (const line of buildFactLines(facts)) {
    for (const m of line.match(/\d+(?:\.\d+)?/g) ?? []) set.add(Number(m));
  }
  return set;
}

/** 문장 단위로 자른다. 한국어 종결부호는 마침표·물음표·느낌표뿐이다. */
function splitSentences(text: string): string[] {
  return text.split(/[.!?…]+/).map(s => s.trim()).filter(Boolean);
}

/**
 * 생성 결과를 검사한다.
 * @returns 문제가 없으면 null, 있으면 사유 문자열(개발 중 확인용)
 */
export function inspectNarrative(text: string, facts: WeeklyFacts): string | null {
  const trimmed = text.trim();
  if (trimmed.length < 30) return '너무 짧음';
  if (trimmed.length > 400) return '너무 김';

  // 느낌표는 그 자체로 응원 톤이다. 담담한 관찰자는 느낌표를 쓰지 않는다.
  if (trimmed.includes('!')) return '느낌표';

  for (const phrase of BANNED_PHRASES) {
    if (trimmed.includes(phrase)) return `금지 어휘: ${phrase}`;
  }

  const sentences = splitSentences(trimmed);
  if (sentences.length < 3 || sentences.length > 5) return `문장 수 ${sentences.length}`;

  // 존댓말 — 모든 문장이 '요' 또는 '다'(입니다/했습니다)로 끝나야 한다.
  for (const s of sentences) {
    if (!/[요다죠]$/.test(s)) return `반말 또는 끊긴 문장: ${s}`;
  }

  // ★ 산수 위조 차단 — 사실 목록에 없던 숫자가 하나라도 있으면 버린다.
  const allowed = allowedNumbers(facts);
  for (const m of trimmed.match(/\d+(?:\.\d+)?/g) ?? []) {
    if (!allowed.has(Number(m))) return `주지 않은 숫자: ${m}`;
  }

  return null;
}

// ── Gemini 호출 ───────────────────────────────────────────

const SYSTEM_INSTRUCTION = [
  '너는 한국어 말더듬 기록 앱의 주간 요약 작성자다.',
  '주어진 "사실 목록"을 3~5문장의 짧은 산문으로 엮는 것이 유일한 일이다.',
  '',
  '★ 이 앱은 유창성을 목표로 삼지 않는다. 너는 관찰만 서술한다.',
  '',
  '절대 금지:',
  '1. 진단 — 원인을 추정하지 마라. "~때문에", "~해서 막힌" 류 금지.',
  '2. 유창성 칭찬 — "덜 막혔네요", "좋아지고 있어요" 류 금지.',
  '3. 격려·응원·위로 — "잘하고 있어요", "괜찮아요", "화이팅" 금지.',
  '4. 조언·처방 — "다음 주엔 ~해보세요" 금지.',
  '5. 사실 목록에 없는 내용 금지. 특히 **숫자를 새로 만들지 마라.**',
  '   목록에 있는 숫자만 그대로 쓴다. 더하거나 비율을 계산하지 마라.',
  '6. 변화의 방향을 평가하지 마라. 두 숫자를 나란히 적는 것까지가 전부다.',
  '   맞음: "지난주 기록은 8건이었어요."',
  '   틀림: "지난주보다 기록이 늘었어요."',
  '',
  '쓰면 안 되는 낱말(부분 일치로 걸러진다):',
  '  좋아졌/나아졌/개선/향상/성장/진전/유창/극복/덜/줄었/늘었/증가/감소/',
  '  잘하고/화이팅/응원/괜찮/힘내/충분히/노력/다행/기대/',
  '  때문/원인/이유/영향/같아요/듯/보여요/의미/경향/',
  '  해보세요/추천/필요/도움/연습/앞으로/계속/목표/도전/습관',
  '',
  '문체:',
  '- 담담한 관찰자. 존댓말. 모든 문장은 "~요." 또는 "~다."로 끝낸다.',
  '- ★ 체언으로 끝내지 마라. "이번 주 기록 11건." 같은 명사 종결은 거부된다.',
  '  반드시 서술어로 끝낸다: "이번 주에는 11건을 기록했어요."',
  '- 느낌표를 쓰지 마라.',
  '- 3~5문장. 한 문장은 짧게.',
  '- 사실을 그냥 나열하지 말고 자연스럽게 이어 읽히게 엮어라.',
  '',
  '좋은 예:',
  '"이번 주에는 11건을 기록했어요. 전략을 쓴 3번 중 2번이 막혔고,',
  ' 안 쓴 8번 중 막힌 건 1번이었어요. 예상보다 실제가 나았던 날이 4일이었어요."',
  '',
  '나쁜 예: "이번 주 기록 11건." (체언 종결 — 거부됨)',
  '나쁜 예: "지난주보다 기록이 늘었어요." (변화 방향 평가 — 금지)',
].join('\n');

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: { narrative: { type: 'string' } },
  required: ['narrative'],
};

/** Gemini 로 한 번 생성하고 검사까지 마친 문장. 실패하면 null. */
async function requestNarrative(facts: WeeklyFacts, signal?: AbortSignal): Promise<string | null> {
  const input = [
    '사실 목록 (여기 있는 내용과 숫자만 사용할 것):',
    ...buildFactLines(facts).map(l => `- ${l}`),
    '',
    '위 사실을 3~5문장의 담담한 산문으로 엮어라.',
    '모든 사실을 다 넣을 필요는 없다. 가장 또렷한 것 서너 개만 골라라.',
  ].join('\n');

  const parsed = parseGeminiJson<{ narrative?: unknown }>(await callGemini({
    systemInstruction: SYSTEM_INSTRUCTION,
    input,
    schema: RESPONSE_SCHEMA,
    // 낮게 잡는다 — 같은 주의 이야기가 호출마다 달라질 이유가 없고,
    // 온도가 높을수록 응원 어휘가 튀어나올 확률이 올라간다.
    temperature: 0.3,
    thinkingLevel: 'minimal',
    timeoutMs: TIMEOUT_MS,
    signal,
  }));

  const text = typeof parsed?.narrative === 'string' ? parsed.narrative.trim() : '';
  if (!text) return null;
  return inspectNarrative(text, facts) === null ? text : null;
}

// ── 캐시 ──────────────────────────────────────────────────
// 볼 때마다 다시 부르면 같은 주 이야기가 매번 달라져 신뢰를 잃고 돈도 든다.
// 주 시작일을 키로 한 주에 한 번만 생성한다. 지난 주 기록은 남길 이유가 없어 항상 한 건만 둔다.

interface CacheRecord {
  weekStart: string;
  /** 검사를 통과한 생성 문장. 실패한 주에는 null 이고 attempts 만 올라간다. */
  text: string | null;
  /** 그 문장을 쓸 때의 기록 수 — 주 중간에 기록이 더 쌓였는지 판단한다 */
  total: number;
  attempts: number;
}

function readCache(): CacheRecord | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CacheRecord>;
    if (typeof parsed?.weekStart !== 'string') return null;
    return {
      weekStart: parsed.weekStart,
      text: typeof parsed.text === 'string' ? parsed.text : null,
      total: typeof parsed.total === 'number' ? parsed.total : 0,
      attempts: typeof parsed.attempts === 'number' ? parsed.attempts : 0,
    };
  } catch {
    return null;
  }
}

function writeCache(record: CacheRecord): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(record));
  } catch {
    // 저장소를 못 쓰면 캐시 없이 동작한다 — 매번 템플릿이 나올 뿐 깨지지는 않는다.
  }
}

// ── 진입점 ────────────────────────────────────────────────

export interface WeeklyNarrativeResult {
  facts: WeeklyFacts;
  /** MIN_WEEKLY_ENTRIES 미만이면 false — 이때 text 는 빈 문자열이다 */
  enough: boolean;
  text: string;
  source: 'gemini' | 'template';
  /**
   * 캐시된 Gemini 문장을 쓴 시점의 기록 수.
   * 지금 기록 수와 다르면 문장 속 숫자가 이미 과거의 것이라는 뜻이라, 카드가 그 사실을 밝힌다.
   * (한 주에 한 번만 부른다는 규칙을 지키면서도 "없는 것을 말하지 않기"를 지키는 방법이다.)
   */
  writtenWithTotal: number | null;
}

// 같은 주에 대한 중복 호출을 막는다 — entries 가 갱신될 때마다 effect 가 다시 도는데,
// 캐시가 쓰이기 전에 두 번째 호출이 출발하면 같은 주를 두 번 생성하게 된다.
let pending: { key: string; promise: Promise<string | null> } | null = null;

/**
 * 이번 주 내러티브를 돌려준다.
 *
 * 순서: 최소 건수 확인 → 캐시 → Gemini(+검사) → 템플릿.
 * ⚠️ 어떤 경로에서도 예외를 던지지 않는다. Gemini 는 덧붙이는 층일 뿐이고,
 *    키가 없거나 오프라인이어도 템플릿 문장이 나와야 한다.
 */
export async function getWeeklyNarrative(
  entries: LogEntry[],
  now: Date = new Date(),
  signal?: AbortSignal,
): Promise<WeeklyNarrativeResult> {
  const facts = computeWeeklyFacts(entries, now);

  if (facts.total < MIN_WEEKLY_ENTRIES) {
    return { facts, enough: false, text: '', source: 'template', writtenWithTotal: null };
  }

  const template: WeeklyNarrativeResult = {
    facts,
    enough: true,
    text: buildTemplateNarrative(facts),
    source: 'template',
    writtenWithTotal: null,
  };

  const cached = readCache();
  const sameWeek = cached?.weekStart === facts.weekStart ? cached : null;

  if (sameWeek?.text) {
    return {
      facts,
      enough: true,
      text: sameWeek.text,
      source: 'gemini',
      writtenWithTotal: sameWeek.total,
    };
  }

  const attempts = sameWeek?.attempts ?? 0;
  if (!hasGeminiKey() || attempts >= MAX_ATTEMPTS) return template;

  if (!pending || pending.key !== facts.weekStart) {
    pending = { key: facts.weekStart, promise: requestNarrative(facts, signal) };
  }
  let text: string | null = null;
  try {
    text = await pending.promise;
  } catch {
    text = null;   // requestNarrative 는 throw 하지 않지만, 방어적으로 둔다
  } finally {
    if (pending?.key === facts.weekStart) pending = null;
  }

  if (!text) {
    // 실패도 기록해 둔다 — 검사에 계속 걸리는 주를 무한히 재시도하지 않기 위해서다.
    writeCache({ weekStart: facts.weekStart, text: null, total: facts.total, attempts: attempts + 1 });
    return template;
  }

  writeCache({ weekStart: facts.weekStart, text, total: facts.total, attempts });
  return { facts, enough: true, text, source: 'gemini', writtenWithTotal: facts.total };
}
