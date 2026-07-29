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

// ── 문장 생성 ─────────────────────────────────────────────
export interface SentenceRequestScenario {
  id: string;
  label: string;
  ttsPrompt: string;
}

export interface GeneratedSentence {
  word: string;
  scenarioId: string;
  text: string;
}

const SYSTEM_INSTRUCTION = [
  '너는 한국어 말더듬 연습 앱의 문장 생성기다.',
  '사용자가 실제 상황에서 말할 법한 자연스러운 한국어 문장을 만든다.',
  '',
  '규칙:',
  '1. 주어진 단어를 문장에 **그대로** 포함시킨다. 형태를 바꾸거나 다른 말로 바꾸지 않는다.',
  '2. 주어진 상황 중 그 단어가 가장 자연스럽게 들어갈 상황 하나를 고른다.',
  '3. 문장은 짧게. 한 문장, 25자 이내.',
  '4. 조사를 정확히 쓴다(받침 유무에 따라 은/는, 이/가, 을/를).',
  '5. 어색하면 억지로 끼워 넣지 말고, 그 단어가 주인공이 되는 자연스러운 발화를 만든다.',
  '6. 영어 단어는 한국어 문장 안에 그대로 둔다.',
  '',
  '나쁜 예: "삼겹살 한 잔 주세요" (단위가 안 맞음)',
  '나쁜 예: "안녕하세요, 오리입니다" (뜻이 무너짐)',
  '좋은 예: "삼겹살 2인분 주세요"',
  '좋은 예: "오리 보러 가고 싶어요"',
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
          text: { type: 'string' },
        },
        required: ['word', 'scenarioId', 'text'],
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
  const key = getGeminiKey();
  if (!key || words.length === 0 || scenarios.length === 0) return null;

  const scenarioList = scenarios
    .map(s => `- ${s.id} (${s.label}): 상대가 "${s.ttsPrompt}" 라고 말한 직후 상황`)
    .join('\n');

  const input = [
    '상황 목록:',
    scenarioList,
    '',
    '아래 단어 각각에 대해, 위 상황 중 하나를 골라 그 단어가 들어간 자연스러운 한국어 문장을 하나씩 만들어라.',
    'scenarioId 는 반드시 위 목록의 id 중 하나여야 한다.',
    '',
    '단어 목록:',
    ...words.map(w => `- ${w}`),
  ].join('\n');

  // 자체 타임아웃 — 응답이 안 오면 검사를 붙잡지 않고 템플릿으로 넘어간다.
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener('abort', onOuterAbort);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'x-goog-api-key': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        system_instruction: SYSTEM_INSTRUCTION,
        input,
        generation_config: { temperature: 0.7 },
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: RESPONSE_SCHEMA,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const data = (await res.json()) as InteractionResponse;
    const text = extractText(data);
    if (!text) return null;

    const parsed = JSON.parse(text) as { sentences?: unknown };
    if (!Array.isArray(parsed.sentences)) return null;

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
      if (!word || !sentence) continue;
      if (!validIds.has(scenarioId)) continue;
      if (!wanted.has(word.toLowerCase())) continue;
      // 단어가 실제로 문장 안에 들어 있어야 한다 — 이게 이 단계의 측정 대상이다.
      if (!sentence.toLowerCase().includes(word.toLowerCase())) continue;
      out.push({ word, scenarioId, text: sentence });
    }
    return out.length > 0 ? out : null;
  } catch {
    // 네트워크 실패·타임아웃·JSON 깨짐 — 전부 조용히 포기한다.
    return null;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }
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
