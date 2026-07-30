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
import { ensureTts, hasStoredTts, isBackingOff } from './geminiTts';
import { getGeminiKey } from './gemini';

export interface PrepareProgress {
  done: number;
  total: number;
  failed: number;
  /** 지금 받고 있는 개수 */
  active: number;
  /** 지금 무슨 일이 일어나는 중인지 — 화면에 그대로 보여준다 */
  note: string;
}

/** 한 건 끝나고 다음까지의 간격 */
const GAP_MS = 300;

/**
 * 과부하(500)가 흔해서 실측상 절반 가까이 실패한다. 넉넉하게 다시 시도한다.
 * 간격을 점점 늘린다 — 바쁜 서버를 같은 박자로 두드려 봐야 같이 실패한다.
 */
const RETRY_GAPS_MS = [2000, 5000, 10000, 20000];

/**
 * 동시에 받는 개수.
 *
 * 2 → 4 로 올렸다가 **되돌렸다.** 4로 두면 429 를 맞고 60초 쉰 뒤
 * 네 개가 한꺼번에 깨어나 또 429 를 맞는다. 그게 반복되면 영원히 멈춘 것처럼 보인다
 * (실제로 58/70 에서 멈췄다). 3 + 시작 시차로 그 동시 재개를 흩는다.
 */
const CONCURRENCY = 3;

/** 워커가 한꺼번에 깨어나지 않도록 시작을 어긋나게 한다. */
const STAGGER_MS = 900;

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

        if (attempt > 0) {
          progress.note = `다시 시도하는 중 (${attempt}/${RETRY_GAPS_MS.length})`;
          emit();
          await sleep(RETRY_GAPS_MS[attempt - 1], signal);
        }

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
      progress.note = signal?.aborted ? '멈추는 중...' : `${missing.length - cursor}개 남았어요.`;
      emit();

      await sleep(GAP_MS, signal);
    }
  };

  await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, slot) => worker(slot)),
  );

  progress.active = 0;
  progress.note = signal?.aborted ? '' : '';
  emit();
  return progress;
}
