// 막힘 유형(왜) × 압력 임계점(언제) → 실전 전략(무엇).
//
// 구 자가 진단 모듈은 "왜 막히는가"(공기/후두/조음)만 알려줬고,
// 소리 지도는 "언제 걸리는가"(속삭임/목소리/녹음)만 알려줬다.
// 둘을 곱해야 처방이 구체적으로 나온다:
//   같은 후두 긴장이라도 속삭임부터 걸리면 후두를 여는 연습이 먼저고,
//   녹음에서만 걸리면 후두가 아니라 각성 수준을 다뤄야 한다.

import { StrategyId } from '../types';
import { BlockageType } from '../data/soundMap';
import { PressureThreshold } from './soundMapResult';
import { SimulationResult, normalizeWord } from './simulationResult';

export const BLOCKAGE_META: Record<BlockageType, {
  label: string;
  cause: string;
  strategies: StrategyId[];   // 이 유형의 기본 전략 (구 MECHANISMS 매핑 유지)
}> = {
  airway: {
    label: '공기 흐름 / 성문 잠김',
    cause: '모음·이중모음 시작에서 성대(성문)가 닫혀 공기가 나오지 못하는 패턴이에요.',
    strategies: ['easy-onset', 'h-breath-starter'],
  },
  laryngeal: {
    label: '후두 긴장',
    cause: 'ㄱ/ㅋ·K/G 같은 목 안쪽 소리에서 후두 근육이 과도하게 조이는 패턴이에요.',
    strategies: ['yawn-sigh', 'continuous-phonation'],
  },
  articulation: {
    label: '조음 기관 힘주기',
    cause: 'ㅂ/ㄷ·P/T 같은 입술·혀 파열음에서 지나치게 힘을 주어 막는 패턴이에요.',
    strategies: ['light-contact', 'jaw-shoulder-drop'],
  },
};

export const BLOCKAGE_ORDER: BlockageType[] = ['airway', 'laryngeal', 'articulation'];

// 전략 → 소속 막힘 유형 (BLOCKAGE_META 의 역방향). 연습 단어를 고를 때 사용.
const STRATEGY_TO_BLOCKAGE: Partial<Record<StrategyId, BlockageType>> = Object.fromEntries(
  (Object.entries(BLOCKAGE_META) as [BlockageType, { strategies: StrategyId[] }][])
    .flatMap(([type, { strategies }]) => strategies.map(s => [s, type])),
);

export function blockageOfStrategy(id: StrategyId): BlockageType | undefined {
  return STRATEGY_TO_BLOCKAGE[id];
}

// 임계점이 알려주는 것: 어느 층위를 먼저 건드려야 하는가.
type BrokenThreshold = 'whisper' | 'normal' | 'recording';

const THRESHOLD_FRAMING: Record<BrokenThreshold, { headline: string; reason: string }> = {
  whisper: {
    headline: '소리 자체가 어려운 단계',
    reason: '속삭임에서도 걸렸어요. 압박이 아니라 그 소리를 만드는 동작 자체가 부담이라는 뜻이라, 유형에 맞는 발성 방법부터 바꿔야 해요.',
  },
  normal: {
    headline: '목소리를 얹을 때 걸리는 단계',
    reason: '속삭임은 통과했지만 성대를 울리는 순간 걸렸어요. 발성 방법에 속도 조절을 더하면 넘길 수 있어요.',
  },
  recording: {
    headline: '압박에만 반응하는 단계',
    reason: '혼자서는 문제없이 나왔어요. 소리가 아니라 보여진다는 긴장이 원인이라, 발성 교정보다 시작 전 루틴이 효과적이에요.',
  },
};

// 압박 단계에서만 걸릴 때 얹는 전략 — 발성 교정이 아니라 각성/타이밍을 다룬다.
const PRESSURE_STRATEGIES: StrategyId[] = ['intentional-pause', 'passive-exhale'];

export interface Prescription {
  blockage: BlockageType;
  threshold: BrokenThreshold;
  words: string[];
  strategies: StrategyId[];
  headline: string;
  reason: string;
}

// 유형 × 임계점 → 전략 목록 (최대 3개, 중복 제거)
export function prescribe(blockage: BlockageType, threshold: BrokenThreshold): StrategyId[] {
  const base = BLOCKAGE_META[blockage].strategies;
  if (threshold === 'recording') {
    // 압박이 원인 — 각성 조절이 먼저고, 유형 전략은 보조로 하나만 붙인다.
    return [...PRESSURE_STRATEGIES, base[0]];
  }
  if (threshold === 'normal') {
    return [base[0], 'reduced-rate'];
  }
  return [...base];   // whisper — 유형 전략을 정면으로
}

export function isBrokenThreshold(t: PressureThreshold): t is BrokenThreshold {
  return t === 'whisper' || t === 'normal' || t === 'recording';
}

// 걸린 카드들을 (임계점 × 유형)으로 묶어 처방 목록을 만든다.
// 정렬: 낮은 압력에서 걸린 것 = 더 근본적인 문제이므로 먼저, 그다음 단어 수가 많은 순.
const THRESHOLD_PRIORITY: Record<BrokenThreshold, number> = { whisper: 0, normal: 1, recording: 2 };

