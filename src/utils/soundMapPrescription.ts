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
