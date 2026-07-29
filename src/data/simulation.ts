// 상황 시뮬레이션 — 시나리오/문장 데이터.
//
// Stage 1~3(속삭임·목소리·녹음)은 "소리 하나"를 단위로 압력을 올린다.
// 4단계는 단위가 다르다: 상대의 말이 먼저 오고, 그에 대한 "문장"으로 답한다.
// 여기서만 걸리는 소리는 소리가 어려운 것도, 녹음 압박에 눌린 것도 아니라
// 그 상황 자체에 조건화된 반응이다 — 그래서 처방도 노출/둔감화로 갈라진다.
//
// 시나리오 구성은 앱이 이미 쓰는 SituationTag(전화·주문/결제·발표/자기소개·
// 낯선사람·지인/가족·급함/압박감)에 맞췄다. 기록 데이터와 같은 축을 쓰면
// 나중에 "전화에서 자주 막힌다"는 기록과 "전화 상황에서 걸렸다"는 검사 결과를
// 이어 붙일 수 있다.
//
// 기록 쪽 SituationTag 에는 '군_상황'이 남아 있지만 시뮬레이션에는 두지 않는다 —
// 상황 시뮬레이션은 지금 반복 연습할 수 있는 장면만 다루는 게 목적이다.

// 배경 상황 키. 음원은 /public/ambient/ 에 있고 없으면 조용히 무음 처리된다.
export type AmbientKey = 'cafe' | 'office' | 'phone';

export const AMBIENT_META: Record<AmbientKey, { label: string; emoji: string }> = {
  cafe:   { label: '카페 · 주변이 시끄러움', emoji: '☕' },
  office: { label: '실내 · 여러 명이 봄',   emoji: '🏢' },
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
  /** 이 문장에 쓸 상대의 말 — 같은 시나리오라도 문장마다 다르게 돌린다 */
  ttsPrompt: string;
}

export interface SimScenario {
  id: string;
  label: string;
  /** 상대가 먼저 하는 말의 변형들. 같은 멘트를 반복하면 상황 몰입이 깨진다. */
  ttsPrompts: string[];
  responseSentences: SimSentence[];
  ambientKey?: AmbientKey;
}

interface ScenarioSeed {
  id: string;
  label: string;
  /** 고르기 화면에 보여줄 한 줄 설명 */
  hint: string;
  ttsPrompts: string[];
  ambientKey?: AmbientKey;
  /** 도전 단어를 끼워 넣을 틀. {word} 자리에 단어가 들어간다. */
  templates: string[];
  /** 도전 단어가 없을 때 쓰는 기본 문장 */
  fallbacks: string[];
}

