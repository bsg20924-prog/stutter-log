// Gemini TTS — 상대의 말을 실제 사람 목소리에 가깝게 들려준다.
//
// ⚠️ 이건 '덧붙이는 층'이다. 없어도 앱은 브라우저 내장 음성(speech.ts)으로 완전히 동작한다.
//
// 왜 미리 몰아서 만들지 않는가:
// 무료 한도의 분당 호출 제한(RPM)이 낮아서 28개를 한 번에 요청하면 바로 429 가 난다.
// 대신 카드에 도달할 때 그 문장만 만들고 다음 것을 하나 미리 준비한다.
// 사람이 카드당 30~40초를 쓰므로 자연스럽게 제한 안에 들어온다.
//
// 응답은 raw PCM(audio/l16, 24kHz mono 16bit)이라 <audio> 로 바로 못 튼다 — WAV 헤더를 씌운다.

import { loadTtsBlob, saveTtsBlob } from './ttsStore';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MODEL = 'gemini-3.1-flash-tts-preview';
/**
 * ⚠️ 이 값이 실제 상한이다. 호출부에서 아무리 오래 기다려도 여기서 끊기면 끝이다.
 *
 * 15초로 두었다가 오래 헤맸다 — 컴포넌트 쪽 대기만 늘리며 원인을 엉뚱한 데서 찾았고,
 * 정작 fetch 는 15초에 스스로 abort 되고 있었다. 실측 생성 시간이 5~15초라
 * 하필 경계에 걸려서 "가끔 되고 대부분 안 되는" 모습으로 보였다.
 *
 * 그래서 40 → 25 → 45초로 오갔다. 마지막 판단의 근거는 시간이 아니라 **할당량**이다.
 * 끊은 요청은 서버 쪽에 499 로 남고 **일일 100회에서 그대로 차감된다**
 * (콘솔 오류 차트에서 확인). 즉 성급하게 끊으면 할당량만 버리고 아무것도 못 얻는다.
 * 미리받기는 이제 한 번에 하나씩 6.5초 간격으로 돌므로 오래 기다려도 뒤가 밀릴 뿐이다.
 * 기다려서 받아내는 편이 언제나 이득이다.
 */
const TIMEOUT_MS = 45000;

/**
 * preview 모델은 과부하로 500 을 자주 돌려준다
 * ("currently experiencing high demand" — 실측 확인).
 * 일시적인 것이라 한 번은 다시 시도해 볼 값어치가 있다. 두 번은 하지 않는다 —
 * 사람이 기다리는 중이고, 실패하면 브라우저 음성이라는 멀쩡한 대안이 있다.
 */
const RETRY_DELAY_MS = 1200;


/** 들어보고 고른 것들 — 한국어에서 자연스러운 축 */
export const GEMINI_VOICES = [
  { id: 'Kore',   label: '차분한 여성' },
  { id: 'Leda',   label: '밝은 여성' },
  { id: 'Aoede',  label: '부드러운 여성' },
  { id: 'Puck',   label: '경쾌한 남성' },
  { id: 'Charon', label: '낮은 남성' },
];

export const DEFAULT_GEMINI_VOICE = 'Kore';

/**
 * 상황마다 다른 사람이 말한다.
 * 점원·면접관·친구가 같은 목소리로 말하면 상황이 구분되지 않는다.
 * 목소리와 말투를 함께 바꿔 실제로 다른 사람처럼 들리게 한다.
 *
 * 말투는 pitch 를 건드리는 대신 **자연어 지시**로 준다 — Gemini TTS 가
 * 의도한 조절 방식이라 음질이 상하지 않는다.
 */
