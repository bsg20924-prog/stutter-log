// 고정 대사 음성 미리 받기.
//
// 살아있는 대화의 대사는 전부 정해진 풀에서 나온다(liveConversation.ts).
// 그 음성을 **대화 전에 한 번만** 받아 영구 보관하면:
//   · 재생이 즉시다 — 대화 중에는 네트워크를 타지 않는다
//   · preview 모델이 과부하로 500 을 뱉어도 대화는 멀쩡하다
//   · 음성값을 평생 한 번만 낸다
//
// 여기서는 오래 걸려도 된다. 사람이 대화를 기다리는 중이 아니다.
// 대신 **지금 무엇을 하는 중인지 보여야 한다** — 아무 표시 없이 멈춰 있으면
// 고장으로 읽힌다(실제로 그렇게 보였다).

import { allScenarioLines } from './liveConversation';
import {
  ensureTts, hasStoredTts, isBackingOff, isQuotaExhausted, resetQuotaFlag,
} from './geminiTts';
import { getGeminiKey } from './gemini';

export interface PrepareProgress {
  done: number;
  total: number;
  failed: number;
  /** 지금 받고 있는 개수 */
  active: number;
  /** 지금 무슨 일이 일어나는 중인지 — 화면에 그대로 보여준다 */
  note: string;
  /** 할당량 소진. 기다려도 안 풀리므로 재시도를 권하면 안 된다. */
  quotaExhausted?: boolean;
}

/** 한 건 끝나고 다음까지의 간격 */
const GAP_MS = 300;

/**
 * ★ Gemini 3.1 Flash TTS 의 실제 한도 (2026-07-30, 유료 Tier 1 콘솔 확인):
 *
 *     RPM(분당 요청)  10
 *     RPD(일일 요청) 100
 *
 * **결제해도 풀리지 않는다** — preview 모델의 제약이다.
 * "유료면 한도가 사라진다"고 잘못 알고 동시 요청을 늘리고 재시도를 넉넉히
 * 잡았는데, 그 결과 70개를 받으려고 200회를 써서 하루치를 두 배로 태웠다.
 * 여기서는 한도를 **넘지 않는 것**이 유일하게 옳은 전략이다.
 */
const RPM_LIMIT = 10;

/** 분당 10회 아래로 유지한다. 6.5초 간격이면 약 9 RPM 이다. */
const MIN_INTERVAL_MS = Math.ceil(60_000 / (RPM_LIMIT - 1));

/**
 * 재시도는 딱 한 번.
 * 시도 한 번이 일일 100회에서 그대로 차감된다 — 재시도가 곧 받을 수 있는
 * 개수를 줄인다. 실패한 것은 내일 다시 받으면 되고, 그게 훨씬 싸다.
 */
const RETRY_GAPS_MS = [8000];

/**
 * 동시 요청은 두지 않는다.
 * 4 → 3 으로 줄여도 429 가 났다. 애초에 분당 10회 한도에서는 동시성이
 * 이득이 아니라 초과의 원인일 뿐이다.
 */
const CONCURRENCY = 1;
const STAGGER_MS = 0;

// 요청 간격을 지키기 위한 마지막 요청 시각.
let lastRequestAt = 0;

/** 분당 한도를 넘지 않도록 다음 요청까지 기다린다. */
async function pace(
  signal: AbortSignal | undefined,
  onWait: (seconds: number) => void,
): Promise<void> {
  const waitMs = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (waitMs > 0) {
    onWait(Math.ceil(waitMs / 1000));
    await sleep(waitMs, signal);
  }
  lastRequestAt = Date.now();
}

/**
 * 429 백오프를 기다리는 상한.
 * 무한히 기다리면 '그만 받기'조차 반응이 없는 것처럼 보인다 —
 * 여기서 포기하면 그 건만 실패로 남고, 다시 누르면 이어서 받는다.
 */
const MAX_BACKOFF_WAIT_MS = 90_000;

/** 중간에 그만둘 수 있는 sleep. 이게 없으면 '그만 받기'가 20초씩 먹통이 된다. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal?.aborted) return resolve();
    const timer = window.setTimeout(done, ms);
    function done() {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done);
  });
}

/** 이미 몇 개가 준비돼 있는지. 진행률 표시용. */
export async function countPrepared(): Promise<{ ready: number; total: number }> {
  const lines = allScenarioLines();
  let ready = 0;
  for (const { line, scenarioId } of lines) {
    if (await hasStoredTts(line, scenarioId)) ready += 1;
  }
  return { ready, total: lines.length };
}

