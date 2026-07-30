// 살아있는 대화 — 상대가 내 말을 받아 다음 말을 만든다.
//
// 왜 필요한가:
// 상황 시뮬레이션(4단계)의 멘트는 고정 목록이라 한 턴이면 외워진다. 다음에 무슨
// 말이 올지 알면 그건 이미 실전이 아니다. 실전 압박의 핵심 성분은 **예측 불가능성**
// 이고, 그건 정해진 문장 목록으로는 절대 만들 수 없다.
//
// ⚠️ 이건 측정이 아니라 노출/둔감화다.
// 4단계가 성립하는 조건은 "검사 단어가 문장 맨 앞"인데(data/simulation.ts 참고),
// 자유 발화에서는 그 통제가 불가능하다. 그래서 여기서 나온 결과는 소리 지도 채점에
// 넣지 않는다 — 섞으면 어느 소리가 어려운지가 조용히 오염된다.
// 사다리(속삭임→목소리→녹음→상황) 위에 얹히는 별도의 칸이다.
//
// ⚠️ Gemini 가 없어도 완전히 동작해야 한다.
// 키가 없거나 호출이 실패하면 시나리오마다 준비된 '고정 사다리'로 대화를 이어간다.
// 카페 주문 같은 정형 대화는 고정 사다리만으로도 처음 도는 사람에겐 충분히
// 예측 불가능하다 — 내가 뭐라고 답하든 다음은 "사이즈는요?" 이기 때문이다.

import { callGemini, parseGeminiJson, hasGeminiKey } from './gemini';
import { AmbientKey } from '../data/simulation';

/**
 * 음성인식이 아무것도 못 건졌을 때 대화 기록에 넣는 표시.
 * 모델에게 "이건 사용자가 말을 안 한 게 아니라 안 들린 것"이라고 알려 준다.
 */
export const UNHEARD = '[안 들림]';

/**
 * 사용자가 답하긴 했는데 내용을 알 수 없을 때 쓰는 표시.
 * 음성인식을 꺼 둔 경우, 그리고 연속으로 못 알아들어 되묻기를 멈춰야 할 때 쓴다.
 * UNHEARD 와 달리 상대는 되묻지 않고 그냥 다음으로 넘어간다.
 */
export const ANSWERED = '(대답함)';

export interface LiveScenario {
  /**
   * data/simulation.ts 의 시나리오 id 를 그대로 쓴다.
   * 그래야 geminiTts 의 목소리·말투 표와 speech.ts 의 속도 표가 그대로 붙는다.
   */
  id: string;
  label: string;
  hint: string;
  /** 상대가 누구인지 — 모델이 역할에서 벗어나지 않게 하는 닻 */
  persona: string;
  /** 사용자가 이 대화에서 하려는 일. 화면에도 그대로 보여준다. */
  goal: string;
  /** 상대가 먼저 건네는 첫 마디 후보 */
  openers: string[];
  /**
   * Gemini 를 못 쓸 때 순서대로 쓰는 고정 대사.
   * 실제 그 상황의 진행 순서를 따른다 — 사용자가 뭐라 답하든 성립해야 한다.
   */
  ladder: string[];
  /** 상대 발화 횟수 상한. 넘으면 마무리로 넘어간다. */
  maxTurns: number;
  ambientKey?: AmbientKey;
}