const SCENARIO_VOICE: Record<string, { voice: string; style: string }> = {
  'order-cafe':        { voice: 'Leda',   style: '밝고 친절한 카페 점원 말투로, 조금 빠르게' },
  'checkout':          { voice: 'Aoede',  style: '사무적이고 빠른 계산대 직원 말투로' },
  'introduction':      { voice: 'Charon', style: '정중하고 또렷한 진행자 말투로, 천천히' },
  'interview':         { voice: 'Charon', style: '차분하고 진지한 면접관 말투로, 천천히 누르듯이' },
  'phone-reservation': { voice: 'Kore',   style: '또박또박한 전화 상담원 말투로' },
  'stranger':          { voice: 'Puck',   style: '살짝 경계하는 낯선 사람 말투로, 조심스럽게' },
  'peers':             { voice: 'Puck',   style: '편하고 빠른 친구 반말 말투로' },
  'family':            { voice: 'Kore',   style: '다정한 가족 반말 말투로' },
};

/** 상황마다 다른 사람이 말한다. */
export function voiceForScenario(scenarioId?: string): string {
  return (scenarioId && SCENARIO_VOICE[scenarioId]?.voice) || DEFAULT_GEMINI_VOICE;
}

export function styleForScenario(scenarioId?: string): string {
  return (scenarioId && SCENARIO_VOICE[scenarioId]?.style) || '';
}

// 설정으로 두지 않는다. 키가 있으면 항상 AI 음성을 쓰고, 준비가 안 되면
// 브라우저 음성으로 조용히 내려간다 — 사용자가 고를 이유가 없는 결정이다.

// ── 진단 ──────────────────────────────────────────────────
// 이 모듈은 모든 실패를 null 로 삼키고 브라우저 음성으로 조용히 내려간다.
// 사용자 입장에서는 그게 맞지만, 개발 중에는 그 침묵 때문에 원인을 볼 수가 없다
// ("결제까지 했는데 왜 아직 브라우저 음성이냐" — 400 인지 429 인지 응답 구조가
// 바뀐 건지 화면상 구분이 안 됐다). DEV 에서만 이유를 찍는다.
function warn(reason: string, detail?: string): void {
  if (!import.meta.env.DEV) return;
  console.warn(`[TTS] ${reason}`, detail ?? '');
}

/** 오류 본문을 읽되, 읽다가 또 실패해서 원인이 가려지지 않게 한다. */
async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 600);
  } catch {
    return '(본문을 읽지 못함)';
  }
}

// ── 응답에서 오디오 찾기 ──────────────────────────────────
//
// ⚠️ 오디오가 실려 오는 위치가 한 번 이상 바뀌었다.
// 문서는 output_audio.data 라고 하는데, 2026-07-29 실측에서는 steps[].content[] 안에
// 들어 있었다. 어느 쪽이든 받도록 둘 다 훑는다 — 한쪽만 읽으면 API 가 조용히 정리될 때
// 기능이 통째로 죽고, 실패가 null 로 삼켜져서 "브라우저 음성만 나온다"로만 보인다.
// 실제로 그 일이 있었다.

interface AudioChunk {
  data?: string;
  sample_rate?: number;
  channels?: number;
}

interface TtsResponse {
  output_audio?: AudioChunk;
  steps?: { content?: AudioChunk[] }[];
  // 혹시 한 겹 더 감싸는 형태로 바뀌는 경우까지 방어한다.
  interaction?: { output_audio?: AudioChunk };
}

function hasData(c: AudioChunk | undefined): c is AudioChunk {
  return typeof c?.data === 'string' && c.data.length > 0;
}

function findAudio(data: TtsResponse): AudioChunk | null {
  const candidates: (AudioChunk | undefined)[] = [
    data.output_audio,
    data.interaction?.output_audio,
    ...(data.steps ?? []).flatMap(s => s.content ?? []),
  ];
  return candidates.find(hasData) ?? null;
}

// ── PCM → WAV ────────────────────────────────────────────
function pcmToWav(base64: string, sampleRate: number, channels: number): Blob {
  const bin = atob(base64);
  const pcm = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);

  const buf = new ArrayBuffer(44 + pcm.length);
  const v = new DataView(buf);
  const wr = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  wr(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length, true);
  wr(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);                                   // PCM
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  wr(36, 'data');
  v.setUint32(40, pcm.length, true);
  new Uint8Array(buf, 44).set(pcm);
  return new Blob([buf], { type: 'audio/wav' });
}

