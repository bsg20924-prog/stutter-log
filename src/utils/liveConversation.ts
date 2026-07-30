// 살아있는 대화 — 상대가 내 말을 받아 다음 말을 고른다.
//
// 왜 필요한가:
// 상황 시뮬레이션(4단계)의 멘트는 한 줄짜리 고정 목록이라 한 턴이면 외워진다.
// 다음에 무슨 말이 올지 알면 그건 이미 실전이 아니다. 실전 압박의 핵심 성분은
// **예측 불가능성**이다.
//
// ⚠️ 이건 측정이 아니라 노출/둔감화다.
// 4단계가 성립하는 조건은 "검사 단어가 문장 맨 앞"인데(data/simulation.ts 참고),
// 자유 발화에서는 그 통제가 불가능하다. 그래서 여기서 나온 결과는 소리 지도 채점에
// 넣지 않는다 — 섞으면 어느 소리가 어려운지가 조용히 오염된다.
//
// ── 왜 '생성'이 아니라 '고르기'인가 ──────────────────────────
//
// 처음에는 대사를 매 턴 Gemini 로 새로 지어냈다. 말은 되는데 소리가 안 났다.
// 실측(2026-07-30):
//   · TTS 음성 생성 5~15초, 편차가 크고 종종 더 걸린다
//   · preview 모델이 과부하로 500 을 뱉는다 ("currently experiencing high demand")
//   · 문장 생성까지 더하면 턴당 최대 19초
// 즉 **대화 도중에 음성을 실시간으로 만드는 설계 자체가 성립하지 않는다.**
// 타임아웃을 2.5→7→25→40초로 올려봤지만 전부 증상만 건드린 것이었다.
//
// 그래서 뒤집었다. 대사를 **미리 정해진 풀**로 두고 음성을 한 번만 받아 영구
// 보관한 뒤(ttsStore), 대화 중에는 AI 가 **어떤 대사를 꺼낼지만** 고른다.
//   · 재생이 즉시다 — 네트워크를 타지 않는다
//   · 모델이 죽어 있어도 대화가 굴러간다
//   · 음성값은 평생 한 번만 낸다
//   · 고르기 호출이 실패하면 풀 순서대로 쓴다 (완전한 폴백)
//
// 잃은 것은 '그때그때 지어낸 문장'이고, 지키려던 것(다음 말을 예측할 수 없음)은
// 그대로다 — 사용자는 풀에 무엇이 있는지 모르고, 순서도 매번 달라진다.

import { callGemini, parseGeminiJson, hasGeminiKey } from './gemini';
import { AmbientKey } from '../data/simulation';

/**
 * 음성인식이 아무것도 못 건졌을 때 대화 기록에 넣는 표시.
 * 모델에게 "말을 안 한 게 아니라 안 들린 것"이라고 알려 준다.
 */
export const UNHEARD = '[안 들림]';

/**
 * 답하긴 했는데 내용을 알 수 없을 때 쓰는 표시.
 * 음성인식을 꺼 둔 경우, 연속으로 못 알아들어 되묻기를 멈춰야 할 때,
 * 그리고 **내가 말하는 동안 미리 다음 대사를 고를 때** 쓴다.
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
  /** 상대가 누구인지 — 고르기 판단의 근거 */
  persona: string;
  /** 사용자가 이 대화에서 하려는 일. 화면에도 그대로 보여준다. */
  goal: string;

  /** 첫 마디 후보 */
  openers: string[];
  /**
   * 대화 중간에 쓸 대사 풀. AI 가 여기서 고른다.
   * ⚠️ 어떤 순서로 나와도 말이 되어야 한다 — 고르기가 실패하면 이 순서대로 쓴다.
   * 못 알아들었을 때 쓸 되묻기 대사도 여기 포함한다.
   */
  pool: string[];
  /** 마무리 인사 후보 */
  closings: string[];

  /** 상대 발화 횟수 상한. 넘으면 마무리로 간다. */
  maxTurns: number;
  ambientKey?: AmbientKey;
}

