// Stage 4(상황 시뮬레이션) 전용 녹음 훅 — 다시 듣기용으로 이 기기에 저장한다.
//
// ⚠️ useMicPressure 와 절대 합치지 말 것.
// useMicPressure 는 Stage 3 압박 장치이고 오디오를 즉시 버린다. 이 훅은 저장이 목적이다.
// 하나의 훅에 save 플래그를 다는 순간, "Stage 3 녹음은 안 남는다"는 보장이
// 플래그 하나에 매달리게 된다 — 목적이 다르면 경로도 나눈다.
//
// 저장 위치는 IndexedDB 뿐이고 Firebase 로는 어떤 경로로도 나가지 않는다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { saveClip, isRecordingStoreSupported } from '../utils/recordingStore';

export type RecorderState =
  | 'idle'         // 대기
  | 'ready'        // 마이크 확보됨 — 응답 창에서 바로 시작 가능
  | 'recording'
  | 'denied'       // 권한 거부 — 녹음만 끄고 시뮬레이션은 계속
  | 'unsupported';

export function isSimRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined' &&
    isRecordingStoreSupported()
  );
}

// iOS Safari 는 audio/webm 을 지원하지 않는다 — 지원하는 형식만 지정한다.
function pickMimeType(): string | undefined {
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return undefined;
}

export interface SimRecorderClipInput {
  sentenceId: string;
  scenarioLabel: string;
  text: string;
}

export interface SimRecorder {
  state: RecorderState;
  /** 이번 세션에 저장된 클립 수 — 화면에 "N개 저장됨"으로 안내 */
  savedCount: number;
  sessionId: string;
  /**
   * 마이크 권한을 확보한다.
   * ⚠️ 반드시 사용자 터치 핸들러 안에서 호출할 것 — iOS 는 제스처 밖 권한 요청을 막는다.
   */
  arm: () => void;
  start: () => void;
  /** 녹음을 멈추고 IndexedDB 에 저장한다. 실패해도 예외를 던지지 않는다. */
  stopAndSave: (clip: SimRecorderClipInput) => Promise<string | null>;
  /** 저장하지 않고 버린다 (건너뛰기 등) */
  discard: () => void;
  release: () => void;
}

export function useSimRecorder(enabled: boolean): SimRecorder {
  const [state, setState] = useState<RecorderState>('idle');
  const [savedCount, setSavedCount] = useState(0);

  const sessionIdRef = useRef<string>(uuidv4());
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);

  const release = useCallback(() => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch { /* 이미 정지 */ }
    }
    chunksRef.current = [];
    // 트랙을 꺼야 탭의 마이크 표시등이 실제로 꺼진다.
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach(t => t.stop());
    setState(s => (s === 'denied' || s === 'unsupported' ? s : 'idle'));
  }, []);

  const arm = useCallback(() => {
    if (!enabled) return;
    if (!isSimRecordingSupported()) { setState('unsupported'); return; }
    if (streamRef.current) { setState('ready'); return; }

    void navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        streamRef.current = stream;
        setState('ready');
      })
      .catch(() => setState('denied'));
  }, [enabled]);

  const start = useCallback(() => {
    const stream = streamRef.current;
    if (!enabled || !stream) return;
    try {
      const mimeType = pickMimeType();
      const rec = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.start();
      recorderRef.current = rec;
      startedAtRef.current = performance.now();
      setState('recording');
    } catch {
      // 레코더 생성 실패 — 녹음만 포기하고 시뮬레이션은 계속된다.
      setState('ready');
    }
  }, [enabled]);

  const stopAndSave = useCallback(async (input: SimRecorderClipInput) => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (!rec || rec.state === 'inactive') { setState(s => (s === 'recording' ? 'ready' : s)); return null; }

    const durationMs = Math.round(performance.now() - startedAtRef.current);
    const mimeType = rec.mimeType || 'audio/webm';

    // stop() 이후 마지막 청크가 ondataavailable 로 도착한 뒤 onstop 이 온다 — 반드시 기다린다.
    const blob = await new Promise<Blob | null>(resolve => {
      rec.onstop = () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        resolve(chunks.length > 0 ? new Blob(chunks, { type: mimeType }) : null);
      };
      try { rec.stop(); } catch { resolve(null); }
    });

    setState('ready');
    if (!blob || blob.size === 0) return null;

    const id = uuidv4();
    try {
      await saveClip({
        id,
        sessionId: sessionIdRef.current,
        sentenceId: input.sentenceId,
        scenarioLabel: input.scenarioLabel,
        text: input.text,
        mimeType,
        blob,
        createdAt: new Date().toISOString(),
        durationMs,
      });
      setSavedCount(n => n + 1);
      return id;
    } catch {
      // 저장 실패(용량 초과 등) — 흐름은 끊지 않는다.
      return null;
    }
  }, []);

  const discard = useCallback(() => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    chunksRef.current = [];
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch { /* 이미 정지 */ }
    }
    setState(s => (s === 'recording' ? 'ready' : s));
  }, []);

  // 녹음을 끄면 즉시 마이크를 반납한다 — 꺼져 있는데 표시등이 켜져 있으면 안 된다.
  useEffect(() => {
    if (!enabled) release();
  }, [enabled, release]);

  // 탭을 벗어나거나 언마운트되면 무조건 정리한다.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') release(); };
    window.addEventListener('pagehide', release);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', release);
      document.removeEventListener('visibilitychange', onHide);
      release();
    };
  }, [release]);

  return {
    state, savedCount, sessionId: sessionIdRef.current,
    arm, start, stopAndSave, discard, release,
  };
}