export function buildPrescriptions(
  cards: { text: string; threshold: PressureThreshold; blockage?: BlockageType }[],
): Prescription[] {
  const buckets = new Map<string, Prescription>();

  for (const c of cards) {
    // 사용자가 추가한 단어는 유형을 알 수 없어 처방 대상에서 빠진다.
    if (!c.blockage || !isBrokenThreshold(c.threshold)) continue;
    const key = `${c.threshold}:${c.blockage}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.words.push(c.text);
      continue;
    }
    const framing = THRESHOLD_FRAMING[c.threshold];
    buckets.set(key, {
      blockage: c.blockage,
      threshold: c.threshold,
      words: [c.text],
      strategies: prescribe(c.blockage, c.threshold),
      headline: framing.headline,
      reason: framing.reason,
    });
  }

  return [...buckets.values()].sort((a, b) =>
    THRESHOLD_PRIORITY[a.threshold] - THRESHOLD_PRIORITY[b.threshold] ||
    b.words.length - a.words.length);
}

// ── Stage 4: 상황에서만 걸린 것에 대한 처방 ────────────────────────
//
// 왜 위의 buildPrescriptions 를 재사용하지 않는가:
// 저 함수는 (임계점 × 막힘 유형)으로 묶는다. 그런데 상황에서만 걸리는 것의 원인은
// 공기·후두·조음이 아니라 그 상황에 조건화된 반응이다 — 막힘 유형으로 묶으면 의미가 없다.
// 대신 '어느 상황이었는가'로 묶고, 발성 교정이 아니라 노출/둔감화를 처방한다.

// 노출 사다리: 같은 문장을 현실감만 조금씩 올려가며 반복한다.
// 핵심은 '불안이 내려갈 때까지 머무는 것'이다 — 불안이 높은 상태에서 그만두면
// 그 상황이 위험하다는 학습만 강화된다.
const EXPOSURE_LADDER: Record<string, string[]> = {
  'order-cafe': [
    '혼자 있을 때 그 문장을 소리 내어 5번 말하기',
    '거울을 보거나 영상을 켜 놓고 같은 문장 말하기',
    '한가한 시간대에 실제로 주문해 보기',
    '붐비는 시간대에 같은 주문 반복하기',
  ],
  'checkout': [
    '계산대에서 할 답변을 혼자 5번 말하기',
    '무인 계산대에서 소리 내어 혼잣말로 연습하기',
    '한가한 편의점에서 짧게 답해 보기',
    '줄이 있는 계산대에서 같은 답 반복하기',
  ],
  'introduction': [
    '혼자서 이름과 소개 문장을 5번 말하기',
    '스스로를 촬영하며 소개하기',
    '가까운 사람 한 명 앞에서 소개하기',
    '처음 만나는 자리에서 먼저 소개하기',
  ],
  'interview': [
    '예상 질문에 답하는 문장을 혼자 5번 말하기',
    '녹화하며 답하고 다시 보기',
    '아는 사람에게 질문을 부탁해 답하기',
    '준비 없이 즉석 질문을 받아 답하기',
  ],
  'phone-reservation': [
    '통화 문장을 혼자 소리 내어 5번 말하기',
    '가까운 사람에게 전화해 같은 문장으로 시작하기',
    '자동응답(ARS) 안내로 걸어 실제 통화 감각 익히기',
    '실제 가게에 예약 전화 걸기',
  ],
  'stranger': [
    '길 묻는 문장을 혼자 5번 말하기',
    '가게 직원처럼 말 걸기 쉬운 상대에게 물어보기',
    '길에서 한 사람에게 짧게 물어보기',
    '바쁜 시간대·붐비는 곳에서 물어보기',
  ],
  'peers': [
    '하려던 말을 혼자 소리 내어 5번 말하기',
    '친구 한 명과 둘이서 그 얘기 꺼내기',
    '서너 명 있는 자리에서 먼저 말 꺼내기',
    '여러 명이 떠드는 중에 끼어들어 말하기',
  ],
  'family': [
    '하려던 말을 혼자 소리 내어 5번 말하기',
    '가장 편한 가족 한 명에게 말하기',
    '식사 자리처럼 여러 명 있을 때 말하기',
    '급하거나 피곤한 상태에서도 같은 말 하기',
  ],
};

const DEFAULT_EXPOSURE: string[] = [
  '혼자 있을 때 그 문장을 소리 내어 5번 말하기',
  '녹음을 켜고 같은 문장 말하기',
  '가까운 사람 앞에서 말하기',
  '실제 상황에서 말하기',
];

// 상황 반응에는 발성 교정이 아니라 시작 루틴과 회복 루틴을 붙인다.
// 조음/후두를 건드리는 전략은 원인이 아닌 곳을 고치게 만든다.
const EXPOSURE_STRATEGIES: StrategyId[] = ['intentional-pause', 'pause-and-release'];

export interface SimulationPrescription {
  scenarioId: string;
  scenarioLabel: string;
  /** 1~3단계는 통과했는데 이 상황에서 걸린 단어 */
  words: string[];
  /** 실제로 걸렸던 문장 원문 */
  sentences: string[];
  strategies: StrategyId[];
  headline: string;
  reason: string;
  exposureSteps: string[];
}

const SIMULATION_HEADLINE = '상황에만 반응하는 단계';
const SIMULATION_REASON =
  '속삭임도 목소리도 녹음도 통과한 소리인데, 상황이 주어지자 걸렸어요. ' +
  '소리를 만드는 동작에는 문제가 없다는 뜻이라, 발성을 고치는 대신 ' +
  '그 상황에 조금씩 익숙해지는 쪽이 맞아요.';

/**
 * 상황에서만 걸린 단어들을 시나리오별로 묶어 노출 처방을 만든다.
 *
 * @param simulation      Stage 4 결과 (없으면 빈 배열)
 * @param simulationWords 'simulation' 등급으로 승격된 단어 — 1~3단계를 통과한 것만 들어 있다.
 *                        이 필터가 없으면 원래 어려웠던 소리까지 노출 처방을 받아
 *                        "발성 연습이 필요한 소리"를 "상황만 익히면 되는 소리"로 오진하게 된다.
 */
/** 두 경로(카드 4단계 / 별도 시뮬레이션)가 공유하는 최소 입력 */
export interface SituationHit {
  word: string;
  scenarioId: string;
  scenarioLabel: string;
  sentence: string;
}

/** 상황에서 걸린 항목들을 시나리오별로 묶어 노출 처방을 만든다. */
export function buildSituationPrescriptions(hits: SituationHit[]): SimulationPrescription[] {
  const buckets = new Map<string, SimulationPrescription>();

  for (const h of hits) {
    if (!h.word || !h.scenarioId) continue;
    const existing = buckets.get(h.scenarioId);
    if (existing) {
      if (!existing.words.some(x => normalizeWord(x) === normalizeWord(h.word))) {
        existing.words.push(h.word);
      }
      if (h.sentence && !existing.sentences.includes(h.sentence)) existing.sentences.push(h.sentence);
      continue;
    }
    buckets.set(h.scenarioId, {
      scenarioId: h.scenarioId,
      scenarioLabel: h.scenarioLabel,
      words: [h.word],
      sentences: h.sentence ? [h.sentence] : [],
      strategies: EXPOSURE_STRATEGIES,
      headline: SIMULATION_HEADLINE,
      reason: SIMULATION_REASON,
      exposureSteps: EXPOSURE_LADDER[h.scenarioId] ?? DEFAULT_EXPOSURE,
    });
  }

  // 걸린 단어가 많은 상황부터 — 가장 자주 발목을 잡는 상황을 먼저 다루게 한다.
  return [...buckets.values()].sort((a, b) => b.words.length - a.words.length);
}

/**
 * 소리 지도 카드에서 직접 뽑는다 (4단계가 사다리에 들어온 뒤의 기본 경로).
 * 카드가 곧 단어이므로 단어 매칭이 필요 없다 — 승격 판정은 이미 threshold 에 반영돼 있다.
 */
export function buildSituationPrescriptionsFromCards(
  cards: {
    text: string;
    threshold: PressureThreshold;
    situationScenarioId?: string;
    situationScenarioLabel?: string;
    situationSentence?: string;
  }[],
): SimulationPrescription[] {
  return buildSituationPrescriptions(
    cards
      .filter(c => c.threshold === 'simulation' && c.situationScenarioId)
      .map(c => ({
        word: c.text,
        scenarioId: c.situationScenarioId!,
        scenarioLabel: c.situationScenarioLabel ?? '상황',
        sentence: c.situationSentence ?? '',
      })),
  );
}

/**
 * 별도 시뮬레이션(단독 실행/구 Stage 4) 결과에서 뽑는다.
 *
 * @param simulationWords 'simulation' 등급으로 승격된 단어 — 1~3단계를 통과한 것만 들어 있다.
 *                        이 필터가 없으면 원래 어려웠던 소리까지 노출 처방을 받아
 *                        "발성 연습이 필요한 소리"를 "상황만 익히면 되는 소리"로 오진하게 된다.
 */
export function buildSimulationPrescriptions(
  simulation: SimulationResult | undefined,
  simulationWords: string[] | undefined,
): SimulationPrescription[] {
  if (!simulation) return [];

  const promoted = new Set((simulationWords ?? []).map(normalizeWord).filter(Boolean));
  if (promoted.size === 0) return [];

  const hits: SituationHit[] = [];
  for (const s of simulation.sentences) {
    if (s.assessment !== 'partial' && s.assessment !== 'blocked') continue;
    for (const w of s.sourceWords) {
      if (!promoted.has(normalizeWord(w))) continue;
      hits.push({
        word: w,
        scenarioId: s.scenarioId,
        scenarioLabel: s.scenarioLabel,
        sentence: s.text,
      });
    }
  }
  return buildSituationPrescriptions(hits);
}