export const LIVE_SCENARIOS: LiveScenario[] = [
  {
    id: 'order-cafe',
    label: '카페 주문',
    hint: '메뉴를 고르고 끝까지 주문하기',
    persona: '카페 카운터의 점원. 밝고 조금 빠른 말투.',
    goal: '마시고 싶은 걸 주문하고 결제까지 끝내기',
    openers: ['어서 오세요, 주문 도와드릴까요?', '안녕하세요, 뭐 드릴까요?', '주문하시겠어요?'],
    pool: [
      '사이즈는 어떻게 드릴까요?',
      '따뜻한 걸로 드릴까요, 차가운 걸로 드릴까요?',
      '드시고 가세요, 포장이세요?',
      '시럽 추가하시겠어요?',
      '더 필요하신 건 없으세요?',
      '죄송해요, 그건 오늘 다 나갔어요. 다른 걸로 하시겠어요?',
      '성함 한 번만 말씀해 주시겠어요?',
      '아, 죄송해요. 다시 한 번 말씀해 주시겠어요?',
      '결제는 어떻게 도와드릴까요?',
    ],
    closings: ['네, 준비되면 불러드릴게요. 감사합니다.', '주문 도와드렸습니다. 감사합니다.'],
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
    pool: [
      '몇 분이세요?',
      '언제로 잡아드릴까요?',
      '몇 시쯤 오실 예정이세요?',
      '성함이 어떻게 되세요?',
      '연락처 하나만 남겨 주시겠어요?',
      '죄송한데 그 시간은 자리가 없어요. 다른 시간 괜찮으세요?',
      '창가 자리로 해드릴까요?',
      '여보세요? 잘 안 들리는데 다시 말씀해 주시겠어요?',
      '더 필요하신 건 없으세요?',
    ],
    closings: ['네, 예약 도와드렸습니다. 감사합니다.', '그럼 그때 뵙겠습니다. 감사합니다.'],
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
    pool: [
      '적립 카드 있으세요?',
      '결제 어떻게 하시겠어요?',
      '일시불로 해드릴까요?',
      '영수증 드릴까요?',
      '봉투는 오십 원인데 드릴까요?',
      '이거 하나만 맞으세요?',
      '네? 다시 말씀해 주시겠어요?',
      '잠시만요, 바코드가 안 찍히네요.',
      '현금영수증 하시겠어요?',
    ],
    closings: ['감사합니다, 안녕히 가세요.', '네, 계산 다 됐습니다. 감사합니다.'],
    maxTurns: 6,
  },
  {
    id: 'interview',
    label: '면접',
    hint: '내 대답을 받아서 파고드는 상황',
    persona: '면접관. 차분하고 진지하며 천천히 누르듯 말한다.',
    goal: '질문에 그때그때 답하기',
    openers: ['간단히 자기소개부터 부탁드립니다.', '오시는 데 불편하진 않으셨나요?', '먼저 본인 소개 부탁드려요.'],
    pool: [
      '그 부분 좀 더 자세히 말씀해 주시겠어요?',
      '왜 그렇게 생각하셨죠?',
      '가장 어려웠던 점은 뭐였나요?',
      '구체적인 예를 하나 들어주시겠어요?',
      '그때 본인 역할은 무엇이었나요?',
      '한 문장으로 정리해 주시겠어요?',
      '음, 조금 더 생각해 보시고 말씀하셔도 됩니다.',
      '죄송합니다, 다시 한 번 말씀해 주시겠어요?',
      '마지막으로 하고 싶은 말씀 있으실까요?',
    ],
    closings: ['네, 오늘은 여기까지 하겠습니다. 수고하셨습니다.', '잘 들었습니다. 결과는 따로 연락드리겠습니다.'],
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
    pool: [
      '진짜? 그래서 어떻게 됐는데?',
      '아 뭐라고? 다시 말해봐.',
      '그거 재밌겠다. 언제 갔었어?',
      '나도 같이 갈까?',
      '야 근데 그거 알아?',
      '에이 설마. 진짜야?',
      '잠깐만, 내가 먼저 말할게.',
      '너는 어떻게 생각하는데?',
      '아 맞다, 저번에 그건 어떻게 됐어?',
    ],
    closings: ['그래, 나중에 또 얘기하자.', '알겠어. 이따 연락할게.'],
    maxTurns: 6,
  },
];