export const LIVE_SCENARIOS: LiveScenario[] = [
  {
    id: 'order-cafe',
    label: '카페 주문',
    hint: '메뉴를 고르고 끝까지 주문하기',
    persona: '카페 카운터의 점원. 밝고 조금 빠른 말투. 손님을 응대하는 중이다.',
    goal: '마시고 싶은 걸 주문하고 결제까지 끝내기',
    openers: ['어서 오세요, 주문 도와드릴까요?', '안녕하세요, 뭐 드릴까요?', '주문하시겠어요?'],
    ladder: [
      '사이즈는 어떻게 드릴까요?',
      '따뜻한 걸로 드릴까요, 차가운 걸로 드릴까요?',
      '드시고 가세요, 포장이세요?',
      '더 필요하신 건 없으세요?',
      '결제 도와드리겠습니다.',
    ],
    maxTurns: 6,
    ambientKey: 'cafe',
  },
  {
    id: 'phone-reservation',
    label: '전화 예약',
    hint: '얼굴이 안 보이는 통화로 예약 잡기',
    persona: '식당 예약을 받는 직원. 전화를 받았다. 또박또박한 말투.',
    goal: '날짜·시간·인원을 말하고 예약 잡기',
    openers: ['네, 여보세요. 무엇을 도와드릴까요?', '감사합니다, 무엇을 도와드릴까요?', '네, 말씀하세요.'],
    ladder: [
      '몇 분이세요?',
      '언제로 잡아드릴까요?',
      '성함이 어떻게 되세요?',
      '연락처 하나만 남겨 주시겠어요?',
      '예약 도와드렸습니다. 더 필요하신 건 없으세요?',
    ],
    maxTurns: 6,
    ambientKey: 'phone',
  },
  {
    id: 'checkout',
    label: '계산대',
    hint: '짧게 여러 번 답해야 하는 상황',
    persona: '편의점 계산대 직원. 사무적이고 빠른 말투. 뒤에 줄이 있다.',
    goal: '계산을 끝내고 나오기',
    openers: ['봉투 필요하세요?', '결제 도와드릴까요?', '포인트 적립하세요?'],
    ladder: [
      '적립 카드 있으세요?',
      '결제 어떻게 하시겠어요?',
      '일시불로 해드릴까요?',
      '영수증 드릴까요?',
      '감사합니다, 안녕히 가세요.',
    ],
    maxTurns: 6,
  },
  {
    id: 'interview',
    label: '면접',
    hint: '내 대답을 받아서 파고드는 상황',
    persona: '면접관. 차분하고 진지하며 천천히 누르듯 말한다. 답변을 듣고 이어서 캐묻는다.',
    goal: '질문에 그때그때 답하기',
    openers: ['간단히 자기소개부터 부탁드립니다.', '오시는 데 불편하진 않으셨나요?', '먼저 본인 소개 부탁드려요.'],
    ladder: [
      '그 부분 좀 더 자세히 말씀해 주시겠어요?',
      '왜 그렇게 생각하셨죠?',
      '가장 어려웠던 점은 뭐였나요?',
      '마지막으로 하고 싶은 말씀 있으실까요?',
      '네, 오늘은 여기까지 하겠습니다. 수고하셨습니다.',
    ],
    maxTurns: 6,
    ambientKey: 'office',
  },
  {
    id: 'peers',
    label: '친구',
    hint: '반말, 빠른 주고받기',
    persona: '친한 친구. 반말로 편하게 말한다. 말이 빠르고 잘 끼어든다.',
    goal: '편하게 대화 이어가기',
    openers: ['야, 오랜만이다. 요즘 뭐 하고 지내?', '어 왔어? 밥은 먹었어?', '무슨 일 있었어? 얼굴이 왜 그래.'],
    ladder: [
      '진짜? 그래서 어떻게 됐는데?',
      '아 뭐라고? 다시 말해봐.',
      '그거 재밌겠다. 언제 갔었어?',
      '나도 같이 갈까?',
      '그래, 나중에 또 얘기하자.',
    ],
    maxTurns: 6,
  },
];

export function getLiveScenario(id: string): LiveScenario | undefined {
  return LIVE_SCENARIOS.find(s => s.id === id);
}

export interface Turn {
  who: 'them' | 'me';
  text: string;
}