// ⚠️ 틀의 가장 중요한 제약: **검사 단어가 문장 맨 앞에 와야 한다.**
// 말막힘은 발화를 시작하는 순간에 일어난다. 단어가 문장 중간이나 끝에 있으면
// 그 앞의 말로 이미 발성이 시작된 뒤라 그 단어 때문에 막혔는지 판별할 수 없다.
// 즉 '{word} 주세요'는 유효하지만 '제 관심사는 {word}입니다'는 측정이 무의미하다.
//
// 그 다음 제약: 어떤 명사가 와도 문법이 깨지지 않아야 한다.
// 조사(을/를·이/가)가 필요한 틀은 받침 유무로 문법이 깨지므로 쓰지 않는다.
// 뜻이 어색해지는 건 Gemini 가 해결할 몫이고, 키가 없으면 감수한다.
const SCENARIO_SEEDS: ScenarioSeed[] = [
  {
    id: 'order-cafe',
    label: '주문 / 카페',
    hint: '카페·식당에서 주문하기',
    ambientKey: 'cafe',
    ttsPrompts: [
      '주문 도와드릴까요?',
      '어서 오세요, 뭐 드릴까요?',
      '주문하시겠어요?',
      '다음 손님 주문 도와드리겠습니다.',
    ],
    templates: ['{word} 주세요.', '{word} 하나 주세요.', '{word} 포장해 주세요.'],
    fallbacks: ['아메리카노 한 잔 주세요.', '따뜻한 걸로 주세요.', '포장해 주세요.'],
  },
  {
    id: 'checkout',
    label: '계산 / 결제',
    hint: '계산대에서 짧게 답하기',
    ambientKey: 'cafe',
    ttsPrompts: [
      '봉투 필요하세요?',
      '적립 카드 있으세요?',
      '결제 어떻게 도와드릴까요?',
      '영수증 드릴까요?',
    ],
    templates: ['{word} 있어요.', '{word} 빼고 계산해 주세요.', '{word} 추가할게요.'],
    fallbacks: ['카드로 할게요.', '봉투는 괜찮아요.', '영수증은 안 주셔도 돼요.'],
  },
  {
    id: 'introduction',
    label: '자기소개',
    hint: '처음 만난 자리에서 소개하기',
    ambientKey: 'office',
    ttsPrompts: [
      '자기소개 부탁드립니다.',
      '간단히 소개해 주시겠어요?',
      '어떤 분인지 말씀해 주세요.',
      '돌아가면서 소개할게요. 시작해 주세요.',
    ],
    templates: ['{word} 쪽에 관심이 있습니다.', '{word} 이야기부터 해볼게요.', '{word} 쪽 일을 하고 있습니다.'],
    fallbacks: ['안녕하세요, 반갑습니다.', '잘 부탁드립니다.', '만나서 반갑습니다.'],
  },
  {
    id: 'interview',
    label: '면접 / 압박 질문',
    hint: '준비 없이 바로 답해야 하는 상황',
    ambientKey: 'office',
    ttsPrompts: [
      '그 부분 좀 더 자세히 설명해 주시겠어요?',
      '왜 그렇게 생각하시죠?',
      '지금 바로 답변해 주세요.',
      '한 문장으로 정리해 주시겠어요?',
    ],
    templates: ['{word} 때문입니다.', '{word} 경험이 있습니다.', '{word} 부분을 말씀드리겠습니다.'],
    fallbacks: ['잠시 생각해 보겠습니다.', '제 생각은 이렇습니다.', '한 가지 예를 들어보겠습니다.'],
  },
  {
    id: 'phone-reservation',
    label: '전화 예약',
    hint: '얼굴이 안 보이는 통화',
    ambientKey: 'phone',
    ttsPrompts: [
      '여보세요, 무엇을 도와드릴까요?',
      '네, 말씀하세요.',
      '어떤 일로 전화 주셨어요?',
      '여보세요? 잘 안 들리는데요.',
    ],
    templates: ['{word} 예약하려고 하는데요.', '{word} 되나요?', '{word} 문의드리려고 전화했습니다.'],
    fallbacks: ['예약하려고 하는데요.', '내일 저녁 가능한가요?', '두 명이요.'],
  },
  {
    id: 'stranger',
    label: '낯선 사람',
    hint: '길에서 모르는 사람에게 말 걸기',
    ttsPrompts: [
      '네? 저 부르셨어요?',
      '무슨 일이시죠?',
      '아, 네. 뭐 도와드릴까요?',
      '어떤 거 찾으세요?',
    ],
    templates: ['{word} 어디인지 아세요?', '{word} 찾고 있는데요.', '{word} 여쭤봐도 될까요?'],
    fallbacks: ['혹시 길 좀 여쭤봐도 될까요?', '이 근처에 역이 어디예요?', '실례합니다, 잠시만요.'],
  },
  {
    id: 'peers',
    label: '친구 / 동기',
    hint: '또래와의 대화 — 끼어들기·농담·차례 뺏기는 상황',
    ttsPrompts: [
      '야, 그래서 어떻게 됐어?',
      '아 뭐라고? 다시 말해봐.',
      '잠깐, 니가 말해봐.',
      '그거 뭐였지? 이름이 뭐더라?',
      '다들 얘기하는데 너는?',
    ],
    templates: ['{word} 얘기였어.', '{word} 때문에 그랬어.', '{word} 어떻게 생각해?'],
    fallbacks: ['아 그거 진짜 웃겼어.', '나도 그렇게 생각했어.', '잠깐만, 내가 말할게.'],
  },
  {
    id: 'family',
    label: '가족',
    hint: '가장 편한 상황 — 비교 기준이 된다',
    ttsPrompts: [
      '뭐 먹고 싶어?',
      '오늘 어땠어?',
      '그래서 어떻게 됐는데?',
      '무슨 얘기 하려고 했지?',
    ],
    templates: ['{word} 먹고 싶어.', '{word} 얘기 하려고 했어.', '{word} 어땠는지 알아?'],
    fallbacks: ['오늘은 좀 피곤했어.', '별일 없었어.', '나중에 얘기해 줄게.'],
  },
];

