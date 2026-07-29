// 소리 지도(Sound Map Test) 결과 분석 — Part 3.
//
// 핵심 지표는 "압력 임계점": 속삭임 → 목소리 → 녹음 사다리에서 처음 걸리는 지점.
// 속삭임부터 걸리면 소리 자체(운동성)가 어려운 것이고,
// 속삭임·목소리는 멀쩡한데 녹음에서만 걸리면 압박(불안)에 반응하는 것이다.
// 이 둘은 대응 방법이 정반대라 반드시 구분해야 한다.

import { ArticulationZone } from './phonetics';
import {
  SoundCard, SoundKind, SoundResponse, RecordingMode, BlockageType,
} from '../data/soundMap';
import { SimulationResult, caughtWordSet, normalizeWord } from './simulationResult';

// 'simulation' 은 Stage 4(상황 시뮬레이션)에서만 걸린 소리.
// 녹음보다도 높은 압력에서 깨진 것이므로 사다리에서 none 바로 다음에 온다.
// Stage 4 를 하지 않은 지도에는 이 등급이 아예 등장하지 않는다.
export type PressureThreshold =
  | 'none' | 'simulation' | 'recording' | 'normal' | 'whisper' | 'unknown';

// 심각도 팔레트. scripts/validate_palette.js 로 검증했다(명도대·채도·CVD·일반시야 전부 PASS).
// Tailwind v4 는 색을 oklch 로 재정의해서 클래스명으로는 검증한 값이 그대로 나온다는 보장이 없다.
// 그래서 검증한 hex 를 직접 지정한다.
export const THRESHOLD_META: Record<PressureThreshold, {
  label: string;
  color: string;
  tint: string;
  desc: string;
}> = {
  none: {
    label: '안전지대',
    color: '#0d9488',
    tint: 'rgba(13,148,136,0.12)',
    desc: '3단계 모두 술술 나온 소리예요.',
  },
  // 색상 계열을 일부러 사다리(초록→노랑→빨강)에서 떼어 놨다.
  // 이 등급은 압력이 한 칸 더 센 게 아니라 원인의 종류가 다르다 — 상황에 조건화된 반응이다.
  simulation: {
    label: '상황 반응',
    color: '#7c3aed',
    tint: 'rgba(124,58,237,0.12)',
    desc: '녹음 압박까지 통과했는데 상황 속 문장에서 걸린 소리예요. 소리가 아니라 그 상황이 원인이에요.',
  },
  recording: {
    label: '압박 반응',
    color: '#f59e0b',
    tint: 'rgba(245,158,11,0.14)',
    desc: '혼자 말할 땐 괜찮은데 녹음이 켜지면 걸리는 소리예요. 소리보다 압박이 원인이에요.',
  },
  normal: {
    label: '목소리부터',
    color: '#ef4444',
    tint: 'rgba(239,68,68,0.12)',
    desc: '평소 목소리 크기부터 걸리기 시작하는 소리예요.',
  },
  whisper: {
    label: '소리 자체',
    color: '#991b1b',
    tint: 'rgba(153,27,27,0.12)',
    desc: '속삭임에서도 걸리는 소리예요. 압박보다 소리 자체의 난이도가 높아요.',
  },
  unknown: {
    label: '모르겠음',
    color: '#9ca3af',
    tint: 'rgba(156,163,175,0.14)',
    desc: '스스로도 판단하기 어려웠던 소리예요. 인식의 공백도 그 자체로 데이터예요.',
  },
};

export const THRESHOLD_ORDER: PressureThreshold[] =
  ['none', 'simulation', 'recording', 'normal', 'whisper', 'unknown'];

export function emptyThresholdCounts(): Record<PressureThreshold, number> {
  return { none: 0, simulation: 0, recording: 0, normal: 0, whisper: 0, unknown: 0 };
}

/**
 * 저장된 지도의 임계점 카운트를 읽을 때 반드시 통과시킨다.
 * Stage 4 이전에 저장된 지도에는 'simulation' 칸이 없어서, 그대로 쓰면
 * undefined 가 산수에 섞여 합계가 NaN 이 된다.
 */
export function normalizeThresholdCounts(
  counts: Partial<Record<PressureThreshold, number>> | undefined,
): Record<PressureThreshold, number> {
  return { ...emptyThresholdCounts(), ...(counts ?? {}) };
}

// 압력 사다리 (낮은 압력 → 높은 압력)
export type LadderStep = 'whisper' | 'normal' | 'recording';
export const LADDER: LadderStep[] = ['whisper', 'normal', 'recording'];
export const LADDER_LABEL: Record<LadderStep, string> = {
  whisper: '속삭임',
  normal: '목소리',
  recording: '녹음',
};

