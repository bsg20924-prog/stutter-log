// Gemini 로 상황 문장 만들기 — 선택 기능(덧붙이는 층).
//
// ⚠️ 이 모듈은 **없어도 앱이 완전히 동작해야 한다.**
// 이 앱은 오프라인에서도 도는 PWA 이고, 검사 도중 네트워크가 끊겼다고 해서
// 사다리를 못 올라가면 안 된다. 그래서 실패는 전부 null 로 돌려주고
// 호출부는 템플릿 문장으로 조용히 되돌아간다. 여기서 예외를 던지지 않는다.
//
// ⚠️ API 키는 번들에 넣지 않는다.
// 이 앱은 백엔드가 없어서 VITE_ 환경변수는 빌드 시 번들에 그대로 박히고,
// 그건 곧 공개다. Firebase 키는 공개되어도 되는 키지만(보안은 firestore.rules 담당)
// Gemini 키는 과금 자격증명이라 공개되면 요금이 청구된다.
// 그래서 사용자가 앱에서 직접 입력하고, 그 기기의 localStorage 에만 둔다.
//
// API 형태는 2026-07 기준 Interactions API 를 따른다.
// 구 models/{model}:generateContent 는 레거시로 분류됐다.

import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MODEL = 'gemini-3.6-flash';
const KEY_STORAGE = 'stutter_gemini_key';
const TIMEOUT_MS = 20000;

// 기기 간 동기화용 Firestore 경로.
// firestore.rules 의 isOwner() 가 Google 서버에서 강제되므로,
// 로그인한 소유자 외에는 이 문서를 읽을 수 없다.
const SETTINGS_DOC = ['settings', 'gemini'] as const;
const USE_LOCAL_ONLY = import.meta.env.DEV;   // dev 는 로그인을 건너뛰어 규칙에 막힌다

// ── 키 보관 ───────────────────────────────────────────────
// localStorage 를 '현재 값'으로 삼고, Firestore 는 기기 간 동기화 원본으로 쓴다.
// 이렇게 하면 호출부는 동기 함수 그대로 쓸 수 있고 오프라인에서도 동작한다.
export function getGeminiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

function writeLocal(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // 저장소를 못 쓰면 이번 세션만 포기 — 템플릿으로 동작한다.
  }
}

/** 이 기기에만 저장 (동기화 안 함) */
export function setGeminiKey(key: string): void {
  writeLocal(key.trim());
}

/**
 * 모든 기기에서 쓰도록 Firestore 에도 저장한다.
 * ⚠️ 이 문서는 isOwner() 로 잠겨 있어 로그인한 소유자만 읽을 수 있다.
 * 번들에 넣는 것과 결정적으로 다른 점이다 — 번들은 로그인 없이 누구나 받는다.
 */
export async function syncGeminiKey(key: string): Promise<boolean> {
  const trimmed = key.trim();
  writeLocal(trimmed);
  if (USE_LOCAL_ONLY) return false;
  try {
    if (trimmed) {
      await setDoc(doc(db, ...SETTINGS_DOC), { apiKey: trimmed, updatedAt: new Date().toISOString() });
    } else {
      await deleteDoc(doc(db, ...SETTINGS_DOC));
    }
    return true;
  } catch {
    // 동기화 실패해도 이 기기에서는 동작한다.
    return false;
  }
}

/**
 * 앱 시작 시 Firestore 에 저장된 키를 이 기기로 가져온다.
 * 실패하면 조용히 넘어간다 — 키가 없으면 템플릿 문장으로 동작할 뿐이다.
 */
export async function pullGeminiKey(): Promise<boolean> {
  if (USE_LOCAL_ONLY) return false;
  try {
    const snap = await getDoc(doc(db, ...SETTINGS_DOC));
    const remote = snap.exists() ? String(snap.data()?.apiKey ?? '') : '';
    if (remote && remote !== getGeminiKey()) writeLocal(remote);
    return !!remote;
  } catch {
    return false;
  }
}

/** 이 기기에서 지우고, 동기화된 키도 함께 지운다. */
export async function clearGeminiKeyEverywhere(): Promise<void> {
  writeLocal('');
  if (USE_LOCAL_ONLY) return;
  try {
    await deleteDoc(doc(db, ...SETTINGS_DOC));
  } catch {
    // 무시
  }
}

