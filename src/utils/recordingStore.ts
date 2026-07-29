// 상황 시뮬레이션 다시 듣기용 로컬 녹음 저장소 (IndexedDB).
//
// ⚠️ 이 파일은 프로젝트의 다른 마이크 경로와 목적이 정반대다. 반드시 구분할 것:
//
//   useMicPressure  — Stage 3(녹음 압박)용. 오디오를 **절대 저장하지 않는다.**
//                     녹음이 도는 느낌 자체가 압박 장치이고, Blob 은 즉시 버려진다.
//   이 파일          — Stage 4(상황 시뮬레이션)용. 사용자가 **명시적으로 켰을 때만**
//                     자기 목소리를 다시 듣기 위해 이 기기에 저장한다.
//
// 두 경로를 하나의 훅으로 합치지 않는다. 플래그 하나 잘못 건드리면
// "Stage 3 오디오는 안 남는다"는 보장이 조용히 깨지기 때문이다.
//
// ⚠️ 업로드 금지: 여기 담긴 Blob 은 어떤 경로로도 Firebase 로 나가지 않는다.
// 그 보장은 규율이 아니라 구조로 지킨다 — SoundMapResult 에는 Blob 이 들어갈 자리가
// 아예 없고 recordingId(문자열)만 저장된다. Firestore 로 가는 객체는 순수 JSON 이다.

const DB_NAME = 'stutter-recordings';
const DB_VERSION = 1;
const STORE = 'clips';
const INDEX_SOUND_MAP = 'by-soundMapId';

export interface RecordingClip {
  id: string;
  /** 어느 소리 지도에 속하는지. 지도 저장 전에 녹음되므로 나중에 채워진다. */
  soundMapId?: string;
  /** 어느 시뮬레이션 세션인지 — 지도를 저장하지 않고 나갔을 때 정리 기준이 된다. */
  sessionId: string;
  sentenceId: string;
  scenarioLabel: string;
  text: string;
  mimeType: string;
  blob: Blob;
  createdAt: string;
  durationMs: number;
}

/** 오디오 Blob 을 뺀 목록용 메타 — 목록을 그릴 때 Blob 을 전부 메모리에 올리지 않기 위해. */
export type RecordingMeta = Omit<RecordingClip, 'blob'>;

export function isRecordingStoreSupported(): boolean {
  return typeof indexedDB !== 'undefined';
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (!isRecordingStoreSupported()) {
    return Promise.reject(new Error('IndexedDB unsupported'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex(INDEX_SOUND_MAP, 'soundMapId', { unique: false });
        store.createIndex('by-sessionId', 'sessionId', { unique: false });
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

/**
 * 클립을 저장하고 id 를 돌려준다.
 * 저장에 실패해도 시뮬레이션은 계속되어야 하므로 호출부에서 잡아 무시할 수 있다.
 */
export async function saveClip(clip: RecordingClip): Promise<string> {
  await tx('readwrite', store => store.put(clip));
  return clip.id;
}

/** 목록용 메타만 (Blob 제외) — 지도 하나에 딸린 클립들 */
export async function listClipsBySoundMap(soundMapId: string): Promise<RecordingMeta[]> {
  try {
    const db = await openDB();
    return await new Promise<RecordingMeta[]>((resolve, reject) => {
      const store = db.transaction(STORE, 'readonly').objectStore(STORE);
      const req = store.index(INDEX_SOUND_MAP).getAll(soundMapId);
      req.onsuccess = () => resolve(
        (req.result as RecordingClip[])
          .map(stripBlob)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      );
      req.onerror = () => reject(req.error);
    });
  } catch {
    // 저장소를 못 열어도 결과 화면은 정상적으로 그려져야 한다.
    return [];
  }
}

function stripBlob(c: RecordingClip): RecordingMeta {
  const { blob: _blob, ...meta } = c;
  return meta;
}

/** 재생용 — 실제 Blob 을 하나만 꺼낸다. */
export async function getClipBlob(id: string): Promise<Blob | null> {
  try {
    const clip = await tx<RecordingClip | undefined>('readonly', store => store.get(id));
    return clip?.blob ?? null;
  } catch {
    return null;
  }
}

export async function deleteClip(id: string): Promise<void> {
  try {
    await tx('readwrite', store => store.delete(id));
  } catch {
    // 무시 — UI 는 낙관적으로 목록에서 제거한다.
  }
}

export async function deleteClipsBySoundMap(soundMapId: string): Promise<void> {
  const metas = await listClipsBySoundMap(soundMapId);
  await Promise.all(metas.map(m => deleteClip(m.id)));
}

/**
 * 지도를 저장하지 않고 나간 세션의 고아 클립 정리.
 * soundMapId 가 끝내 채워지지 않은 것들이 대상이다.
 */
export async function deleteClipsBySession(sessionId: string): Promise<void> {
  try {
    const db = await openDB();
    const metas = await new Promise<RecordingClip[]>((resolve, reject) => {
      const store = db.transaction(STORE, 'readonly').objectStore(STORE);
      const req = store.index('by-sessionId').getAll(sessionId);
      req.onsuccess = () => resolve(req.result as RecordingClip[]);
      req.onerror = () => reject(req.error);
    });
    await Promise.all(metas.map(m => deleteClip(m.id)));
  } catch {
    // 무시
  }
}

/**
 * 시뮬레이션 중에 저장된 클립들에 소리 지도 id 를 뒤늦게 붙인다.
 * 녹음은 지도가 저장되기 전에 만들어지므로 2단계로 나눌 수밖에 없다.
 */
export async function attachSoundMapId(sessionId: string, soundMapId: string): Promise<void> {
  try {
    const db = await openDB();
    const clips = await new Promise<RecordingClip[]>((resolve, reject) => {
      const store = db.transaction(STORE, 'readonly').objectStore(STORE);
      const req = store.index('by-sessionId').getAll(sessionId);
      req.onsuccess = () => resolve(req.result as RecordingClip[]);
      req.onerror = () => reject(req.error);
    });
    await Promise.all(
      clips.map(c => tx('readwrite', store => store.put({ ...c, soundMapId }))),
    );
  } catch {
    // 붙이지 못하면 결과 화면에서 안 보일 뿐, 데이터가 새어 나가지는 않는다.
  }
}

/** 저장된 전체 용량(대략) — 설정/안내에 쓸 수 있게 열어 둔다. */
export async function totalClipBytes(): Promise<number> {
  try {
    const db = await openDB();
    return await new Promise<number>((resolve, reject) => {
      const store = db.transaction(STORE, 'readonly').objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(
        (req.result as RecordingClip[]).reduce((n, c) => n + (c.blob?.size ?? 0), 0),
      );
      req.onerror = () => reject(req.error);
    });
  } catch {
    return 0;
  }
}
