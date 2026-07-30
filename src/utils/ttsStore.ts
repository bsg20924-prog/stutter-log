// TTS 음성 영구 보관 — 한 번 산 음성은 다시 사지 않는다.
//
// 왜 필요한가 (두 가지 다 실측으로 확인된 문제다):
//
// 1. **돈.** 비용의 90% 가 TTS 오디오 출력이다($20/1M, 초당 25토큰).
//    소리 지도의 상대 멘트와 살아있는 대화의 첫마디·사다리 대사는 전부 고정
//    문자열인데, 메모리 캐시만 있으면 앱을 켤 때마다 같은 음성을 다시 산다.
//
// 2. **안정성.** preview 모델이 과부하로 500 을 뱉거나 15초를 넘긴다
//    ("currently experiencing high demand" — 실측). 캐시된 음성은 아예 요청을
//    하지 않으므로 그 불안정이 통째로 사라진다. 돈보다 이쪽이 더 크다.
//
// 자유 생성 대사는 매번 달라서 캐시가 안 걸린다 — 그건 어쩔 수 없다.
// 대신 고정 대사가 걸리는 것만으로도 첫 마디가 즉시 나온다.
//
// ⚠️ 실패는 전부 조용히 넘긴다. 캐시는 있으면 좋은 것이지 없으면 안 되는 것이 아니다.

const DB_NAME = 'stutter-tts';
const DB_VERSION = 1;
const STORE = 'audio';

/**
 * 보관 상한. 넘으면 오래 안 쓴 것부터 지운다.
 * 대사 하나가 3~5초 WAV 라 대략 150~250KB 다 — 300개면 50MB 안팎.
 */
const MAX_ENTRIES = 300;

interface TtsRecord {
  /** geminiTts 의 cacheKey — `voice|style|text` */
  key: string;
  blob: Blob;
  /** 마지막으로 쓴 시각 (ISO) — 정리할 때 오래된 것부터 버린다 */
  usedAt: string;
}

export function isTtsStoreSupported(): boolean {
  return typeof indexedDB !== 'undefined';
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (!isTtsStoreSupported()) return Promise.reject(new Error('IndexedDB unsupported'));
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex('by-usedAt', 'usedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    // 다른 탭이 예전 버전을 붙들고 있으면 영영 열리지 않는다 — 조용히 실패시킨다.
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });

  // 실패한 promise 를 캐시하면 이후 시도가 전부 막힌다.
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  }));
}

/** 보관된 음성. 없으면 null. 꺼낼 때 사용 시각을 갱신한다. */
export async function loadTtsBlob(key: string): Promise<Blob | null> {
  try {
    const rec = await tx<TtsRecord | undefined>('readonly', s => s.get(key));
    if (!rec?.blob) return null;
    // 갱신은 실패해도 무방하다 — 정리 순서만 조금 어긋난다.
    void tx('readwrite', s => s.put({ ...rec, usedAt: new Date().toISOString() }))
      .catch(() => {});
    return rec.blob;
  } catch {
    return null;
  }
}

/** 음성을 보관한다. 실패해도 조용히 넘어간다 — 메모리 캐시로는 계속 동작한다. */
export async function saveTtsBlob(key: string, blob: Blob): Promise<void> {
  try {
    await tx('readwrite', s => s.put({ key, blob, usedAt: new Date().toISOString() }));
    void pruneIfNeeded();
  } catch {
    // 용량 초과·프라이빗 모드 등 — 무시한다.
  }
}

/** 상한을 넘으면 오래 안 쓴 것부터 지운다. */
async function pruneIfNeeded(): Promise<void> {
  try {
    const count = await tx<number>('readonly', s => s.count());
    if (count <= MAX_ENTRIES) return;

    const all = await tx<TtsRecord[]>('readonly', s => s.getAll());
    const doomed = all
      .sort((a, b) => a.usedAt.localeCompare(b.usedAt))
      .slice(0, count - MAX_ENTRIES);
    for (const rec of doomed) {
      await tx('readwrite', s => s.delete(rec.key)).catch(() => {});
    }
  } catch {
    // 정리에 실패해도 기능에는 지장이 없다.
  }
}

/** 보관된 음성 개수와 총 용량 — 설정 화면에서 보여줄 용도. */
export async function ttsStoreStats(): Promise<{ count: number; bytes: number }> {
  try {
    const all = await tx<TtsRecord[]>('readonly', s => s.getAll());
    return {
      count: all.length,
      bytes: all.reduce((n, r) => n + (r.blob?.size ?? 0), 0),
    };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

/** 전부 비운다. 목소리 설정을 바꿨을 때처럼 통째로 무효해지는 경우에 쓴다. */
export async function clearTtsStore(): Promise<void> {
  try {
    await tx('readwrite', s => s.clear());
  } catch {
    // 무시
  }
}