export function getLiveScenario(id: string): LiveScenario | undefined {
  return LIVE_SCENARIOS.find(s => s.id === id);
}

/**
 * 이 시나리오에서 나올 수 있는 모든 고정 대사.
 * 음성을 미리 받아 두는 대상이 정확히 이것이다.
 */
export function allFixedLines(s: LiveScenario): string[] {
  return [...s.openers, ...s.pool, ...s.closings];
}

/** 전체 시나리오의 고정 대사 — 미리받기 진행률 계산에 쓴다. */
export function allScenarioLines(): { scenarioId: string; line: string }[] {
  return LIVE_SCENARIOS.flatMap(s =>
    allFixedLines(s).map(line => ({ scenarioId: s.id, line })),
  );
}

export interface Turn {
  who: 'them' | 'me';
  text: string;
}

export interface NextTurn {
  line: string;
  done: boolean;
  /** AI 가 고른 것인지, 순서대로 꺼낸 것인지 */
  source: 'ai' | 'ladder';
}

/** 매번 같은 첫마디가 나오지 않게 돌려 쓴다. */
function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

/**
 * 첫 마디는 고르기를 거치지 않는다.
 * 인트로에 머무는 동안 음성을 준비해 둘 수 있어 「시작」 직후가 비지 않는다.
 * 예측 불가능성은 두 번째 마디부터 나오므로 잃는 것이 없다.
 */
export function openerFor(s: LiveScenario, seed: number): string {
  return pick(s.openers, seed);
}

// ── 고르기 ────────────────────────────────────────────────
//
// 규칙 4·5 가 가장 중요하다.
// 역할극 LLM 은 말이 끊기거나 어색하면 "천천히 말씀하셔도 괜찮아요" 같은 배려를
// 자발적으로 꺼낸다. 실제 점원은 그러지 않는다. 그 한마디가 나오는 순간 이 연습은
// '내가 말더듬이라는 걸 상대가 알아챈 장면'이 되어 노출 훈련이 아니라 상처가 된다.
// 지금은 대사가 풀로 고정돼 있어 구조적으로 막혀 있지만, 고르기 기준에도 남겨 둔다.
function systemInstruction(s: LiveScenario): string {
  return [
    `너는 "${s.label}" 상황의 상대역이다.`,
    `너의 정체: ${s.persona}`,
    `상대(사용자)가 하려는 일: ${s.goal}`,
    '',
    '너의 일은 **다음에 할 말을 목록에서 고르는 것**이다. 문장을 새로 쓰지 마라.',
    '',
    '고르는 기준:',
    '1. 지금까지의 대화에 자연스럽게 이어지는 것.',
    '2. 이미 한 말은 다시 고르지 마라 (사용 완료로 표시된 번호).',
    `3. 사용자 발화가 "${UNHEARD}" 면 진짜로 안 들린 것이다 — 되묻는 대사를 골라라.`,
    '   단 연속으로 두 번 되묻지 마라.',
    `4. 사용자 발화가 "${ANSWERED}" 면 답은 했는데 내용을 알 수 없다는 뜻이다.`,
    '   되묻지 말고 그 상황에서 자연스럽게 이어질 다음 순서를 골라라.',
    '5. ★ 말더듬·발음·말하기 속도를 의식한 선택을 하지 마라.',
    '   사용자의 말이 짧거나 끊겨 있어도 아무 일 없었던 것처럼 다음으로 넘어가라.',
    '6. 용건이 끝났으면 done 을 true 로 한다. 그때 index 는 무시된다.',
    '',
    'index 는 반드시 목록에 있는 번호여야 한다. 없는 번호를 지어내지 마라.',
  ].join('\n');
}