// ── 프롬프트 ──────────────────────────────────────────────
//
// 규칙 5·6 이 이 프롬프트에서 가장 중요하다.
// LLM 은 상대의 말이 끊기거나 어색하면 "천천히 말씀하셔도 괜찮아요" 같은 배려를
// 자발적으로 꺼낸다. 실제 점원은 그런 말을 하지 않는다. 그 한마디가 나오는 순간
// 이 연습은 '내가 말더듬이라는 걸 상대가 알아챈 장면'이 되어 노출 훈련이 아니라
// 상처가 된다. 금지 조항 없이는 모델이 스스로 이 모드를 무너뜨린다.
function systemInstruction(s: LiveScenario): string {
  return [
    `너는 "${s.label}" 상황의 상대역이다.`,
    `너의 정체: ${s.persona}`,
    `상대(사용자)가 하려는 일: ${s.goal}`,
    '',
    '규칙:',
    '1. 한 번에 **한 마디만** 한다. 25자 이내, 한 문장.',
    '2. 사용자가 답할 거리를 반드시 남겨라 — 질문하거나 확인을 요청한다.',
    '   혼잣말이나 설명으로 끝내면 사용자가 말할 차례가 사라진다.',
    '3. 사용자 대신 말하지 마라. 사용자의 대사를 지어내지 마라.',
    '4. 역할에서 벗어나지 마라. 너는 AI 가 아니라 그 상황의 사람이다.',
    '   연습이라는 사실, 앱이라는 사실을 절대 언급하지 마라.',
    '5. ★ 말더듬·말막힘·발음·말하기 속도에 대해 **절대 언급하지 마라.**',
    '   "천천히 말씀하셔도 돼요", "괜찮아요, 편하게 하세요", "긴장하지 마세요" —',
    '   전부 금지다. 격려·위로·응원도 금지다. 너는 그냥 자기 일을 하는 사람이다.',
    '6. ★ 사용자의 말이 끊기거나, 짧거나, 어색하거나, 문법이 깨져 있어도',
    '   **아무 일도 없었던 것처럼 자연스럽게 받아라.** 지적도 되묻기도 하지 마라.',
    `7. 사용자 발화가 "${UNHEARD}" 로 오면 진짜로 안 들린 것이다.`,
    '   그 상황의 사람이 할 법하게 **딱 한 번만** 되물어라("네?", "다시 한 번 말씀해 주시겠어요?").',
    '   연속으로 두 번 되묻지 마라 — 그때는 대충 알아들은 셈 치고 다음으로 넘어가라.',
    `7-1. 사용자 발화가 "${ANSWERED}" 로 오면 답은 했는데 내용을 알 수 없다는 뜻이다.`,
    '   되묻지 말고, 그 상황에서 자연스럽게 이어질 다음 말을 해라.',
    '   내용을 모르니 앞의 답을 구체적으로 인용하지 말고 일반적인 다음 순서로 넘어가라.',
    '8. 용건이 끝났으면 마무리 인사를 하고 done 을 true 로 한다.',
    '   아직 할 일이 남았으면 done 은 false 다.',
    '9. 존댓말/반말은 정체에 맞춘다.',
    '',
    '좋은 예: "사이즈는 어떻게 드릴까요?"',
    '나쁜 예: "천천히 말씀하셔도 괜찮아요." (규칙 5 위반)',
    '나쁜 예: "손님이 아메리카노를 주문하셨네요. 그럼..." (사용자 대사를 지어냄 — 규칙 3 위반)',
  ].join('\n');
}

const TURN_SCHEMA = {
  type: 'object',
  properties: {
    line: { type: 'string' },
    done: { type: 'boolean' },
  },
  required: ['line', 'done'],
};

export interface NextTurn {
  line: string;
  done: boolean;
  /** Gemini 가 만든 말인지, 고정 사다리에서 꺼낸 말인지 */
  source: 'ai' | 'ladder';
}

/** 상대 발화 수 — 고정 사다리에서 몇 번째를 꺼낼지 정하는 기준이다. */
function themCount(history: Turn[]): number {
  return history.filter(t => t.who === 'them').length;
}

/**
 * Gemini 를 못 쓸 때의 대사.
 * 사다리를 다 쓰면 대화를 끝낸다 — 같은 말을 다시 돌리면 즉시 가짜가 된다.
 */
