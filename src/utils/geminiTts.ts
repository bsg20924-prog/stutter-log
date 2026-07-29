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

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MODEL = 'gemini-3.1-flash-tts-preview';
const TIMEOUT_MS = 15000;


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

// 말투가 다르면 같은 문장이라도 다른 오디오다 — 키에 함께 넣는다.
function cacheKey(text: string, voice: string, style: string): string {
  return `${voice}|${style}|${text}`;
}

async function requestTts(
  text: string, voice: string, style: string, apiKey: string,
): Promise<string | null> {
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
      backoffUntil = Date.now() + BACKOFF_MS;
      return null;
    }
    if (!res.ok) return null;

    const data = await res.json() as {
      steps?: { content?: { data?: string; sample_rate?: number; channels?: number }[] }[];
    };
    // 오디오는 steps[].content[] 안에 들어온다 (문서의 output_audio 가 아니다 — 실측 확인).
    const audio = (data.steps ?? [])
      .flatMap(s => s.content ?? [])
      .find(c => typeof c.data === 'string' && c.data.length > 0);
    if (!audio?.data) return null;

    const blob = pcmToWav(audio.data, audio.sample_rate ?? 24000, audio.channels ?? 1);
    return URL.createObjectURL(blob);
  } catch {
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
  if (!text || !apiKey || isBackingOff()) return;
  const voice = voiceForScenario(scenarioId);
  const style = styleForScenario(scenarioId);
  const key = cacheKey(text, voice, style);
  if (cache.has(key) || inflight.has(key)) return;

  const p = requestTts(text, voice, style, apiKey).then(url => {
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

/** 목소리를 바꾸면 이전 목소리로 만든 캐시는 쓸모없다. */
export function clearTtsCache(): void {
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
  inflight.clear();
}