// ── 캐시 & 백오프 ─────────────────────────────────────────
// 같은 문장을 다시 요청하지 않는다(다시 듣기 버튼 포함).
const cache = new Map<string, string>();        // key → objectURL
const inflight = new Map<string, Promise<string | null>>();

// 429 를 맞으면 잠시 쉰다. 계속 두드리면 한도만 더 태운다.
let backoffUntil = 0;
const BACKOFF_MS = 60_000;

export function isBackingOff(): boolean {
  return Date.now() < backoffUntil;
}

/**
 * 할당량을 다 썼는지. 이건 기다린다고 풀리지 않는다 —
 * 요금제/결제를 확인하거나 한도가 갱신되기를 기다려야 한다.
 * 이 상태에서는 더 던지지 말고 사용자에게 사실대로 알려야 한다.
 */
let quotaExhausted = false;

export function isQuotaExhausted(): boolean {
  return quotaExhausted;
}

/** 사용자가 다시 시도하겠다고 할 때 (키를 바꿨거나 하루가 지났거나) */
export function resetQuotaFlag(): void {
  quotaExhausted = false;
}

// 말투가 다르면 같은 문장이라도 다른 오디오다 — 키에 함께 넣는다.
function cacheKey(text: string, voice: string, style: string): string {
  return `${voice}|${style}|${text}`;
}

