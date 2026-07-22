import { StrategyId } from '../types';
import {
  DiagnosticLanguage, MechanismId,
  unifiedDiagnosticWords, getDiagnosticGroup,
} from '../data/diagnosticWords';
import { ArticulationZone, ZONES } from './phonetics';

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

// 전략 → 소속 메커니즘 (MECHANISMS 의 역방향). 연습 단어를 고를 때 사용.
const STRATEGY_TO_MECHANISM: Partial<Record<StrategyId, MechanismId>> = Object.fromEntries(
  (Object.entries(MECHANISMS) as [MechanismId, { strategies: StrategyId[] }][])
    .flatMap(([mech, { strategies }]) => strategies.map(s => [s, mech])),
);

export function mechanismOfStrategy(id: StrategyId): MechanismId | undefined {
  return STRATEGY_TO_MECHANISM[id];
}

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
  // 'unified' = 언어 통합 진단. 'ko'/'en' 은 예전 기록 호환용.
  language: DiagnosticLanguage | 'unified';
  totalWords: number;
  answered: number;
  blocked: number;
  skipped: number;
  overallRate: number; // 0..1 (답한 단어 기준)
  groupStats: GroupStat[];
  mechanismStats: MechanismStat[];
  // 발음 기관(조음 위치)별 막힘 횟수 — ArticulationMap 히트맵용
  zoneBlockage: Record<ArticulationZone, number>;
  // 이번 테스트에서 "막힘"으로 표시된 단어들 — 도전 단어 자동 추가 / 10초 연습용
  blockedWords: string[];
  recommendedStrategies: StrategyId[];
}

const HIGH_MECHANISM_RATE = 0.4;   // 개별 메커니즘이 "높다"고 볼 기준
const GENERAL_PANIC_RATE = 0.5;    // 전반적 막힘 → 호흡/코어 추천 기준

function rate(blocked: number, answered: number): number {
  return answered > 0 ? blocked / answered : 0;
}

function emptyZoneBlockage(): Record<ArticulationZone, number> {
  return { 입술: 0, 혀끝: 0, 입천장: 0, 연구개: 0, 성대: 0 };
}

// 답변 기록으로부터 진단 결과(집계 + 추천)를 계산. id/createdAt 은 저장 시 부여.
// 언어 구분 없이 통합 단어 세트(unifiedDiagnosticWords)로 진행한다.
export function computeDiagnosticResult(
  responses: Record<string, WordResponse>,
): Omit<DiagnosticResult, 'id' | 'createdAt'> {
  const words = unifiedDiagnosticWords;

  const groupAgg = new Map<string, { answered: number; blocked: number }>();
  const mechAgg = new Map<MechanismId, { answered: number; blocked: number }>();
  const zoneBlockage = emptyZoneBlockage();
  const blockedWords: string[] = [];
  let answered = 0, blocked = 0, skipped = 0;

  for (const w of words) {
    const r = responses[w.id];
    if (r === 'skip' || r === undefined) { skipped += 1; continue; }
    const isBlocked = r === 'blocked';
    answered += 1;
    if (isBlocked) { blocked += 1; zoneBlockage[w.zone] += 1; blockedWords.push(w.word); }

    // 표시용 카테고리(displayGroupId)로 집계 — 영어 단어도 한국어 버킷에 합쳐진다
    const g = groupAgg.get(w.displayGroupId) ?? { answered: 0, blocked: 0 };
    groupAgg.set(w.displayGroupId, { answered: g.answered + 1, blocked: g.blocked + (isBlocked ? 1 : 0) });

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
    language: 'unified',
    totalWords: words.length,
    answered,
    blocked,
    skipped,
    overallRate,
    groupStats,
    mechanismStats,
    zoneBlockage,
    blockedWords,
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

// 조음 위치별 해석 문구 (히트맵 아래 표시)
const ZONE_INTERPRETATION: Record<ArticulationZone, string> = {
  성대:   '성대/후두 부위의 막힘 밀도가 가장 높습니다. 발살바 메커니즘 이완(복부 힘 빼기)과 부드러운 시작을 추천합니다.',
  연구개: '연구개(목 안쪽) 부위의 막힘 밀도가 가장 높습니다. 하품-한숨 자세로 후두를 열고 연속 발성을 추천합니다.',
  입술:   '입술(양순) 부위의 막힘 밀도가 가장 높습니다. 입술 힘을 뺀 가벼운 접촉(경조음)을 추천합니다.',
  혀끝:   '혀끝(치조) 부위의 막힘 밀도가 가장 높습니다. 가벼운 접촉과 턱 이완으로 힘을 빼보세요.',
  입천장: '입천장(경구개) 부위의 막힘 밀도가 가장 높습니다. 연속 발성으로 소리를 부드럽게 이어보세요.',
};

// 히트맵 아래에 보여줄 해석. 막힘이 전혀 없으면 null.
export function getZoneInterpretation(
  zoneBlockage: Record<ArticulationZone, number>,
): { topZone: ArticulationZone; text: string } | null {
  const top = [...ZONES].sort((a, b) => zoneBlockage[b] - zoneBlockage[a])[0];
  if (!top || zoneBlockage[top] <= 0) return null;
  return { topZone: top, text: ZONE_INTERPRETATION[top] };
}

// 결과 요약 한 줄 (예: "후두 긴장 유형이 가장 두드러져요 · 75% 막힘")
export function summarizeResult(result: DiagnosticResult): string {
  if (result.answered === 0) return '답한 단어가 없어 분석할 수 없어요.';
  if (result.blocked === 0) return '뚜렷한 막힘 패턴이 발견되지 않았어요. 아주 좋아요! 👏';
  const top = result.mechanismStats.find(m => m.blocked > 0);
  if (!top) return `전체 ${Math.round(result.overallRate * 100)}%에서 막힘이 나타났어요.`;
  return `${top.label} 유형이 가장 두드러져요 · ${Math.round(top.rate * 100)}% 막힘`;
}