const SELECT_SCHEMA = {
  type: 'object',
  properties: {
    index: { type: 'integer' },
    done: { type: 'boolean' },
  },
  required: ['index', 'done'],
};

function themCount(history: Turn[]): number {
  return history.filter(t => t.who === 'them').length;
}

/**
 * 고르기를 못 할 때: 풀에서 아직 안 쓴 것을 순서대로 꺼낸다.
 * 풀을 다 쓰면 마무리한다 — 같은 말을 다시 돌리면 즉시 가짜가 된다.
 */
export function ladderLine(
  s: LiveScenario, history: Turn[], used: Set<number>, seed = 0,
): NextTurn {
  const spoken = themCount(history);
  if (spoken === 0) return { line: openerFor(s, seed), done: false, source: 'ladder' };

  const idx = s.pool.findIndex((_, i) => !used.has(i));
  if (idx < 0 || spoken >= s.maxTurns - 1) {
    return { line: pick(s.closings, seed), done: true, source: 'ladder' };
  }
  return { line: s.pool[idx], done: false, source: 'ladder' };
}

/**
 * 다음 상대 대사를 고른다.
 *
 * 실패하면 풀 순서대로 내려간다 — 대화가 끊기는 일은 없다.
 * @param used 이미 쓴 풀 인덱스
 */
export async function selectLine(
  s: LiveScenario,
  history: Turn[],
  used: Set<number>,
  openerSeed = 0,
  signal?: AbortSignal,
): Promise<NextTurn & { poolIndex?: number }> {
  const spoken = themCount(history);

  // 첫 마디는 고정 — 음성이 이미 준비돼 있다.
  if (spoken === 0) {
    return { line: openerFor(s, openerSeed), done: false, source: 'ladder' };
  }
  // 상한에 닿으면 무조건 마무리한다.
  if (spoken >= s.maxTurns - 1) {
    return { line: pick(s.closings, openerSeed), done: true, source: 'ladder' };
  }
  if (!hasGeminiKey()) return ladderLine(s, history, used, openerSeed);

  const options = s.pool
    .map((line, i) => `${i}. ${line}${used.has(i) ? '  (사용 완료)' : ''}`)
    .join('\n');

  const input = [
    '지금까지의 대화:',
    history.map(t => `${t.who === 'them' ? '나' : '상대'}: ${t.text}`).join('\n'),
    '',
    '고를 수 있는 말:',
    options,
    '',
    `앞으로 ${s.maxTurns - spoken}번 정도 더 말할 수 있다. 다음에 할 말의 번호를 골라라.`,
  ].join('\n');

  const parsed = parseGeminiJson<{ index?: unknown; done?: unknown }>(await callGemini({
    systemInstruction: systemInstruction(s),
    input,
    schema: SELECT_SCHEMA,
    temperature: 0.8,
    thinkingLevel: 'minimal',   // 고르기일 뿐이다 — 속도가 중요하다
    timeoutMs: 8000,
    signal,
  }));

  if (parsed?.done === true) {
    return { line: pick(s.closings, openerSeed), done: true, source: 'ai' };
  }

  const i = typeof parsed?.index === 'number' ? parsed.index : -1;
  // 없는 번호·이미 쓴 번호는 버린다. 검증 없이 받으면 같은 말을 두 번 하게 된다.
  if (i < 0 || i >= s.pool.length || used.has(i)) {
    return ladderLine(s, history, used, openerSeed);
  }
  return { line: s.pool[i], done: false, source: 'ai', poolIndex: i };
}