export function ladderLine(s: LiveScenario, history: Turn[]): NextTurn {
  const spoken = themCount(history);
  if (spoken === 0) {
    return { line: pick(s.openers, history.length), done: false, source: 'ladder' };
  }
  const idx = spoken - 1;
  if (idx >= s.ladder.length) {
    return { line: '네, 알겠습니다. 감사합니다.', done: true, source: 'ladder' };
  }
  return {
    line: s.ladder[idx],
    done: idx === s.ladder.length - 1,
    source: 'ladder',
  };
}

/** 매번 같은 첫마디가 나오지 않게 돌려 쓴다. */
function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

/**
 * 첫 마디는 **Gemini 를 거치지 않고 고정 후보에서 고른다.**
 *
 * 왜: 첫 마디까지 생성하면 「시작」을 누른 뒤 텍스트 생성 + 음성 생성을 직렬로 기다려야 해서
 * 대화가 시작되기도 전에 몇 초가 빈다. 첫 마디는 어차피 "어서 오세요" 류라 생성할 값어치가 없다.
 * 미리 정해 두면 인트로 화면에 있는 동안 음성을 만들어 둘 수 있어서 **첫 마디가 즉시 나온다.**
 * 대화의 예측 불가능성은 두 번째 마디부터 나오므로 잃는 것이 없다.
 */
export function openerFor(s: LiveScenario, seed: number): string {
  return pick(s.openers, seed);
}

/**
 * 다음 상대 대사를 만든다.
 *
 * 실패하면 고정 사다리로 조용히 내려간다 — 대화가 끊기는 일은 없다.
 * @param history 지금까지의 대화. 마지막 항목은 보통 사용자 발화다.
 */
export async function nextLine(
  s: LiveScenario,
  history: Turn[],
  /** 첫 마디를 고르는 데만 쓴다 — openerFor 참고 */
  openerSeed = 0,
  signal?: AbortSignal,
): Promise<NextTurn> {
  const spoken = themCount(history);

  // 첫 마디는 생성하지 않는다. 인트로에서 음성까지 미리 만들어 둔 그 문장을 그대로 쓴다.
  if (spoken === 0) {
    return { line: openerFor(s, openerSeed), done: false, source: 'ladder' };
  }

  if (!hasGeminiKey()) return ladderLine(s, history);
  const remaining = s.maxTurns - spoken;

  const transcript = history.length === 0
    ? '(아직 아무도 말하지 않았다. 네가 먼저 말을 건다.)'
    : history.map(t => `${t.who === 'them' ? '나' : '상대'}: ${t.text}`).join('\n');

  const input = [
    '지금까지의 대화:',
    transcript,
    '',
    remaining <= 1
      ? '이번이 너의 마지막 말이다. 자연스럽게 마무리하고 done 을 true 로 해라.'
      : `너의 다음 한 마디를 만들어라. (앞으로 ${remaining}번 정도 말할 수 있다)`,
  ].join('\n');

  const parsed = parseGeminiJson<{ line?: unknown; done?: unknown }>(await callGemini({
    systemInstruction: systemInstruction(s),
    input,
    schema: TURN_SCHEMA,
    temperature: 1.0,      // 같은 상황을 여러 번 돌려도 매번 달라야 한다
    thinkingLevel: 'minimal',   // 턴 사이 지연이 곧 몰입 파괴다 — 속도를 산다
    timeoutMs: 8000,
    signal,
  }));

  const line = String(parsed?.line ?? '').trim();
  // 빈 대사·지나치게 긴 대사는 버린다. 상대가 30자 넘게 떠들면 내 차례가 사라진다.
  if (!line || line.length > 60) return ladderLine(s, history);

  return {
    line,
    // 모델이 done 을 안 내밀어도 상한에서는 반드시 끝낸다.
    done: parsed?.done === true || remaining <= 1,
    source: 'ai',
  };
}