export function hasGeminiKey(): boolean {
  return getGeminiKey().length > 0;
}

/** 화면에 보여줄 때는 앞뒤만 남긴다 — 어깨너머로 전체가 보이지 않게. */
export function maskKey(key: string): string {
  if (key.length <= 10) return '•'.repeat(key.length);
  return `${key.slice(0, 6)}${'•'.repeat(8)}${key.slice(-4)}`;
}

// ── 응답 파싱 ─────────────────────────────────────────────
interface InteractionResponse {
  output_text?: string;
  steps?: {
    type?: string;
    content?: { type?: string; text?: string }[];
  }[];
}

/**
 * 응답에서 텍스트를 꺼낸다.
 * output_text 는 편의 필드라 없을 수 있어 steps 순회를 폴백으로 둔다
 * (2026-05 개편에서 outputs → steps 로 바뀐 이력이 있어 방어적으로 읽는다).
 */
function extractText(data: InteractionResponse): string {
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text;
  }
  const chunks: string[] = [];
  for (const step of data.steps ?? []) {
    if (step.type && step.type !== 'model_output') continue;
    for (const c of step.content ?? []) {
      if (c.type === 'text' && typeof c.text === 'string') chunks.push(c.text);
    }
  }
  return chunks.join('');
}

// ── 공용 호출 ─────────────────────────────────────────────
/**
 * Interactions API 를 한 번 호출하고 본문 텍스트를 돌려준다.
 *
 * ⚠️ 실패는 전부 null 이다 — 예외를 던지지 않는다.
 * 이 모듈의 모든 기능은 '덧붙이는 층'이고, 호출부는 키가 없거나 네트워크가
 * 끊긴 상태에서도 자기 폴백으로 계속 동작해야 한다.
 */
export async function callGemini(opts: {
  input: string;
  systemInstruction?: string;
  /** 주면 JSON 모드로 부른다. 응답 텍스트는 이 스키마를 따르는 JSON 이다. */
  schema?: unknown;
  temperature?: number;
  thinkingLevel?: 'minimal' | 'low' | 'high';
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<string | null> {
  const key = getGeminiKey();
  if (!key || !opts.input) return null;

  // 자체 타임아웃 — 응답이 안 오면 화면을 붙잡지 않고 폴백으로 넘어간다.
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onOuterAbort);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        ...(opts.systemInstruction ? { system_instruction: opts.systemInstruction } : {}),
        input: opts.input,
        generation_config: {
          ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
          ...(opts.thinkingLevel ? { thinking_level: opts.thinkingLevel } : {}),
        },
        ...(opts.schema
          ? { response_format: { type: 'text', mime_type: 'application/json', schema: opts.schema } }
          : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const text = extractText((await res.json()) as InteractionResponse);
    return text || null;
  } catch {
    // 네트워크 실패·타임아웃·JSON 깨짐 — 전부 조용히 포기한다.
    return null;
  } finally {
    window.clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onOuterAbort);
  }
}

/** callGemini 의 JSON 응답을 파싱한다. 깨져 있으면 null. */
export function parseGeminiJson<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ── 문장 생성 ─────────────────────────────────────────────
export interface SentenceRequestScenario {
  id: string;
  label: string;
  hint: string;
  /** 누가 말하는 쪽인지 — 역할이 뒤바뀌는 것을 막는다 */
  role: string;
  /** 어떤 톤의 멘트인지 감을 주기 위한 예시 (이걸 그대로 쓰지는 말라고 지시한다) */
  samplePrompt: string;
}

export interface GeneratedSentence {
  word: string;
  scenarioId: string;
  /** 상대가 먼저 하는 말 */
  prompt: string;
  /** 사용자가 답할 문장 */
  text: string;
}

