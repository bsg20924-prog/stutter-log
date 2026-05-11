import { LogEntry, OutcomeTag, SituationTag } from '../types';

const AVOID_OUTCOMES = new Set<OutcomeTag>(['상대가_대신_말함', '중간에_포기함', '아예_회피함']);

export function getSituationStats(
  entries: LogEntry[]
): { situation: string; count: number; avoidRate: number }[] {
  const map = new Map<SituationTag, { count: number; avoided: number }>();
  for (const e of entries) {
    const isAvoid = AVOID_OUTCOMES.has(e.outcome);
    for (const sit of e.situations) {
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
    map.set(e.outcome, (map.get(e.outcome) ?? 0) + 1);
  }
  const ALL: OutcomeTag[] = [
    '그대로_자연스럽게', '막혔지만_끝까지_말함', '다른_단어로_바꿈',
    '우회해서_말함', '상대가_대신_말함', '중간에_포기함', '아예_회피함',
  ];
  return ALL.map(o => ({ outcome: o, count: map.get(o) ?? 0 }))
    .filter(({ count }) => count > 0);
}
