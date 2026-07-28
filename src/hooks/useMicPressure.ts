// 소리 지도 3단계(녹음 압박)용 마이크 훅.
//
// ⚠️ 개인정보 원칙: 녹음된 오디오는 어디에도 저장하지 않는다.
// MediaRecorder 를 돌리는 이유는 오직 "지금 진짜로 녹음 중"이라는 압박을 만들기 위해서다.
// ondataavailable 로 들어온 Blob 은 담아두는 배열조차 없이 즉시 버려지고,
// 단계를 벗어나거나 테스트를 닫으면 스트림 트랙까지 정리한다.

import { useCallback, useEffect, useRef, useState } from 'react';

export type MicState =
  | 'idle'          // 아직 시작 전
  | 'requesting'    // 마이크 권한 요청 중
  | 'countdown'     // 3-2-1
  | 'recording'     // 실제 녹음 중
  | 'denied'        // 권한 거부 → 수동 압박 모드
  | 'unsupported';  // 브라우저/환경 미지원 → 수동 압박 모드

export const COUNTDOWN_FROM = 3;
const COUNTDOWN_INTERVAL = 800;   // ms
const FFT_SIZE = 1024;

// 마이크를 쓸 수 있는 환경인지. https(또는 localhost)가 아니면 getUserMedia 자체가 없다.
export function isMicSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  );
}

// iOS Safari 는 audio/webm 을 지원하지 않는다 — 지원하는 형식만 지정하고, 없으면 옵션 없이 생성.
function makeRecorder(stream: MediaStream): MediaRecorder {
  for (const mimeType of ['audio/webm', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported?.(mimeType)) {
      try {
        return new MediaRecorder(stream, { mimeType });
      } catch {
        // 다음 후보로
      }
    }
  }
  return new MediaRecorder(stream);
}

export interface MicPressure {
  state: MicState;
  elapsedSec: number;
  countdownValue: number;
  /** 권한을 한 번이라도 받았는지 — 이후 카드는 버튼 없이 자동 시작한다. */
  grantedOnce: boolean;
  /** 이번 라운드에 실제 녹음이 시작됐는지 (응답에 mic/manual 을 남길 때 사용) */
  didRecordRef: React.MutableRefObject<boolean>;
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  start: () => void;
  stop: () => void;
}

export function useMicPressure(useCountdown: boolean): MicPressure {
  const [state, setState] = useState<MicState>('idle');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [countdownValue, setCountdownValue] = useState(COUNTDOWN_FROM);
  const [grantedOnce, setGrantedOnce] = useState(false);

  // 세대 카운터: getUserMedia 가 늦게 resolve 됐을 때 이미 단계를 벗어났는지 판별한다.
  const genRef = useRef(0);
  const activeRef = useRef(false);
  const didRecordRef = useRef(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const tickTimerRef = useRef<number | null>(null);

  // 마이크/타이머/오디오 컨텍스트를 전부 정리한다. 몇 번 호출해도 안전해야 한다.
  const teardown = useCallback(() => {
    genRef.current += 1;   // 진행 중인 요청 무효화
    activeRef.current = false;

    if (countdownTimerRef.current !== null) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (tickTimerRef.current !== null) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }

    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();   // 마지막 청크도 ondataavailable 에서 그대로 버려진다
      } catch {
        // 이미 정지된 경우
      }
    }

    // 트랙을 꺼야 브라우저 탭의 마이크 표시등이 실제로 꺼진다.
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach(t => t.stop());

    analyserRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
  }, []);

  const beginRecording = useCallback((gen: number) => {
    if (genRef.current !== gen) return;
    const stream = streamRef.current;
    if (!stream) return;

    try {
      const rec = makeRecorder(stream);
      // 청크를 담아두는 곳이 없다 — 도착하는 즉시 버린다.
      rec.ondataavailable = () => {};
      rec.start(1000);
      recorderRef.current = rec;
    } catch {
      // 레코더 생성이 실패해도 스트림 기반 압박 UI 는 그대로 유지한다.
    }

    didRecordRef.current = true;
    setState('recording');
    setElapsedSec(0);

    const startedAt = performance.now();
    let lastSec = 0;
    tickTimerRef.current = window.setInterval(() => {
      const sec = Math.floor((performance.now() - startedAt) / 1000);
      if (sec !== lastSec) {
        lastSec = sec;
        setElapsedSec(sec);   // 초가 바뀔 때만 리렌더
      }
    }, 200);
  }, []);

  const start = useCallback(() => {
    if (activeRef.current) return;   // 재진입 방어 — 이미 요청/카운트다운/녹음 중
    if (!isMicSupported()) {
      setState('unsupported');
      return;
    }

    teardown();
    const gen = genRef.current;
    activeRef.current = true;
    didRecordRef.current = false;
    setElapsedSec(0);
    setState('requesting');

    void (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        if (genRef.current === gen) {
          activeRef.current = false;
          setState('denied');
        }
        return;
      }

      // 늦게 도착한 스트림: 이미 단계를 벗어났으므로 즉시 꺼서 마이크가 열린 채로 남지 않게 한다.
      if (genRef.current !== gen) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;
      setGrantedOnce(true);

      // 파형용 분석기. 실패해도 파형만 없을 뿐 녹음 압박은 계속된다.
      try {
        const Ctor = window.AudioContext ?? (window as unknown as {
          webkitAudioContext: typeof AudioContext;
        }).webkitAudioContext;
        const ctx = new Ctor();
        ctxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0.7;
        ctx.createMediaStreamSource(stream).connect(analyser);
        analyserRef.current = analyser;
      } catch {
        analyserRef.current = null;
      }

      if (!useCountdown) {
        beginRecording(gen);
        return;
      }

      // 권한 창이 카운트다운을 끊지 않도록, 권한이 해결된 뒤에 3-2-1 을 돌린다.
      let n = COUNTDOWN_FROM;
      setCountdownValue(n);
      setState('countdown');
      countdownTimerRef.current = window.setInterval(() => {
        n -= 1;
        if (n <= 0) {
          if (countdownTimerRef.current !== null) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          beginRecording(gen);
        } else {
          setCountdownValue(n);
        }
      }, COUNTDOWN_INTERVAL);
    })();
  }, [teardown, beginRecording, useCountdown]);

  const stop = useCallback(() => {
    teardown();
    setElapsedSec(0);
    // 거부/미지원은 유지한다 — 카드마다 권한을 다시 물어보지 않기 위해.
    setState(s => (s === 'denied' || s === 'unsupported' ? s : 'idle'));
  }, [teardown]);

  // 탭을 벗어나거나 페이지를 떠나면 녹음을 멈춘다. 언마운트 시에도 무조건 정리.
  useEffect(() => {
    const handleHide = () => {
      teardown();
      setState(s => (s === 'requesting' || s === 'countdown' || s === 'recording' ? 'idle' : s));
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') handleHide();
    };
    window.addEventListener('pagehide', handleHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', handleHide);
      document.removeEventListener('visibilitychange', onVisibility);
      teardown();
    };
  }, [teardown]);

  return { state, elapsedSec, countdownValue, grantedOnce, didRecordRef, analyserRef, start, stop };
}
