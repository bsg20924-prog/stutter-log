// 소리 지도(Sound Map Test) — 3단계 압박 사다리 데이터/타입.
//
// 구 자가 진단 테스트의 28개 음운 데이터셋(단모음·이중모음·평음/된소리/거센소리·
// 비음/유음·마찰/파찰음 + 영어 대조군)을 이 카드 세트로 흡수했다.
// 각 카드는 "언제 걸리는가"(압력 임계점)를 재기 위한 소리이자,
// "왜 걸리는가"(막힘 유형)를 분류하기 위한 태그를 함께 들고 다닌다.

import { ArticulationZone } from '../utils/phonetics';

// 막힘 유형 — 구 진단 모듈의 mechanism 을 3종으로 정리한 것.
//   airway       (구 airflow-glottal)      공기 흐름 / 성문 잠김
//   laryngeal    (구 laryngeal-tension)    후두 긴장
//   articulation (구 articulatory-forcing) 조음 기관 힘주기
export type BlockageType = 'airway' | 'laryngeal' | 'articulation';

export type SoundKind = 'vowel' | 'consonant' | 'custom';

export interface SoundCard {
  id: string;
  text: string;               // 화면에 크게 표시할 소리/단어
  kind: SoundKind;
  groupId: string;            // 표시용 음운 그룹
  blockage?: BlockageType;    // 막힘 유형 (사용자 추가 단어는 알 수 없음)
  zone?: ArticulationZone;    // 조음 위치 (사용자 추가 단어는 알 수 없음)
}

export interface SoundGroup {
  id: string;
  label: string;
  sublabel: string;
}

// 지도에서의 표시 순서 = 이 배열 순서
export const SOUND_GROUPS: SoundGroup[] = [
  { id: 'monophthong',        label: '단모음',        sublabel: '모음 · 공기 흐름 시작' },
  { id: 'diphthong',          label: '이중모음',      sublabel: '활음 · 성대 진입' },
  { id: 'plain-plosive',      label: '평음',          sublabel: '예사소리 파열음 (ㅂ/ㄷ/ㄱ)' },
  { id: 'tense-plosive',      label: '된소리',        sublabel: '경음 파열음 (ㅃ/ㄸ/ㄲ)' },
  { id: 'aspirated-plosive',  label: '거센소리',      sublabel: '격음 파열음 (ㅍ/ㅌ/ㅋ)' },
  { id: 'nasal-liquid',       label: '비음·유음',     sublabel: '울림소리 (ㄴ/ㄹ/ㅁ)' },
  { id: 'fricative-affricate',label: '마찰·파찰음',   sublabel: '마찰·파찰음 (ㅅ/ㅈ/ㅊ)' },
  { id: 'custom',             label: '나의 단어',     sublabel: '내가 추가한 무서운 단어' },
];

export function getSoundGroup(id: string): SoundGroup | undefined {
  return SOUND_GROUPS.find(g => g.id === id);
}

// [단어, 막힘 유형, 조음 위치]
type Seed = [text: string, blockage: BlockageType, zone: ArticulationZone];

// 한국어 16 + 영어 12 = 28개. 구 진단 모듈의 통합 세트를 그대로 옮겼다.
// 한국어 파열음은 조음 방법(평음/된소리/거센소리)으로 묶이지만 실제 막힘은
// 첫소리의 조음 위치에서 일어나므로, ㄱ/ㅋ(연구개음)은 그룹과 무관하게 후두 긴장으로 분류한다.
const SEED: Record<string, Seed[]> = {
  'monophthong': [
    ['아침', 'airway', '성대'], ['오리', 'airway', '성대'], ['Apple', 'airway', '성대'],
  ],
  'diphthong': [
    ['야구', 'airway', '성대'], ['의사', 'airway', '성대'], ['Ice', 'airway', '성대'],
  ],
  'plain-plosive': [
    ['바다', 'articulation', '입술'], ['다리', 'articulation', '혀끝'],
    ['가방', 'laryngeal', '연구개'], ['Door', 'articulation', '혀끝'],
  ],
  'tense-plosive': [
    ['뿌리', 'articulation', '입술'], ['코끼리', 'laryngeal', '연구개'],
  ],
  'aspirated-plosive': [
    ['파도', 'articulation', '입술'], ['태양', 'articulation', '혀끝'],
    ['기차', 'laryngeal', '연구개'], ['Paper', 'articulation', '입술'],
    ['Table', 'articulation', '혀끝'], ['Coffee', 'laryngeal', '연구개'],
    ['King', 'laryngeal', '연구개'], ['Play', 'articulation', '입술'],
    ['Clock', 'laryngeal', '연구개'],
  ],
  'nasal-liquid': [
    ['나무', 'articulation', '혀끝'], ['모자', 'articulation', '입술'],
  ],
  'fricative-affricate': [
    ['사과', 'airway', '혀끝'], ['치마', 'airway', '입천장'],
    ['Sun', 'airway', '혀끝'], ['Fish', 'airway', '입술'],
    ['Street', 'articulation', '혀끝'],
  ],
};