/**
 * 아직 없는 대사의 음성을 전부 받아 보관한다.
 *
 * @param onProgress 상태가 바뀔 때마다 호출된다
 * @param signal 중간에 그만두려면
 */
export async function prepareAllVoices(
  onProgress?: (p: PrepareProgress) => void,
  signal?: AbortSignal,
): Promise<PrepareProgress> {
  const key = getGeminiKey();
  const lines = allScenarioLines();
  const progress: PrepareProgress = {
    done: 0, total: lines.length, failed: 0, active: 0, note: '확인하는 중...',
  };
  const emit = () => onProgress?.({ ...progress });

  // 지난번 소진 표시를 들고 시작하면 눌러도 아무 것도 안 한다.
  resetQuotaFlag();

  if (!key) {
    progress.note = '연결된 AI 키가 없어요.';
    emit();
    return progress;
  }

  // ★ 먼저 이미 있는 것을 전부 세고 시작한다.
  // 예전에는 카운터가 0부터 다시 올라가 "37 → 17" 처럼 숫자가 뒤로 갔다.
  // 받아둔 게 날아간 것으로 읽히는 표시라 반드시 고쳐야 했다.
  const missing: typeof lines = [];
  for (const item of lines) {
    if (await hasStoredTts(item.line, item.scenarioId)) progress.done += 1;
    else missing.push(item);
  }
  progress.note = missing.length > 0 ? `${missing.length}개 남았어요.` : '';
  emit();

  let cursor = 0;

  const worker = async (slot: number): Promise<void> => {
    // 시작을 어긋나게 해서 429 뒤에 다같이 깨어나는 것을 막는다.
    await sleep(slot * STAGGER_MS, signal);

    while (!signal?.aborted) {
      const i = cursor++;
      if (i >= missing.length) return;
      const { line, scenarioId } = missing[i];

      progress.active += 1;
      progress.note = `"${line}"`;
      emit();

      let ok = false;
      for (let attempt = 0; attempt <= RETRY_GAPS_MS.length && !ok; attempt++) {
        if (signal?.aborted) break;
        // 할당량이 마르면 재시도는 시간 낭비다 — 여기서 접는다.
        if (isQuotaExhausted()) break;

        if (attempt > 0) {
          progress.note = '다시 시도하는 중...';
          emit();
          await sleep(RETRY_GAPS_MS[attempt - 1], signal);
        }

        // ★ 분당 10회를 넘기지 않도록 간격을 지킨다.
        await pace(signal, sec => {
          progress.note = `한도(분당 ${RPM_LIMIT}회)에 맞춰 ${sec}초 기다리는 중...`;
          emit();
        });
        if (signal?.aborted) break;

        // 429 중에 던지면 요청도 못 나가고 시도 횟수만 태운다.
        const until = Date.now() + MAX_BACKOFF_WAIT_MS;
        while (isBackingOff() && !signal?.aborted && Date.now() < until) {
          progress.note = '서버가 바빠서 잠시 쉬는 중...';
          emit();
          await sleep(3000, signal);
        }
        if (signal?.aborted) break;

        ok = await ensureTts(line, key, scenarioId);
      }

      progress.active -= 1;
      if (ok) progress.done += 1;
      else if (!signal?.aborted) progress.failed += 1;

      if (isQuotaExhausted()) {
        progress.note = '오늘 쓸 수 있는 양을 다 썼어요.';
        progress.quotaExhausted = true;
        emit();
        return;
      }
      progress.note = signal?.aborted ? '멈추는 중...' : `${missing.length - cursor}개 남았어요.`;
      emit();

      await sleep(GAP_MS, signal);
    }
  };

  await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, slot) => worker(slot)),
  );

  // ★ 끝난 뒤에도 '왜 다 못 받았는지'가 남아야 한다.
  // 예전에는 여기서 빈 문자열로 지웠는데, 호출부가 진행 상태를 비우면서
  // 실패 안내까지 같이 사라졌다. 사용자에게는 "69/70 에서 이유 없이 멈춤"으로 보였다.
  progress.active = 0;
  if (signal?.aborted) {
    progress.note = '멈췄어요. 다시 누르면 남은 것부터 이어받아요.';
  } else if (progress.quotaExhausted) {
    progress.note = '오늘 쓸 수 있는 양을 다 썼어요.';
  } else if (progress.failed > 0) {
    progress.note = `${progress.failed}개를 못 받았어요. 다시 누르면 그것만 받아요.`;
  } else {
    progress.note = '';
  }
  emit();
  return progress;
}