async function requestTts(
  text: string, voice: string, style: string, apiKey: string,
  /** 5xx 를 만났을 때 한 번 더 시도할지 */
  retry = true,
): Promise<Blob | null> {
  // Gemini TTS 는 자연어로 말투를 지시한다. pitch 파라미터를 흔드는 것과 달리
  // 모델이 의도한 조절 방식이라 음질이 상하지 않는다.
  const prompt = style ? `${style} 말해줘: ${text}` : text;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        input: prompt,
        response_format: { type: 'audio' },
        generation_config: { speech_config: [{ voice }] },
      }),
      signal: controller.signal,
    });

    if (res.status === 429) {
      const body = await safeText(res);
      // ⚠️ 429 에는 성격이 다른 두 가지가 섞여 있고, 대응이 정반대다.
      //   · 분당 호출 제한 → 잠깐 쉬면 풀린다
      //   · 할당량 소진("exceeded your current quota") → 기다려도 안 풀린다.
      //     이걸 재시도하면 시간만 태우고, 화면에는 "서버가 바빠서"라는
      //     틀린 안내가 뜬다. 실제로 그 상태로 한참 헤맸다.
      if (/exceeded your current quota|check your plan and billing/i.test(body)) {
        quotaExhausted = true;
        warn('할당량 소진 — 재시도해도 소용없다', body);
        return null;
      }
      backoffUntil = Date.now() + BACKOFF_MS;
      warn('429 분당 한도 — 잠시 쉰다', body);
      return null;
    }
    if (!res.ok) {
      const body = await safeText(res);
      warn(`HTTP ${res.status}`, body);
      // 과부하(5xx)는 일시적이다 — 딱 한 번만 다시 시도한다.
      if (res.status >= 500 && retry) {
        await new Promise(r => window.setTimeout(r, RETRY_DELAY_MS));
        return requestTts(text, voice, style, apiKey, false);
      }
      return null;
    }

    const data = await res.json() as TtsResponse;
    const audio = findAudio(data);
    if (!audio?.data) {
      // 응답은 200 인데 오디오가 없다 = 응답 모양이 또 바뀌었다는 뜻이다.
      warn('200 이지만 오디오가 없음 — 응답 구조 확인 필요', JSON.stringify(data).slice(0, 600));
      return null;
    }

    return pcmToWav(audio.data, audio.sample_rate ?? 24000, audio.channels ?? 1);
  } catch (e) {
    warn('요청 실패(네트워크·타임아웃)', String(e));
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * 문장 오디오를 미리 만들어 캐시에 넣는다 (fire-and-forget).
 * 실패는 조용히 무시한다 — 재생 시점에 브라우저 음성으로 넘어간다.
 */
export function prefetchTts(text: string, apiKey: string, scenarioId?: string): void {
  if (!text || !apiKey) return;
  const voice = voiceForScenario(scenarioId);
  const style = styleForScenario(scenarioId);
  const key = cacheKey(text, voice, style);
  if (cache.has(key) || inflight.has(key)) return;

  const p = (async (): Promise<string | null> => {
    // ★ 먼저 영구 보관함을 본다. 여기서 맞으면 요청 자체가 없다 —
    // 돈도 안 들고, preview 모델의 과부하·지연도 통째로 비껴간다.
    const stored = await loadTtsBlob(key);
    if (stored) return URL.createObjectURL(stored);

    // 백오프 판정은 실제로 네트워크를 쓸 때만 한다.
    // 위에서 걸러졌으면 한도와 무관하게 재생할 수 있어야 한다.
    if (isBackingOff()) return null;

    const blob = await requestTts(text, voice, style, apiKey);
    if (!blob) return null;
    void saveTtsBlob(key, blob);   // 실패해도 이번 세션은 메모리 캐시로 돈다
    return URL.createObjectURL(blob);
  })().then(url => {
    inflight.delete(key);
    if (url) cache.set(key, url);
    return url;
  });
  inflight.set(key, p);
}

/** 이미 준비된 오디오 URL. 없으면 null — 호출부는 즉시 브라우저 음성으로 간다. */
export function getReadyTts(text: string, scenarioId?: string): string | null {
  return cache.get(cacheKey(text, voiceForScenario(scenarioId), styleForScenario(scenarioId))) ?? null;
}

/** 미리 듣기 등 '기다려도 되는' 경우에만 쓴다. */
export async function generateTts(
  text: string, apiKey: string, scenarioId?: string,
): Promise<string | null> {
  if (!text || !apiKey) return null;
  const key = cacheKey(text, voiceForScenario(scenarioId), styleForScenario(scenarioId));
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = inflight.get(key);
  if (pending) return pending;

  prefetchTts(text, apiKey, scenarioId);
  return inflight.get(key) ?? null;
}

// ── 미리 받아두기 ─────────────────────────────────────────
//
// 대화 도중에 음성을 만드는 것은 성립하지 않는다(모듈 상단 주석 참고).
// 고정 대사는 미리 한 번만 받아 영구 보관하고, 그 뒤로는 네트워크를 타지 않는다.

/** 이 대사의 음성이 이미 보관돼 있는지. */
export async function hasStoredTts(text: string, scenarioId?: string): Promise<boolean> {
  const key = cacheKey(text, voiceForScenario(scenarioId), styleForScenario(scenarioId));
  if (cache.has(key)) return true;
  return (await loadTtsBlob(key)) !== null;
}

/**
 * 이 대사의 음성을 확보한다. 이미 있으면 아무 것도 하지 않는다.
 * 대화 중이 아니라 준비 단계에서 부르는 것이라 오래 걸려도 된다.
 *
 * @returns 확보 성공 여부
 */
export async function ensureTts(
  text: string, apiKey: string, scenarioId?: string,
): Promise<boolean> {
  if (!text || !apiKey) return false;
  if (await hasStoredTts(text, scenarioId)) return true;
  prefetchTts(text, apiKey, scenarioId);
  const key = cacheKey(text, voiceForScenario(scenarioId), styleForScenario(scenarioId));
  const url = await (inflight.get(key) ?? Promise.resolve(null));
  return url !== null;
}

/** 목소리를 바꾸면 이전 목소리로 만든 캐시는 쓸모없다. */
export function clearTtsCache(): void {
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
  inflight.clear();
}