/** 고르기 화면용 메타 */
export const SCENARIO_LIST = SCENARIO_SEEDS.map(s => ({
  id: s.id,
  label: s.label,
  hint: s.hint,
  ambientKey: s.ambientKey,
}));

export const SCENARIO_COUNT = SCENARIO_SEEDS.length;

/** 단독 실행의 기본 선택 — 전부 돌리면 27문장이라 너무 길다 */
export const DEFAULT_SCENARIO_IDS = ['order-cafe', 'introduction', 'phone-reservation'];

/** 시나리오 하나당 만들 문장 수 */
const SENTENCES_PER_SCENARIO = 3;

export function getScenarioSeed(id: string): ScenarioSeed | undefined {
  return SCENARIO_SEEDS.find(s => s.id === id);
}

/** 같은 멘트가 연달아 나오지 않도록 인덱스로 돌려 쓴다. */
export function pickPrompt(prompts: string[], index: number): string {
  return prompts[index % prompts.length] ?? prompts[0];
}

function makeSentence(
  scenarioId: string,
  seq: number,
  text: string,
  sourceWords: string[],
  origin: SentenceOrigin,
  ttsPrompt: string,
): SimSentence {
  return { id: `${scenarioId}-${origin}-${seq}`, text, sourceWords, origin, ttsPrompt };
}

/**
 * 도전 단어를 시나리오 틀에 끼워 넣어 응답 문장을 만든다.
 *
 * @param scenarioIds 돌릴 시나리오. 생략하면 기본 3개.
 */
export function buildScenarios(
  challengeWords: string[],
  customSentences: string[] = [],
  scenarioIds: string[] = DEFAULT_SCENARIO_IDS,
): SimScenario[] {
  const words = challengeWords.filter(w => w.trim().length > 0);
  const seeds = scenarioIds
    .map(getScenarioSeed)
    .filter((s): s is ScenarioSeed => Boolean(s));

  return seeds.map((seed, scenarioIdx) => {
    const sentences: SimSentence[] = [];

    for (let i = 0; i < SENTENCES_PER_SCENARIO; i++) {
      // 단어가 시나리오마다 똑같은 순서로 반복되지 않게 시작 위치를 어긋나게 한다.
      const word = words.length > 0 ? words[(scenarioIdx + i) % words.length] : undefined;
      const prompt = pickPrompt(seed.ttsPrompts, i);

      if (word !== undefined && i < seed.templates.length) {
        sentences.push(makeSentence(
          seed.id, i, seed.templates[i].replace('{word}', word), [word], 'challenge', prompt,
        ));
      } else {
        sentences.push(makeSentence(
          seed.id, i, seed.fallbacks[i % seed.fallbacks.length], [], 'template', prompt,
        ));
      }
    }

    // 직접 입력한 문장은 첫 시나리오에만 붙인다.
    // 모든 시나리오에 반복시키면 같은 문장을 여러 번 말하게 되어 평가가 오염된다.
    if (scenarioIdx === 0) {
      customSentences
        .map(s => s.trim())
        .filter(Boolean)
        .forEach((text, i) => {
          sentences.push(makeSentence(
            seed.id, i, text, [], 'custom',
            pickPrompt(seed.ttsPrompts, SENTENCES_PER_SCENARIO + i),
          ));
        });
    }

    return {
      id: seed.id,
      label: seed.label,
      ttsPrompts: seed.ttsPrompts,
      ambientKey: seed.ambientKey,
      responseSentences: sentences,
    };
  });
}

/** 응답 창(카운트다운 종료 후 말할 시간) 안내용 — 실제 강제 제한은 두지 않는다. */
export const RESPONSE_WINDOW_SEC = 8;
