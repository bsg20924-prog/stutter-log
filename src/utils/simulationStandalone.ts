// 상황 시뮬레이션 단독 실행 — 압력 사다리를 다시 돌지 않고 시뮬레이션만 할 때.
//
// 왜 별도 모듈인가:
// 시뮬레이션 단독으로는 "걸렸다"는 사실만 알 수 있고, 그게 소리가 어려워서인지
// 상황 때문인지는 가를 수 없다. 그 판별의 근거가 압력 사다리(1~3단계)이기 때문이다.
// 그래서 여기서는 **가장 최근에 저장된 소리 지도를 기준선으로 재사용**한다.
// 지도가 없으면 판별을 포기하고 그 사실을 정직하게 남긴다 — 추측으로 채우지 않는다.

import { SoundMapResult, PressureThreshold } from './soundMapResult';
import { SimulationResult, normalizeWord } from './simulationResult';

/** 걸린 단어를 기준 지도에 비춰 셋으로 가른다. */
export interface WordSplit {
  /** 기준 지도에서 '안전지대'였는데 상황에서 걸린 단어 — 상황이 원인 */
  situational: string[];
  /** 기준 지도에서 이미 걸렸던 단어 — 상황 탓이 아니라 원래 어려운 소리 */
  alreadyHard: { word: string; threshold: PressureThreshold }[];
  /** 기준 지도에 없는 단어 — 가릴 근거 자체가 없음 */
  unknown: string[];
}

export function emptyWordSplit(): WordSplit {
  return { situational: [], alreadyHard: [], unknown: [] };
}

/**
 * 기준 지도 대비 승격 판정.
 *
 * 판정 규칙은 소리 지도 안에서 돌 때(computeSoundMapResult)와 **완전히 동일**하다:
 * 사다리를 전부 통과한('none') 단어만 상황 반응으로 본다.
 * 이미 낮은 압력에서 걸렸던 단어는 그쪽이 더 근본적인 문제라 상황 처방을 주면 오진이 된다.
 */
export function splitCaughtWords(
  sim: SimulationResult | undefined,
  reference: SoundMapResult | null | undefined,
): WordSplit {
  const split = emptyWordSplit();
  if (!sim) return split;

  // 기준 지도의 카드 텍스트 → 임계점
  const byWord = new Map<string, PressureThreshold>();
  for (const c of reference?.cards ?? []) {
    const key = normalizeWord(c.text);
    if (key) byWord.set(key, c.threshold);
  }

  for (const word of sim.caughtWords) {
    const key = normalizeWord(word);
    if (!key) continue;
    const threshold = byWord.get(key);
    if (threshold === undefined) {
      split.unknown.push(word);
    } else if (threshold === 'none') {
      split.situational.push(word);
    } else {
      split.alreadyHard.push({ word, threshold });
    }
  }
  return split;
}

/**
 * 단독 실행 결과. 소리 지도(SoundMapResult)와 별도 컬렉션에 저장한다.
 *
 * ⚠️ 오디오는 여기에도 들어가지 않는다 — 녹음은 IndexedDB 에만 있고
 * 이 객체는 순수 JSON 이라 그대로 Firestore 로 나간다.
 */
export interface StandaloneSimulation {
  id: string;
  createdAt: string;
  simulation: SimulationResult;
  /** 판정에 쓴 기준 지도 — 없었으면 undefined */
  referenceMapId?: string;
  referenceMapAt?: string;
  /** 기준 지도 대비 분류 결과 (저장 시점 기준으로 굳혀 둔다) */
  situationalWords: string[];
  alreadyHardWords: string[];
  unmatchedWords: string[];
}

export function buildStandaloneSimulation(
  simulation: SimulationResult,
  reference: SoundMapResult | null | undefined,
): Omit<StandaloneSimulation, 'id' | 'createdAt'> {
  const split = splitCaughtWords(simulation, reference);
  return {
    simulation,
    // 나중에 기준 지도를 다시 만들어도 "그때 무엇에 비춰 판단했는지"가 남아야 한다.
    ...(reference ? { referenceMapId: reference.id, referenceMapAt: reference.createdAt } : {}),
    situationalWords: split.situational,
    alreadyHardWords: split.alreadyHard.map(a => a.word),
    unmatchedWords: split.unknown,
  };
}

/** 단독 실행 한 줄 요약 */
export function summarizeStandalone(run: StandaloneSimulation): string {
  const caught = run.simulation.scenarios.reduce((n, s) => n + s.caught, 0);
  const answered = run.simulation.scenarios.reduce((n, s) => n + s.answered, 0);

  if (answered === 0) return '평가한 문장이 없어요.';
  if (caught === 0) return `문장 ${answered}개를 상황 속에서 모두 무사히 말했어요. 👏`;

  if (!run.referenceMapId) {
    return `문장 ${caught}개에서 걸렸어요. 소리 지도를 만들면 상황 탓인지 소리 탓인지 가릴 수 있어요.`;
  }
  if (run.situationalWords.length > 0) {
    return `${run.situationalWords.length}개 단어가 혼자서는 잘 나오는데 상황에서만 걸렸어요 — 상황이 원인이에요.`;
  }
  return `문장 ${caught}개에서 걸렸는데, 모두 소리 지도에서도 걸렸던 소리예요 — 상황보다 소리가 원인이에요.`;
}
