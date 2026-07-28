// 소리 지도 만들기(Sound Map Test) — 3단계 압박 사다리 데이터/타입.
// Part 2: 3단계에서 실제 마이크 녹음으로 압박을 건다. 분석/저장 로직은 이후 파트에서 추가.

export type SoundKind = 'vowel' | 'consonant' | 'custom';

export interface SoundCard {
  id: string;
  text: string;   // 화면에 크게 표시할 소리/단어
  kind: SoundKind;
}

// 말하기 단계의 자가 평가.
// 'unknown'(모르겠음)은 회피용 건너뛰기가 아니라 "스스로도 판단이 안 됐다"는 실제 데이터다.
// 몸 감각은 원래 불확실하므로, 억지로 고르게 해서 지도를 오염시키는 것보다 공백으로 남기는 편이 정확하다.
export type Assessment = 'smooth' | 'partial' | 'blocked' | 'unknown';

export const ASSESSMENTS: { value: Assessment; label: string; cls: string; activeCls: string }[] = [
  { value: 'smooth',  label: '술술 나옴', cls: 'text-teal-600',   activeCls: 'bg-teal-500 text-white border-teal-500' },
  { value: 'partial', label: '걸림',      cls: 'text-amber-600',  activeCls: 'bg-amber-400 text-white border-amber-400' },
  { value: 'blocked', label: '막힘',      cls: 'text-red-600',    activeCls: 'bg-red-500 text-white border-red-500' },
];

// 위 3개 아래에 따로 두는 4번째 선택지 (3열 그리드는 그대로 유지)
export const UNKNOWN_ASSESSMENT: { value: Assessment; label: string } = {
  value: 'unknown',
  label: '모르겠음',
};

// 4단계 (Step 0~3)
export type SoundStepId = 'fear' | 'whisper' | 'normal' | 'recording';

export interface SoundStep {
  id: SoundStepId;
  index: number;      // 0~3
  short: string;      // 스테퍼용 짧은 라벨
  title: string;      // 카드 상단 안내
  prompt: string;     // 행동 지시
}

export const SOUND_STEPS: SoundStep[] = [
  { id: 'fear',      index: 0, short: '예상 긴장', title: '말하기 전, 예상 긴장도', prompt: '이 소리, 얼마나 어렵게 느껴지나요?' },
  { id: 'whisper',   index: 1, short: '속삭임',    title: '1단계 · 속삭임',        prompt: '속삭이듯 아주 작게 소리 내보세요.' },
  { id: 'normal',    index: 2, short: '목소리',    title: '2단계 · 목소리',        prompt: '이제 평소 목소리로 말해보세요.' },
  { id: 'recording', index: 3, short: '녹음',      title: '3단계 · 녹음 압박',     prompt: '녹음이 도는 상태에서 그대로 말해보세요.' },
];

// 3단계에서 실제 마이크 압박이 걸렸는지 — 오디오 자체는 절대 저장하지 않고,
// 나중에 "진짜 녹음 압박"과 "수동(마이크 없이) 압박"을 구분해 분석하기 위한 표시만 남긴다.
export type RecordingMode = 'mic' | 'manual';

// 카드 하나에 대한 응답 (단계별)
export interface SoundResponse {
  fear?: number;            // 1~5
  whisper?: Assessment;
  normal?: Assessment;
  recording?: Assessment;
  recordingMode?: RecordingMode;
}

// ── 기본 소리 세트 ─────────────────────────────────────────
const VOWELS = ['아', '어', '오', '우', '으', '이'];

// 평음 / 된소리 / 거센소리 대비 (핵심 자음 조합)
const CONSONANTS = ['가', '까', '카', '바', '빠', '파', '사', '자'];

export function buildDefaultCards(): SoundCard[] {
  return [
    ...VOWELS.map((t, i): SoundCard => ({ id: `vowel-${i + 1}`, text: t, kind: 'vowel' })),
    ...CONSONANTS.map((t, i): SoundCard => ({ id: `consonant-${i + 1}`, text: t, kind: 'consonant' })),
  ];
}

// 사용자가 추가하는 "무서운 단어" 추천 칩
export const SUGGESTED_CUSTOM_WORDS = ['아메리카노', '전화', '제 이름'];

export function makeCustomCard(text: string, seq: number): SoundCard {
  return { id: `custom-${seq}-${text}`, text, kind: 'custom' };
}

export const KIND_LABEL: Record<SoundKind, string> = {
  vowel: '모음',
  consonant: '자음',
  custom: '나의 단어',
};