const SYSTEM_INSTRUCTION = [
  '너는 한국어 말더듬 연습 앱의 상황 생성기다.',
  '단어 하나마다 "상대가 하는 말"과 "사용자가 답할 문장"을 짝으로 만든다.',
  '',
  '규칙:',
  '1. ★ 가장 중요 — text 는 **반드시 주어진 단어로 시작**해야 한다.',
  '   말막힘은 발화를 시작하는 순간에 일어나므로, 단어가 문장 중간이나 끝에 있으면',
  '   그 단어 때문에 막혔는지 판별할 수 없다. 단어 앞에 어떤 말도 붙이지 마라.',
  '     맞음: "삼겹살 2인분 주세요"   틀림: "제가 삼겹살 먹고 싶어요"',
  '     맞음: "전화 언제 드릴까요?"   틀림: "그럼 전화 드릴게요"',
  '   단어 바로 뒤에 조사가 붙는 것은 괜찮다("삼겹살은 처음이에요").',
  '2. 주어진 단어를 **그대로** 쓴다. 형태를 바꾸거나 다른 말로 바꾸지 않는다.',
  '3. 상황 목록의 id 중 하나를 그대로 고른다. 없는 id 를 지어내지 마라.',
  '4. 상황마다 **누가 말하는 쪽인지 정해져 있다**(role). 역할을 뒤집지 마라.',
  '   예: 낯선 사람 상황은 "내가 길을 묻는" 쪽이다. 상대가 나에게 길을 묻게 만들면 안 된다.',
  '5. prompt 는 그 상황에서 **상대가 먼저 건네는 말**이다. 예시를 복사하지 말고 매번 다르게 쓴다.',
  '6. ★ 억지 설정을 만들지 마라.',
  '   단어를 끼워 넣으려고 이상한 상황을 지어내면 안 된다.',
  '   예: 면접에서 "Door" 를 넣으려고 "영단어 시험입니다" 같은 설정을 만드는 것 — 금지.',
  '   그 단어가 자연스럽게 나오는 상황이 목록에 없으면, **가장 덜 어색한 상황**을 고르고',
  '   설정을 지어내는 대신 문장을 평범하게 만든다.',
  '7. ★ prompt 와 text 를 소리 내어 읽었을 때 **실제 대화처럼 들려야 한다.**',
  '   질문과 답이 어긋나거나, 아무도 그렇게 말하지 않을 문장이면 다시 만들어라.',
  '8. prompt 와 text 모두 짧게. 각각 한 문장, 25자 이내.',
  '9. 조사를 정확히 쓴다(받침 유무에 따라 은/는, 이/가, 을/를).',
  '10. 영어 단어는 그대로 두되 **조사를 띄어 쓰지 마라**.',
  '    맞음: "Apple주스로 주세요" "Door는 저쪽이에요"',
  '    틀림: "Ice 로 부탁드려요" "Door 라고 합니다"',
  '10-1. 영어 단어는 외래어가 자연스러운 상황을 골라라(주문·계산·친구 대화 등).',
  '    면접이나 자기소개에 영어 단어를 넣으려고 "영어로 말해보세요" 같은 설정을',
  '    만드는 것은 규칙 6 위반이다. 차라리 카페에서 메뉴 이름으로 쓰는 편이 낫다.',
  '11. 존댓말/반말은 상황에 맞춘다(가족·친구는 반말, 나머지는 존댓말).',
  '',
  '나쁜 예: text="제가 삼겹살 먹고 싶어요" (단어가 앞에 없음 — 규칙 1 위반)',
  '나쁜 예: text="삼겹살 한 잔 주세요" (단위가 안 맞음)',
  '나쁜 예: prompt="영단어 시험입니다" (단어를 넣으려고 지어낸 설정 — 규칙 6 위반)',
  '좋은 예: prompt="주문하시겠어요?" / text="삼겹살 2인분 주세요"',
  '좋은 예: prompt="뭐 보러 갈까?" / text="오리 보러 가고 싶어"',
  '좋은 예: prompt="이 근처 사세요?" / text="다리 건너편에 살아요"',
].join('\n');

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    sentences: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          word: { type: 'string' },
          scenarioId: { type: 'string' },
          prompt: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['word', 'scenarioId', 'prompt', 'text'],
      },
    },
  },
  required: ['sentences'],
};

/**
 * 여러 단어의 상황 문장을 **한 번의 호출로** 만든다.
 * 단어마다 호출하면 28번 왕복이라 검사 시작이 하염없이 느려진다.
 *
 * @returns 실패하면 null — 호출부는 템플릿 문장으로 되돌아간다.
 */