// 카드 하나의 압력 임계점 — Stage 1~3(속삭임·목소리·녹음)만 본다.
// Stage 4 승격은 computeSoundMapResult 에서 이 결과 위에 얹는다.
export function thresholdOf(r: SoundResponse | undefined): PressureThreshold {
  if (!r) return 'unknown';
  for (const step of LADDER) {
    const a = r[step];
    // 확인되지 않은 단계를 만나면 그 아래 단계들이 "괜찮았다"고 단정할 수 없다.
    // 모르겠음을 술술 나옴 쪽으로 뭉개면 지도가 실제보다 깨끗하게 나온다 — 공백으로 남긴다.
    if (a === undefined || a === 'unknown') return 'unknown';
    if (a === 'partial' || a === 'blocked') return step;
  }
  return 'none';
}

// 예상 긴장도(fear) 대비 실제 결과
export type FearGap = 'over' | 'match' | 'under' | 'unknown';

const HIGH_FEAR = 4;
const LOW_FEAR = 2;

export function fearGapOf(fear: number | undefined, threshold: PressureThreshold): FearGap {
  if (fear === undefined || threshold === 'unknown') return 'unknown';
  if (fear >= HIGH_FEAR && threshold === 'none') return 'over';   // 무섭다고 했는데 다 통과 — 과대예측
  if (fear <= LOW_FEAR && (threshold === 'whisper' || threshold === 'normal')) return 'under';
  return 'match';
}

export interface SoundMapCardResult {
  cardId: string;
  text: string;
  kind: SoundKind;
  groupId: string;
  blockage?: BlockageType;   // 사용자 추가 단어는 유형을 알 수 없다
  fear?: number;
  threshold: PressureThreshold;
  fearGap: FearGap;
  recordingMode?: RecordingMode;
}

export interface StepStat {
  stepId: LadderStep;
  label: string;
  answered: number;    // '모르겠음'/미응답 제외
  smooth: number;
  smoothRate: number;  // 0..1
  unknown: number;
}

export interface SoundMapResult {
  id: string;
  createdAt: string;
  totalCards: number;
  cards: SoundMapCardResult[];
  thresholdCounts: Record<PressureThreshold, number>;
  stepStats: StepStat[];
  // 걸린 소리들의 조음 위치 (자음만 집계 — 모음/음가 없는 초성 'ㅇ' 은 제외)
  zoneBlockage: Record<ArticulationZone, number>;
  // 조음 위치 집계에 실제로 들어간 카드 수. 표본이 적으면 참고용임을 밝히기 위해 쓴다.
  zoneSamples: number;
  pressureSensitiveWords: string[];  // 녹음에서만 걸린 소리
  hardSoundWords: string[];          // 속삭임에서도 걸린 소리
  overpredictedWords: string[];      // 무섭다고 했는데 다 통과한 소리
  unknownWords: string[];            // 판단이 어려웠던 소리
  micCards: number;                  // 실제 마이크 압박이 걸린 카드 수
  manualCards: number;               // 수동(마이크 없이) 압박이었던 카드 수

  // ── Stage 4 (상황 시뮬레이션) — 선택 단계라 없을 수 있다 ──
  // 이 두 필드가 없으면 Stage 4 를 하지 않은 지도다. 읽는 쪽은 항상 없을 수 있다고 가정할 것.
  simulation?: SimulationResult;
  simulationOnlyWords?: string[];    // 1~3단계는 통과했는데 상황에서만 걸린 소리
}

function emptyZoneBlockage(): Record<ArticulationZone, number> {
  return { 입술: 0, 혀끝: 0, 입천장: 0, 연구개: 0, 성대: 0 };
}

// 조음 위치는 데이터셋에 음성학적으로 지정된 zone 을 그대로 쓴다.
// 초성에서 기계적으로 추출하면 모음의 전설/후설을 자음 위치로 잘못 세거나
// 음가 없는 초성 'ㅇ'(아메리카노 등)을 연구개로 세는 오류가 생긴다.
// 사용자가 추가한 단어는 zone 을 알 수 없어 집계에서 빠진다.

// 모든 카드에 예상 긴장도 + 3단계 응답이 있어야 완료로 본다('모르겠음'도 응답으로 인정).
export function isSoundMapComplete(
  cards: SoundCard[],
  responses: Record<string, SoundResponse>,
): boolean {
  if (cards.length === 0) return false;
  return cards.every(c => {
    const r = responses[c.id];
    return !!r && r.fear !== undefined && LADDER.every(s => r[s] !== undefined);
  });
}

