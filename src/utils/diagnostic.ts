import { StrategyId } from '../types';
import {
  DiagnosticLanguage, MechanismId,
  getDiagnosticWords, getDiagnosticGroup,
} from '../data/diagnosticWords';

export type WordResponse = 'blocked' | 'clear' | 'skip';

// 물리 메커니즘 → 설명 + 추천 전략 (요구된 매핑 그대로)
export const MECHANISMS: Record<MechanismId, {
  label: string;
  cause: string;
  strategies: StrategyId[];
}> = {
  'airflow-glottal': {
    label: '공기 흐름 / 성문 잠김',
    cause: '모음·이중모음 시작에서 성대(성문)가 닫혀 공기가 나오지 못하는 패턴이에요.',
    strategies: ['easy-onset', 'h-breath-starter'],
  },
  'laryngeal-tension': {
    label: '후두 긴장',
    cause: 'ㄱ/ㅋ·K/G 같은 목 안쪽 소리에서 후두 근육이 과도하게 조이는 패턴이에요.',
    strategies: ['yawn-sigh', 'continuous-phonation'],
  },
  'articulatory-forcing': {
    label: '조음 기관 힘주기',
    cause: 'ㅂ/ㄷ·P/T 같은 입술·혀 파열음에서 지나치게 힘을 주어 막는 패턴이에요.',
    strategies: ['light-contact', 'jaw-shoulder-drop'],
  },
  'core-breathing': {
    label: '호흡 / 코어 긴장',
    cause: '특정 소리보다 전반적으로 급하게 밀어붙이며 호흡이 흐트러지는 패턴이에요.',
    strategies: ['intentional-pause', 'passive-exhale'],
  },
};

// 단어 태그로 실제 등장하는 메커니즘 (core-breathing 제외)
const WORD_MECHANISMS: MechanismId[] = [
  'airflow-glottal', 'laryngeal-tension', 'articulatory-forcing',
];

export interface GroupStat {
  groupId: string;
  label: string;
  sublabel: string;
  answered: number;
  blocked: number;
  rate: number; // 0..1
}

export interface MechanismStat {
  mechanism: MechanismId;
  label: string;
  answered: number;
  blocked: number;
  rate: number; // 0..1
}

export interface DiagnosticResult {
  id: string;
  createdAt: string;
  language: DiagnosticLanguage;
  totalWords: number;
  answered: number;
  blocked: number;
  skipped: number;
  overallRate: number; // 0..1 (답한 단어 기준)
  groupStats: GroupStat[];
  mechanismStats: MechanismStat[];
  recommendedStrategies: StrategyId[];
}

const HIGH_MECHANISM_RATE = 0.4;   // 개별 메커니즘이 "높다"고 볼 기준
const GENERAL_PANIC_RATE = 0.5;    // 전반적 막힘 → 호흡/코어 추천 기준

function rate(blocked: number, answered: number): number {
  return answered > 0 ? blocked / answered : 0;
}

// 답변 기록으로부터 진단 결과(집계 + 추천)를 계산. id/createdAt 은 저장 시 부여.
export function computeDiagnosticResult(
  language: DiagnosticLanguage,
  responses: Record<string, WordResponse>,
): Omit<DiagnosticResult, 'id' | 'createdAt'> {
  const words = getDiagnosticWords(language);

  const groupAgg = new Map<string, { answered: number; blocked: number }>();
  const mechAgg = new Map<MechanismId, { answered: number; blocked: number }>();
  let answered = 0, blocked = 0, skipped = 0;

  for (const w of words) {
    const r = responses[w.id];
    if (r === 'skip' || r === undefined) { skipped += 1; continue; }
    const isBlocked = r === 'blocked';
    answered += 1;
    if (isBlocked) blocked += 1;

    const g = groupAgg.get(w.groupId) ?? { answered: 0, blocked: 0 };
    groupAgg.set(w.groupId, { answered: g.answered + 1, blocked: g.blocked + (isBlocked ? 1 : 0) });

    const m = mechAgg.get(w.mechanism) ?? { answered: 0, blocked: 0 };
    mechAgg.set(w.mechanism, { answered: m.answered + 1, blocked: m.blocked + (isBlocked ? 1 : 0) });
  }

  const groupStats: GroupStat[] = [...groupAgg.entries()]
    .map(([groupId, { answered: a, blocked: b }]) => {
      const grp = getDiagnosticGroup(groupId);
      return {
        groupId,
        label: grp?.label ?? groupId,
        sublabel: grp?.sublabel ?? '',
        answered: a,
        blocked: b,
        rate: rate(b, a),
      };
    })
    .sort((x, y) => y.rate - x.rate || y.answered - x.answered);

  const mechanismStats: MechanismStat[] = WORD_MECHANISMS
    .map(mech => {
      const agg = mechAgg.get(mech) ?? { answered: 0, blocked: 0 };
      return {
        mechanism: mech,
        label: MECHANISMS[mech].label,
        answered: agg.answered,
        blocked: agg.blocked,
        rate: rate(agg.blocked, agg.answered),
      };
    })
    .filter(m => m.answered > 0)
    .sort((x, y) => y.rate - x.rate || y.blocked - x.blocked);

  const overallRate = rate(blocked, answered);
  const recommendedStrategies = recommend(mechanismStats, overallRate);

  return {
    language,
    totalWords: words.length,
    answered,
    blocked,
    skipped,
    overallRate,
    groupStats,
    mechanismStats,
    recommendedStrategies,
  };
}

// 상위 메커니즘 → 맞춤 전략 2~3개
function recommend(mechanismStats: MechanismStat[], overallRate: number): StrategyId[] {
  const withBlocks = mechanismStats.filter(m => m.blocked > 0);

  // 의미 있는 막힘이 없으면 가장 기본적인 두 전략을 부드럽게 안내
  if (withBlocks.length === 0) {
    return ['easy-onset', 'intentional-pause'];
  }

  const recs: StrategyId[] = [];
  const top = withBlocks[0];
  recs.push(...MECHANISMS[top.mechanism].strategies); // 항상 2개 확보

  // 두 번째 메커니즘도 뚜렷하게 높으면 그 대표 전략 하나 추가
  const second = withBlocks[1];
  if (second && second.rate >= HIGH_MECHANISM_RATE && second.rate >= top.rate * 0.7) {
    recs.push(MECHANISMS[second.mechanism].strategies[0]);
  }

  // 전반적으로 막힘이 심하면 호흡/코어 전략을 우선 포함
  if (overallRate >= GENERAL_PANIC_RATE) {
    recs.unshift(MECHANISMS['core-breathing'].strategies[0]);
  }

  return [...new Set(recs)].slice(0, 3);
}

// 결과 요약 한 줄 (예: "후두 긴장 유형이 가장 두드러져요 · 75% 막힘")
export function summarizeResult(result: DiagnosticResult): string {
  if (result.answered === 0) return '답한 단어가 없어 분석할 수 없어요.';
  if (result.blocked === 0) return '뚜렷한 막힘 패턴이 발견되지 않았어요. 아주 좋아요! 👏';
  const top = result.mechanismStats.find(m => m.blocked > 0);
  if (!top) return `전체 ${Math.round(result.overallRate * 100)}%에서 막힘이 나타났어요.`;
  return `${top.label} 유형이 가장 두드러져요 · ${Math.round(top.rate * 100)}% 막힘`;
}
