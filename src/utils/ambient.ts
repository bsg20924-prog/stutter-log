// 상황 시뮬레이션 배경음.
//
// 음원은 /public/ambient/ 에 넣으면 자동으로 붙는다 (cafe.mp3, office.mp3, phone.mp3).
// 지금 저장소에는 파일이 없다 — 그래서 이 모듈은 **"파일이 없는 상태가 기본"**이라고
// 가정하고 설계했다. 없으면 조용히 비활성화하고, 화면에서는 토글 자체를 감춘다.
// 눌러도 아무 일이 없는 스위치는 사용자에게 '고장'으로 읽히기 때문이다.
// 콘솔 에러도 남기지 않는다 (404 는 예상된 상태이지 오류가 아니다).

import { AmbientKey } from '../data/simulation';

const BASE = `${import.meta.env.BASE_URL ?? '/'}ambient/`.replace(/\/{2,}/g, '/');

export const AMBIENT_SRC: Record<AmbientKey, string> = {
  cafe:   `${BASE}cafe.mp3`,
  office: `${BASE}office.mp3`,
  phone:  `${BASE}phone.mp3`,
};

// 배경음은 어디까지나 배경이다. 프롬프트(TTS)를 덮으면 상황 연습이 아니라 방해가 된다.
export const AMBIENT_VOLUME = 0.15;
const DUCKED_VOLUME = 0.05;   // 상대가 말하는 동안
const FADE_MS = 400;

// 키별 사용 가능 여부 캐시 — 매번 404 를 다시 때리지 않는다.
const availability = new Map<AmbientKey, Promise<boolean>>();

/**
 * 해당 배경음 파일이 실제로 존재하고 재생 가능한지 확인한다.
 * HEAD 요청 대신 Audio 로 확인한다 — 파일이 있어도 코덱을 못 읽으면 소용없기 때문.
 */
export function checkAmbientAvailable(key: AmbientKey): Promise<boolean> {
  const cached = availability.get(key);
  if (cached) return cached;

  const probe = new Promise<boolean>(resolve => {
    if (typeof Audio === 'undefined') { resolve(false); return; }
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      audio.removeAttribute('src');
      resolve(ok);
    };
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.oncanplaythrough = () => done(true);
    audio.onloadedmetadata = () => done(true);
    audio.onerror = () => done(false);        // 404 도 여기로 온다 — 정상 경로다
    audio.src = AMBIENT_SRC[key];
    // 응답이 영영 안 와도 UI 가 기다리지 않게 한다.
    window.setTimeout(() => done(false), 2500);
  });

  availability.set(key, probe);
  return probe;
}

export interface AmbientPlayer {
  play: (key: AmbientKey) => void;
  /** 상대가 말하는 동안 볼륨을 낮춘다 */
  duck: () => void;
  unduck: () => void;
  stop: () => void;
}

/**
 * 배경음 재생기. 파일이 없으면 모든 호출이 조용한 no-op 이 된다.
 * ⚠️ play 는 사용자 제스처 안에서 처음 호출해야 iOS 에서 소리가 난다.
 */
export function createAmbientPlayer(): AmbientPlayer {
  let audio: HTMLAudioElement | null = null;
  let current: AmbientKey | null = null;
  let fadeTimer: number | null = null;

  const clearFade = () => {
    if (fadeTimer !== null) { window.clearInterval(fadeTimer); fadeTimer = null; }
  };

  const fadeTo = (target: number) => {
    if (!audio) return;
    clearFade();
    const from = audio.volume;
    const steps = 8;
    let i = 0;
    fadeTimer = window.setInterval(() => {
      i += 1;
      if (!audio) { clearFade(); return; }
      audio.volume = Math.max(0, Math.min(1, from + (target - from) * (i / steps)));
      if (i >= steps) clearFade();
    }, FADE_MS / steps);
  };

  return {
    play(key) {
      if (current === key && audio && !audio.paused) return;
      if (!audio) {
        audio = new Audio();
        audio.loop = true;
        // 파일이 없거나 재생이 막히면 조용히 포기한다.
        audio.onerror = () => { audio = null; current = null; };
      }
      if (current !== key) {
        audio.src = AMBIENT_SRC[key];
        current = key;
      }
      audio.volume = AMBIENT_VOLUME;
      void audio.play().catch(() => { /* 자동재생 차단 등 — 무시 */ });
    },
    duck() { fadeTo(DUCKED_VOLUME); },
    unduck() { fadeTo(AMBIENT_VOLUME); },
    stop() {
      clearFade();
      if (!audio) return;
      try { audio.pause(); } catch { /* 무시 */ }
      audio.removeAttribute('src');
      audio = null;
      current = null;
    },
  };
}