export async function generateSituationSentences(
  words: string[],
  scenarios: SentenceRequestScenario[],
  signal?: AbortSignal,
): Promise<GeneratedSentence[] | null> {
  if (words.length === 0 || scenarios.length === 0) return null;

  const scenarioList = scenarios
    .map(s => [
      `- ${s.id} (${s.label}): ${s.hint}`,
      `    역할: ${s.role}`,
      `    멘트 예시(그대로 쓰지 말 것): "${s.samplePrompt}"`,
    ].join('\n'))
    .join('\n');

  const input = [
    '상황 목록:',
    scenarioList,
    '',
    '아래 단어 각각에 대해 다음을 만들어라:',
    '  scenarioId — 위 목록의 id 중 그 단어가 가장 자연스러운 상황',
    '  prompt     — 그 상황에서 상대가 먼저 하는 말 (매번 다르게)',
    '  text       — 그 말에 대한 답변. 주어진 단어를 그대로 포함할 것',
    '',
    `단어 ${words.length}개 전부에 대해 빠짐없이 만들어라.`,
    '',
    '단어 목록:',
    ...words.map(w => `- ${w}`),
  ].join('\n');

  const parsed = parseGeminiJson<{ sentences?: unknown }>(await callGemini({
    systemInstruction: SYSTEM_INSTRUCTION,
    input,
    schema: RESPONSE_SCHEMA,
    temperature: 0.9,
    // minimal 로 두면 단어를 끼워 넣으려고 억지 설정을 지어내는 일이 잦았다.
    // low 는 그보다 자연스럽고, 인트로에서 미리 생성하므로 지연은 체감되지 않는다.
    thinkingLevel: 'low',
    signal,
  }));
  if (!parsed || !Array.isArray(parsed.sentences)) return null;

  const validIds = new Set(scenarios.map(s => s.id));
  const wanted = new Set(words.map(w => w.trim().toLowerCase()));

  // 모델이 단어를 바꿔치기하거나 없는 상황 id 를 지어내면 그 항목만 버린다.
  // 검증 없이 받으면 "측정 대상 단어가 문장에 없는" 카드가 생겨 결과가 조용히 오염된다.
  const out: GeneratedSentence[] = [];
  for (const raw of parsed.sentences) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const word = String(r.word ?? '').trim();
    const scenarioId = String(r.scenarioId ?? '').trim();
    const sentence = String(r.text ?? '').trim();
    const prompt = String(r.prompt ?? '').trim();
    if (!word || !sentence) continue;
    if (!validIds.has(scenarioId)) continue;
    if (!wanted.has(word.toLowerCase())) continue;
    // ★ 검사 단어가 문장 **맨 앞**에 와야 한다.
    // 말막힘은 발화를 시작하는 순간에 일어나므로, 단어 앞에 다른 말이 붙으면
    // 그 단어 때문에 막혔는지 판별할 수 없다 — 그 카드의 4단계는 측정 자체가 무의미해진다.
    // 지시문만으로는 모델이 어길 수 있으므로 여기서 반드시 거른다(걸러진 카드는 템플릿을 쓴다).
    if (!sentence.toLowerCase().startsWith(word.toLowerCase())) continue;
    // 멘트는 없거나 지나치게 길면 버린다(호출부가 고정 멘트로 대체한다).
    out.push({ word, scenarioId, prompt: prompt.length <= 60 ? prompt : '', text: sentence });
  }
  return out.length > 0 ? out : null;
}

/** 키가 실제로 동작하는지 확인 (설정 화면의 '연결 확인'). */
export async function testGeminiKey(): Promise<{ ok: boolean; message: string }> {
  const key = getGeminiKey();
  if (!key) return { ok: false, message: '키가 없어요.' };

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, input: '안녕이라고만 답해.' }),
      signal: controller.signal,
    });
    if (res.ok) return { ok: true, message: '연결됐어요. 문장이 더 자연스러워집니다.' };
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return { ok: false, message: '키가 올바르지 않거나 권한이 없어요.' };
    }
    if (res.status === 429) {
      return { ok: false, message: '요청 한도를 넘었어요. 잠시 후 다시 시도해 주세요.' };
    }
    return { ok: false, message: `연결에 실패했어요 (HTTP ${res.status}).` };
  } catch {
    return { ok: false, message: '연결에 실패했어요. 네트워크를 확인해 주세요.' };
  } finally {
    window.clearTimeout(timer);
  }
}