export function computeSoundMapResult(
  cards: SoundCard[],
  responses: Record<string, SoundResponse>,
  // Stage 4 를 건너뛰면 undefined — 이때 결과는 Stage 4 도입 전과 완전히 동일하다.
  simulation?: SimulationResult,
): Omit<SoundMapResult, 'id' | 'createdAt'> {
  const zoneBlockage = emptyZoneBlockage();
  const thresholdCounts = emptyThresholdCounts();
  const pressureSensitiveWords: string[] = [];
  const hardSoundWords: string[] = [];
  const overpredictedWords: string[] = [];
  const unknownWords: string[] = [];
  const simulationOnlyWords: string[] = [];
  const caughtInSimulation = caughtWordSet(simulation);
  let micCards = 0;
  let manualCards = 0;
  let zoneSamples = 0;

  const cardResults: SoundMapCardResult[] = cards.map(card => {
    const r = responses[card.id];
    const ladderThreshold = thresholdOf(r);

    // Stage 4 승격 — 1~3단계를 '전부' 통과한 소리만 대상이다.
    // 이미 낮은 압력에서 걸린 소리는 그쪽이 더 근본적인 발견이므로 절대 덮어쓰지 않는다.
    // (임계점 = 가장 낮은 압력에서 처음 걸린 지점, 이라는 불변식을 지킨다)
    const threshold: PressureThreshold =
      ladderThreshold === 'none' && caughtInSimulation.has(normalizeWord(card.text))
        ? 'simulation'
        : ladderThreshold;

    const fearGap = fearGapOf(r?.fear, threshold);

    thresholdCounts[threshold] += 1;

    if (threshold === 'simulation') simulationOnlyWords.push(card.text);
    if (threshold === 'recording') pressureSensitiveWords.push(card.text);
    if (threshold === 'whisper') hardSoundWords.push(card.text);
    if (threshold === 'unknown') unknownWords.push(card.text);
    if (fearGap === 'over') overpredictedWords.push(card.text);

    // 어디선가 걸린 소리만 조음 위치 집계에 반영 (안전지대·판단불가는 제외)
    if (threshold === 'whisper' || threshold === 'normal' || threshold === 'recording') {
      if (card.zone) {
        zoneBlockage[card.zone] += 1;
        zoneSamples += 1;
      }
    }

    if (r?.recordingMode === 'mic') micCards += 1;
    if (r?.recordingMode === 'manual') manualCards += 1;

    return {
      cardId: card.id,
      text: card.text,
      kind: card.kind,
      groupId: card.groupId,
      blockage: card.blockage,
      fear: r?.fear,
      threshold,
      fearGap,
      recordingMode: r?.recordingMode,
    };
  });

  const stepStats: StepStat[] = LADDER.map(stepId => {
    let answered = 0, smooth = 0, unknown = 0;
    for (const card of cards) {
      const a = responses[card.id]?.[stepId];
      if (a === undefined) continue;
      if (a === 'unknown') { unknown += 1; continue; }
      answered += 1;
      if (a === 'smooth') smooth += 1;
    }
    return {
      stepId,
      label: LADDER_LABEL[stepId],
      answered,
      smooth,
      smoothRate: answered > 0 ? smooth / answered : 0,
      unknown,
    };
  });

  return {
    totalCards: cards.length,
    cards: cardResults,
    thresholdCounts,
    stepStats,
    zoneBlockage,
    zoneSamples,
    pressureSensitiveWords,
    hardSoundWords,
    overpredictedWords,
    unknownWords,
    micCards,
    manualCards,
    // Stage 4 를 건너뛰면 두 필드 모두 넣지 않는다 — 예전 지도와 같은 모양이 된다.
    ...(simulation ? { simulation, simulationOnlyWords } : {}),
  };
}

// 결과 한 줄 요약
export function summarizeSoundMap(result: SoundMapResult): string {
  // 예전 지도에는 'simulation' 칸이 없다 — 정규화하지 않으면 합계가 NaN 이 된다.
  const t = normalizeThresholdCounts(result.thresholdCounts);
  const { totalCards } = result;
  const broken = t.recording + t.normal + t.whisper;

  if (broken === 0 && t.unknown === 0 && t.simulation === 0) {
    return `${totalCards}개 소리가 3단계를 모두 통과했어요. 아주 좋아요! 👏`;
  }
  // 사다리는 다 통과했는데 상황에서만 걸린 경우 — 원인이 소리가 아니라는 게 핵심 메시지다.
  if (broken === 0 && t.simulation > 0) {
    return `압력 사다리는 모두 통과했는데, ${t.simulation}개 소리가 상황 속 문장에서 걸렸어요 — 소리가 아니라 상황이 원인이에요.`;
  }
  if (broken === 0) {
    return '걸린 소리는 없었어요. 판단이 어려웠던 소리만 남아 있어요.';
  }
  if (t.recording >= t.normal && t.recording >= t.whisper) {
    return `${t.recording}개 소리가 녹음 압박에서만 걸렸어요 — 소리보다 압박이 원인이에요.`;
  }
  if (t.whisper >= t.normal) {
    return `${t.whisper}개 소리는 속삭임에서도 걸렸어요 — 소리 자체의 난이도가 높아요.`;
  }
  return `${t.normal}개 소리가 평소 목소리부터 걸리기 시작했어요.`;
}
