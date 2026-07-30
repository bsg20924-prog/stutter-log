// 고정 대사 음성 미리 받기.
//
// 살아있는 대화의 대사는 전부 정해진 풀에서 나온다(liveConversation.ts).
// 그 음성을 **대화 전에 한 번만** 받아 영구 보관하면:
//   · 재생이 즉시다 — 대화 중에는 네트워크를 타지 않는다
//   · preview 모델이 과부하로 500 을 뱉어도 대화는 멀쩡하다
//   · 음성값을 평생 한 번만 낸다
//
// 여기서는 오래 걸려도 된다. 사람이 대화를 기다리는 중이 아니기 때문에
// 한 건씩 순서대로, 실패하면 다시 시도하며 천천히 받는다.

import { allScenarioLines } from './liveConversation';
import { ensureTts, hasStoredTts, isBackingOff } from './geminiTts';
import { getGeminiKey } from './gemini';

export interface PrepareProgress {
  done: number;
  total: number;
  failed: number;
}

/**
 * 한 건씩 사이에 두는 간격.
 * 몰아서 던지면 429 를 맞고, 그러면 60초 백오프에 걸려 전체가 멈춘다.
 */
const GAP_MS = 400;

/**
 * 과부하(500)가 흔해서 실측상 절반 가까이 실패한다. 넉넉하게 다시 시도한다.
 * 여기는 사람이 대화를 기다리는 자리가 아니라, 오래 걸려도 끝나는 편이 낫다.
 * 간격을 점점 늘린다 — 바쁜 서버를 같은 박자로 두드려 봐야 같이 실패한다.
 */
const RETRY_GAPS_MS = [2000, 5000, 10000, 20000];

/**
 * 동시에 받는 개수.
 * 건당 5~15초라 한 줄로 받으면 70개에 20~30분이 걸린다.
 * 다만 폭을 넓히면 429 를 부르고, 그러면 60초 백오프로 전체가 멈춘다.
 */
const CONCURRENCY = 2;

/** 429 백오프가 풀릴 때까지 기다린다. 이때의 실패는 '실패'가 아니라 '아직'이다. */
async function waitOutBackoff(signal?: AbortSignal): Promise<void> {
  while (isBackingOff() && !signal?.aborted) {
    await sleep(3000);
  }
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
 * @param onProgress 한 건 끝날 때마다 호출된다
 * @param signal 중간에 그만두려면
 */
export async function prepareAllVoices(
  onProgress?: (p: PrepareProgress) => void,
  signal?: AbortSignal,
): Promise<PrepareProgress> {
  const key = getGeminiKey();
  const lines = allScenarioLines();
  const progress: PrepareProgress = { done: 0, total: lines.length, failed: 0 };

  if (!key) {
    // 키가 없으면 받을 수가 없다 — 전부 실패로 두지 않고 그대로 돌려준다.
    onProgress?.(progress);
    return progress;
  }

  // 한 건씩 받으면 70개에 20~30분이 걸린다(건당 5~15초 + 재시도).
  // 몇 개씩 겹쳐 받아 시간을 줄이되, 폭을 좁게 둔다 — 몰아치면 429 를 맞고
  // 60초 백오프에 걸려 오히려 전체가 멈춘다.
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (!signal?.aborted) {
      const i = cursor++;
      if (i >= lines.length) return;
      const { line, scenarioId } = lines[i];

      if (await hasStoredTts(line, scenarioId)) {
        progress.done += 1;
        onProgress?.({ ...progress });
        continue;
      }

      let ok = false;
      for (let attempt = 0; attempt <= RETRY_GAPS_MS.length && !ok; attempt++) {
        if (signal?.aborted) return;
        if (attempt > 0) await sleep(RETRY_GAPS_MS[attempt - 1]);
        // 429 중에 던지면 요청도 못 나가고 시도 횟수만 태운다.
        await waitOutBackoff(signal);
        if (signal?.aborted) return;
        ok = await ensureTts(line, key, scenarioId);
      }

      if (ok) progress.done += 1;
      else progress.failed += 1;
      onProgress?.({ ...progress });

      await sleep(GAP_MS);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return progress;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => window.setTimeout(r, ms));
}
