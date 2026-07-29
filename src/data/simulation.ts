// 상황 시뮬레이션(Stage 4) — 시나리오/문장 데이터.
//
// Stage 1~3(속삭임·목소리·녹음)은 "소리 하나"를 단위로 압력을 올린다.
// Stage 4 는 단위가 다르다: 상대의 말이 먼저 오고, 그에 대한 "문장"으로 답한다.
// 여기서만 걸리는 단어는 소리가 어려운 것도, 녹음 압박에 눌린 것도 아니라
// 그 상황 자체에 조건화된 반응이다 — 그래서 처방도 노출/둔감화로 갈라진다.
//
// Stage 1~3 의 데이터 구조(SOUND_STEPS, SoundResponse)는 이 파일과 완전히 분리되어 있고
// 어떤 것도 수정하지 않는다. Stage 4 는 선택 단계이고, 건너뛴 지도도 정상 결과다.

// 배경 상황 키.
// ⚠️ 현재 실제 배경음은 재생하지 않는다 — 저장소에 오디오 에셋이 없고,
// 합성음으로 카페 소음을 흉내 내면 "진짜 상황"이라는 착각만 준다.
// 지금은 화면에 상황 맥락을 표시하는 용도로만 쓰고, 나중에 음원을 얹을 자리로 남긴다.
export type AmbientKey = 'cafe' | 'office' | 'phone';

export const AMBIENT_META: Record<AmbientKey, { label: string; emoji: string }> = {
  cafe:   { label: '카페 · 주변이 시끄러움', emoji: '☕' },
  office: { label: '회의실 · 여러 명이 봄',  emoji: '🏢' },
  phone:  { label: '통화 · 얼굴이 안 보임',  emoji: '📞' },
};

export type SentenceOrigin = 'template' | 'challenge' | 'custom';

export interface SimSentence {
  id: string;
  text: string;
  /**
   * 이 문장이 어느 도전 단어로 만들어졌는지.
   * 결과 분석에서 "문장이 걸림" → "이 단어가 상황에서 걸림" 으로 되돌리는 유일한 경로다.
   * 직접 입력 문장은 비어 있다 (어떤 소리 카드와도 연결할 수 없다).
   */
  sourceWords: string[];
  origin: SentenceOrigin;
}

export interface SimScenario {
  id: string;
  label: string;
  ttsPrompt: string;                 // 상대가 먼저 하는 말
  responseSentences: SimSentence[];  // 사용자가 답할 문장들
  ambientKey?: AmbientKey;
}

// 시나리오 정의 — 문장은 실행 시점에 도전 단어로 채워지므로 여기서는 틀만 잡는다.
interface ScenarioSeed {
  id: string;
  label: string;
  ttsPrompt: string;
  ambientKey?: AmbientKey;
  /** 도전 단어를 끼워 넣을 틀. {word} 자리에 단어가 들어간다. */
  templates: string[];
  /** 도전 단어가 없을 때 쓰는 기본 문장 */
  fallbacks: string[];
}

