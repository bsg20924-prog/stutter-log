// 상황 시뮬레이션용 음성 출력 — 한국어 TTS + 실패 시 차임 폴백.
//
// iOS Safari 제약이 이 파일의 설계를 거의 다 결정한다:
//
// 1. 소리(speechSynthesis, AudioContext)는 **사용자 터치 핸들러 안에서 동기적으로**
//    시작해야 한다. await 뒤로 넘어가면 제스처 컨텍스트가 끊겨 조용히 무시된다.
//    그래서 speak() 는 async 가 아니라 콜백을 받는 동기 함수다.
//
// 2. utterance.onend 가 아예 발생하지 않는 경우가 있다(알려진 WebKit 버그).
//    워치독 타이머가 없으면 화면이 영원히 "듣는 중"에서 멈춘다 — 반드시 둔다.
//
// 3. getVoices() 는 처음엔 빈 배열을 주고 voiceschanged 이후에 채워진다.
//    터치 시점에 기다릴 수 없으므로 미리 데워 두고, 그때도 없으면 폴백으로 간다.

export type SpeechOutcome = 'spoken' | 'fallback';

/** 한국어 음성이 준비됐는지 미리 확인해 두기 위해 목록을 데운다. */
export function warmUpVoices(onReady?: () => void): () => void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return () => {};
  // 첫 호출은 비어 있어도 브라우저가 로딩을 시작하게 만든다.
  window.speechSynthesis.getVoices();
  const handler = () => onReady?.();
  window.speechSynthesis.addEventListener?.('voiceschanged', handler);
  return () => window.speechSynthesis.removeEventListener?.('voiceschanged', handler);
}

export function isSpeechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

function findKoreanVoice(): SpeechSynthesisVoice | null {
  if (!isSpeechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  return voices.find(v => v.lang?.toLowerCase().startsWith('ko')) ?? null;
}

/** 한국어로 읽어 줄 수 있는 상태인지 — 화면에서 미리 안내할 때 쓴다. */
export function hasKoreanVoice(): boolean {
  return findKoreanVoice() !== null;
}

// 한국어를 분당 약 300음절로 잡고 읽기 시간을 추정한다.
// onend 가 오지 않을 때 강제로 진행시키는 워치독의 기준이며, 넉넉하게 잡는다.
const MS_PER_CHAR = 190;
const WATCHDOG_PADDING_MS = 1400;
const WATCHDOG_MIN_MS = 1800;

function estimateDurationMs(text: string): number {
  return Math.max(WATCHDOG_MIN_MS, text.length * MS_PER_CHAR + WATCHDOG_PADDING_MS);
}

// ── 차임: 오디오 파일 없이 WebAudio 로 만든다(자체 완결, CSP 안전) ──────
let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!sharedCtx || sharedCtx.state === 'closed') {
      const Ctor = window.AudioContext ?? (window as unknown as {
        webkitAudioContext: typeof AudioContext;
      }).webkitAudioContext;
      if (!Ctor) return null;
      sharedCtx = new Ctor();
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

/**
 * iOS 는 첫 터치에서 AudioContext 를 만들어 두지 않으면 이후 재생이 막힌다.
 * 시작 버튼 핸들러 맨 앞에서 동기적으로 호출할 것.
 */
export function primeAudio(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {});
}

/** 짧은 2음 차임. TTS 를 못 쓸 때 "상대가 말했다"는 신호를 귀로도 준다. */
export function playChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    [
      { freq: 880, at: 0,    dur: 0.16 },
      { freq: 1320, at: 0.14, dur: 0.22 },
    ].forEach(({ freq, at, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + at);
      // 딱딱한 클릭음이 나지 않도록 짧게 올렸다 지수적으로 내린다.
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.18, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + dur + 0.02);
    });
  } catch {
    // 소리가 안 나도 시각 말풍선이 있으므로 흐름은 계속된다.
  }
}

export interface SpeakHandle {
  cancel: () => void;
}

/**
 * 프롬프트를 읽고, 끝나면 onDone(outcome) 을 정확히 한 번 호출한다.
 *
 * ⚠️ 반드시 사용자 터치 핸들러 안에서 **동기적으로** 호출할 것.
 * 한국어 음성이 없거나 speak 가 실패하면 차임을 울리고 즉시 fallback 으로 끝낸다
 * (호출한 쪽은 말풍선을 띄워 눈으로 읽게 한다).
 */
export function speakPrompt(
  text: string,
  onDone: (outcome: SpeechOutcome) => void,
): SpeakHandle {
  let finished = false;
  let watchdog: number | null = null;

  const finish = (outcome: SpeechOutcome) => {
    if (finished) return;
    finished = true;
    if (watchdog !== null) {
      window.clearTimeout(watchdog);
      watchdog = null;
    }
    onDone(outcome);
  };

  const fallback = () => {
    playChime();
    // 말풍선을 읽을 시간을 준 뒤 넘어간다. 즉시 넘기면 글자를 읽기도 전에 카운트다운이 시작된다.
    watchdog = window.setTimeout(() => finish('fallback'), estimateDurationMs(text));
  };

  const voice = findKoreanVoice();
  if (!isSpeechSupported() || !voice) {
    fallback();
    return { cancel: () => finish('fallback') };
  }

  try {
    // 이전 발화가 큐에 남아 있으면 onend 순서가 꼬인다.
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang || 'ko-KR';
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => finish('spoken');
    utterance.onerror = () => {
      // 재생 도중 실패 — 차임으로라도 신호를 준다.
      if (finished) return;
      playChime();
      finish('fallback');
    };

    window.speechSynthesis.speak(utterance);

    // onend 가 오지 않는 WebKit 버그 대비. 이게 없으면 화면이 멈춘다.
    watchdog = window.setTimeout(() => finish('spoken'), estimateDurationMs(text));
  } catch {
    fallback();
  }

  return {
    cancel: () => {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // 무시
      }
      finish('fallback');
    },
  };
}

/** 화면을 벗어날 때 남은 발화를 정리한다. */
export function cancelSpeech(): void {
  if (!isSpeechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // 무시
  }
}