// 모음 그룹은 kind='vowel', 나머지는 'consonant'
const VOWEL_GROUPS = new Set(['monophthong', 'diphthong']);

export function buildDefaultCards(): SoundCard[] {
  const cards: SoundCard[] = [];
  for (const group of SOUND_GROUPS) {
    const seed = SEED[group.id];
    if (!seed) continue;
    seed.forEach(([text, blockage, zone], i) => {
      cards.push({
        id: `${group.id}-${i + 1}`,
        text,
        kind: VOWEL_GROUPS.has(group.id) ? 'vowel' : 'consonant',
        groupId: group.id,
        blockage,
        zone,
      });
    });
  }
  return cards;
}

export const DEFAULT_CARD_COUNT = Object.values(SEED).reduce((n, s) => n + s.length, 0);

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

// 5단계 (Step 0~4)
export type SoundStepId = 'fear' | 'whisper' | 'normal' | 'recording' | 'situation';

export interface SoundStep {
  id: SoundStepId;
  index: number;      // 0~4
  short: string;      // 스테퍼용 짧은 라벨
  title: string;      // 카드 상단 안내
  prompt: string;     // 행동 지시
}

export const SOUND_STEPS: SoundStep[] = [
  { id: 'fear',      index: 0, short: '예상 긴장', title: '말하기 전, 예상 긴장도', prompt: '이 소리, 얼마나 어렵게 느껴지나요?' },
  { id: 'whisper',   index: 1, short: '속삭임',    title: '1단계 · 속삭임',        prompt: '속삭이듯 아주 작게 소리 내보세요.' },
  { id: 'normal',    index: 2, short: '목소리',    title: '2단계 · 목소리',        prompt: '이제 평소 목소리로 말해보세요.' },
  { id: 'recording', index: 3, short: '녹음',      title: '3단계 · 녹음 압박',     prompt: '녹음이 도는 상태에서 그대로 말해보세요.' },
  // 압력 사다리의 꼭대기. 같은 소리를 '상황 속 문장'으로 말한다.
  // ⚠️ 이 단계는 임계점 계산 루프(LADDER)에 넣지 않는다 — 넣으면 상황을 건너뛴 카드가
  // thresholdOf 에서 unknown 으로 떨어져 1~3단계 결과까지 통째로 날아간다.
  { id: 'situation', index: 4, short: '상황',      title: '4단계 · 실제 상황',     prompt: '상대의 말을 듣고, 아래 문장으로 답해보세요.' },
];

// 3단계에서 실제 마이크 압박이 걸렸는지 — 오디오 자체는 절대 저장하지 않고,
// 나중에 "진짜 녹음 압박"과 "수동(마이크 없이) 압박"을 구분해 분석하기 위한 표시만 남긴다.
export type RecordingMode = 'mic' | 'manual';

/** 4단계에서 그 카드에 배정된 상황 문장 */
export interface SituationAssignment {
  scenarioId: string;
  scenarioLabel: string;
  ttsPrompt: string;
  sentence: string;
  /** 문장을 어떻게 만들었는지 — Gemini 가 만든 문장과 템플릿 문장의 품질 차이를 나중에 구분하기 위해 */
  source: 'gemini' | 'template';
  /** 배경음/상황 표시용. 시나리오 데이터에서 함께 넘어온다(중복 매핑을 두지 않기 위해). */
  ambientKey?: 'cafe' | 'office' | 'phone';
}

// 카드 하나에 대한 응답 (단계별)
export interface SoundResponse {
  fear?: number;            // 1~5
  whisper?: Assessment;
  normal?: Assessment;
  recording?: Assessment;
  recordingMode?: RecordingMode;
  // ── 4단계 (상황) — 선택이라 없을 수 있다 ──
  situation?: Assessment;
  situationScenarioId?: string;
  situationScenarioLabel?: string;
  situationSentence?: string;
  situationSource?: 'gemini' | 'template';
}

// 사용자가 추가하는 "무서운 단어" 추천 칩
export const SUGGESTED_CUSTOM_WORDS = ['아메리카노', '전화', '제 이름'];

export function makeCustomCard(text: string, seq: number): SoundCard {
  return { id: `custom-${seq}-${text}`, text, kind: 'custom', groupId: 'custom' };
}

export const KIND_LABEL: Record<SoundKind, string> = {
  vowel: '모음',
  consonant: '자음',
  custom: '나의 단어',
};