const SCENARIO_SEEDS: ScenarioSeed[] = [
  {
    id: 'order-cafe',
    label: '주문 / 카페',
    ttsPrompt: '주문 도와드릴까요?',
    ambientKey: 'cafe',
    // 틀은 '어떤 명사가 와도 말이 되는' 것만 쓴다.
    // '{word} 한 잔' 처럼 단위가 붙으면 '삼겹살 한 잔' 같은 문장이 나와서
    // 사용자가 웃어버리고, 그 순간 상황 압박이 사라져 데이터가 무의미해진다.
    templates: [
      '{word} 주세요.',
      '{word} 하나 주세요.',
      '{word} 포장해 주세요.',
    ],
    fallbacks: [
      '아메리카노 한 잔 주세요.',
      '따뜻한 걸로 주세요.',
      '포장해 주세요.',
    ],
  },
  {
    id: 'introduction',
    label: '자기소개',
    ttsPrompt: '자기소개 부탁드립니다.',
    ambientKey: 'office',
    // '안녕하세요, {word}입니다' 는 문법은 맞지만 이름이 아닌 단어가 오면 뜻이 무너진다.
    // 조사(을/를·이/가)가 필요 없는 틀만 골라 받침 유무와 무관하게 항상 자연스럽게 만든다.
    templates: [
      '제 관심사는 {word}입니다.',
      '{word} 쪽 일을 하고 있습니다.',
      '{word} 이야기부터 해볼게요.',
    ],
    fallbacks: [
      '안녕하세요, 반갑습니다.',
      '잘 부탁드립니다.',
      '만나서 반갑습니다.',
    ],
  },
  {
    id: 'phone-reservation',
    label: '전화 예약',
    ttsPrompt: '여보세요, 무엇을 도와드릴까요?',
    ambientKey: 'phone',
    templates: [
      '{word} 예약하려고 하는데요.',
      '{word} 되나요?',
      '{word} 문의드리려고 전화했습니다.',
    ],
    fallbacks: [
      '예약하려고 하는데요.',
      '내일 저녁 가능한가요?',
      '두 명이요.',
    ],
  },
];

export const SCENARIO_COUNT = SCENARIO_SEEDS.length;

/** 시나리오 하나당 만들 문장 수 */
const SENTENCES_PER_SCENARIO = 3;

function makeSentence(
  scenarioId: string,
  seq: number,
  text: string,
  sourceWords: string[],
  origin: SentenceOrigin,
): SimSentence {
  return { id: `${scenarioId}-${origin}-${seq}`, text, sourceWords, origin };
}

/**
 * 도전 단어를 시나리오 틀에 끼워 넣어 응답 문장을 만든다.
 *
 * 도전 단어가 모자라면 기본 문장으로 채운다 — 시나리오마다 문장 수를 맞춰야
 * "3개 중 2개에서 걸림" 같은 비교가 성립한다.
 */
export function buildScenarios(
  challengeWords: string[],
  customSentences: string[] = [],
): SimScenario[] {
  // 단어가 시나리오마다 똑같은 순서로 반복되지 않게 시나리오별로 시작 위치를 어긋나게 한다.
  const words = challengeWords.filter(w => w.trim().length > 0);

  return SCENARIO_SEEDS.map((seed, scenarioIdx) => {
    const sentences: SimSentence[] = [];

    for (let i = 0; i < SENTENCES_PER_SCENARIO; i++) {
      const word = words.length > 0
        ? words[(scenarioIdx + i) % words.length]
        : undefined;

      if (word !== undefined && i < seed.templates.length) {
        sentences.push(makeSentence(
          seed.id, i,
          seed.templates[i].replace('{word}', word),
          [word],
          'challenge',
        ));
      } else {
        sentences.push(makeSentence(
          seed.id, i,
          seed.fallbacks[i % seed.fallbacks.length],
          [],
          'template',
        ));
      }
    }

    // 직접 입력한 문장은 모든 시나리오 뒤에 붙이지 않고 첫 시나리오에만 붙인다.
    // 세 번 반복시키면 같은 문장을 세 번 말하게 되어 평가가 오염된다.
    if (scenarioIdx === 0) {
      customSentences
        .map(s => s.trim())
        .filter(Boolean)
        .forEach((text, i) => {
          sentences.push(makeSentence(seed.id, i, text, [], 'custom'));
        });
    }

    return {
      id: seed.id,
      label: seed.label,
      ttsPrompt: seed.ttsPrompt,
      ambientKey: seed.ambientKey,
      responseSentences: sentences,
    };
  });
}

/** 응답 창(카운트다운 종료 후 말할 시간) 안내용 — 실제 강제 제한은 두지 않는다. */
export const RESPONSE_WINDOW_SEC = 8;
