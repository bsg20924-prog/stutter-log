// 음성인식(STT) — 살아있는 대화에서 사용자가 뭐라고 말했는지 받아 온다.
//
// ⚠️ 말더듬는 사람에게 STT 를 쓸 때의 유일한 설계 원칙:
// **인식 실패를 사용자의 실패로 보이게 만들면 안 된다.**
// 기계가 내 말을 못 알아듣는 경험은 이 앱이 줄이려는 바로 그 상처다.
// 그래서 이 훅은 "못 알아들었다"를 오류가 아니라 **빈 문자열**로 돌려주고,
// 호출부(LiveTalk)가 그것을 상대의 "네?" 라는 극중 대사로 바꾼다.
//
// 그리고 결정적인 것 하나 —
// 브라우저 STT 는 침묵이 몇 초 이어지면 스스로 종료한다(no-speech).
// 막힘은 **말을 시작하기 전 침묵**으로 나타나므로, 기본 동작대로 두면
// 정작 막힌 사람의 발화만 골라서 못 받는다. 그래서 응답 창이 열려 있는 동안
// no-speech 로 끝나면 **자동으로 다시 시작한다.**

import { useCallback, useEffect, useRef, useState } from 'react';

// 표준 타입에 아직 없어서 최소한만 직접 선언한다.
interface SRResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface SREvent extends Event {
  resultIndex: number;
  results: { length: number; [i: number]: SRResult };
}
interface SRErrorEvent extends Event {
  error: string;
}
interface SRInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type SRConstructor = new () => SRInstance;

function getConstructor(): SRConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getConstructor() !== null;
}

export interface SpeechRecognitionHandle {
  /** 듣는 중인지 */
  listening: boolean;
  /** 지금까지 인식된 말 (중간 결과 포함) — 화면에 흐리게 보여주는 용도 */
  partial: string;
  /** 사용자가 마이크를 거부했는지. 이때는 조용히 인식 없이 진행한다. */
  denied: boolean;
  /** 듣기 시작. 이전 결과는 지운다. */
  start: () => void;
  /**
   * 듣기를 멈추고 **최종 결과가 도착할 때까지 기다렸다가** 돌려준다.
   * 못 알아들었으면 빈 문자열.
   *
   * ⚠️ 반드시 기다려야 한다. stop() 직후에 값을 읽으면 안 된다.
   * iOS 사파리는 중간 결과를 주지 않고 최종 결과만 stop() 뒤에 비동기로 보낸다.
   * 동기로 읽으면 아이폰에서는 **항상 빈 문자열**이 나온다(실제로 그랬다).
   * 데스크톱 크롬은 중간 결과가 계속 쌓여서 우연히 값이 차 있었을 뿐이다.
   */
  stop: () => Promise<string>;
}

/** 최종 결과를 기다리는 상한. 이 안에 안 오면 못 알아들은 것으로 친다. */
const FINAL_RESULT_WAIT_MS = 1500;

export function useSpeechRecognition(enabled: boolean): SpeechRecognitionHandle {
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const [denied, setDenied] = useState(false);

  const recRef = useRef<SRInstance | null>(null);
  // 확정된 조각들을 모은다. state 로 두면 stop() 이 옛 값을 읽는다.
  const finalRef = useRef('');
  // 응답 창이 열려 있는 동안만 자동 재시작한다.
  const wantListeningRef = useRef(false);
  // stop() 이 최종 결과를 기다리는 중일 때, onend 가 여기로 결과를 넘긴다.
  const settleRef = useRef<((said: string) => void) | null>(null);

  const build = useCallback((): SRInstance | null => {
    const Ctor = getConstructor();
    if (!Ctor) return null;
    let rec: SRInstance;
    try {
      rec = new Ctor();
    } catch {
      return null;
    }
    rec.lang = 'ko-KR';
    // continuous 를 켜면 iOS 에서 불안정하다. 대신 onend 자동 재시작으로 이어 붙인다.
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e: SREvent) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0]?.transcript ?? '';
        if (r.isFinal) finalRef.current += text;
        else interim += text;
      }
      setPartial((finalRef.current + interim).trim());
    };

    rec.onerror = (e: SRErrorEvent) => {
      // not-allowed / service-not-allowed = 마이크 거부. 재시작해도 소용없다.
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wantListeningRef.current = false;
        setDenied(true);
        setListening(false);
      }
      // no-speech / aborted / network 는 onend 에서 재시작 판단한다.
    };

    rec.onend = () => {
      // ★ 침묵으로 끊긴 것을 되살린다.
      // 막히는 동안의 침묵 때문에 인식이 죽으면, 정작 받아야 할 발화를 놓친다.
      // (여기서는 훅의 start() 가 아니라 rec.start() 를 부른다 — finalRef 를 지우면 안 된다.)
      if (wantListeningRef.current) {
        try {
          rec.start();
          return;
        } catch {
          // 이미 시작된 상태거나 재시작 불가 — 그냥 종료로 둔다.
        }
      }
      setListening(false);
      // stop() 이 기다리고 있으면 지금이 결과가 다 모인 시점이다.
      settleRef.current?.(finalRef.current.trim());
    };
    return rec;
  }, []);

  const start = useCallback(() => {
    if (!enabled || denied) return;
    finalRef.current = '';
    setPartial('');
    if (!recRef.current) recRef.current = build();
    const rec = recRef.current;
    if (!rec) return;
    wantListeningRef.current = true;
    try {
      rec.start();
      setListening(true);
    } catch {
      // 이미 돌고 있으면 그대로 둔다.
      setListening(true);
    }
  }, [enabled, denied, build]);

  const stop = useCallback((): Promise<string> => {
    wantListeningRef.current = false;
    const rec = recRef.current;
    if (!rec) return Promise.resolve('');

    return new Promise<string>(resolve => {
      let settled = false;
      const finish = (said: string) => {
        if (settled) return;
        settled = true;
        settleRef.current = null;
        finalRef.current = '';
        setPartial('');
        resolve(said);
      };
      settleRef.current = finish;

      try {
        rec.stop();
      } catch {
        finish('');
        return;
      }
      // onend 가 오지 않는 경우가 있다 — 그때도 진행은 멈추면 안 된다.
      window.setTimeout(() => finish(finalRef.current.trim()), FINAL_RESULT_WAIT_MS);
    });
  }, []);

  // 화면을 벗어나면 마이크를 반드시 놓는다.
  useEffect(() => () => {
    wantListeningRef.current = false;
    try {
      recRef.current?.abort();
    } catch {
      // 무시
    }
  }, []);

  return { listening, partial, denied, start, stop };
}
