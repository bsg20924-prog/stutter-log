// 상황 시뮬레이션 단독 실행 결과 저장/구독.
// useSoundMaps 와 같은 구조 — dev 는 localStorage, 프로덕션은 Firestore.
//
// ⚠️ 여기 저장되는 객체에도 오디오는 없다. 녹음은 IndexedDB 에만 있고
// 이 객체는 순수 JSON 이라 그대로 Firestore 로 나간다.

import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy, limit,
} from 'firebase/firestore';
import { db } from '../firebase';
import { StandaloneSimulation } from '../utils/simulationStandalone';

const COLLECTION = 'simulations';
const HISTORY_LIMIT = 20;

const USE_LOCAL = import.meta.env.DEV;
const LOCAL_KEY = 'stutter_simulations';
const LOCAL_EVENT = 'stutter-simulation-saved';

function readLocal(): StandaloneSimulation[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as StandaloneSimulation[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(list: StandaloneSimulation[]): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

export async function saveSimulationRun(
  run: Omit<StandaloneSimulation, 'id' | 'createdAt'>,
): Promise<StandaloneSimulation> {
  const full: StandaloneSimulation = {
    ...run,
    id: uuidv4(),
    createdAt: new Date().toISOString(),
  };

  if (USE_LOCAL) {
    writeLocal([full, ...readLocal()]);
    return full;
  }

  await setDoc(doc(db, COLLECTION, full.id), full);
  return full;
}

export async function deleteSimulationRun(id: string): Promise<void> {
  if (USE_LOCAL) {
    writeLocal(readLocal().filter(r => r.id !== id));
    return;
  }
  await deleteDoc(doc(db, COLLECTION, id));
}

/** 최근 실행 이력 — 같은 상황을 반복하는 것이 곧 노출 훈련이라 이력이 중요하다. */
export function useSimulationRuns(): { runs: StandaloneSimulation[]; loading: boolean } {
  const [runs, setRuns] = useState<StandaloneSimulation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (USE_LOCAL) {
      const refresh = () => {
        setRuns(readLocal());
        setLoading(false);
      };
      refresh();
      window.addEventListener(LOCAL_EVENT, refresh);
      window.addEventListener('storage', refresh);
      return () => {
        window.removeEventListener(LOCAL_EVENT, refresh);
        window.removeEventListener('storage', refresh);
      };
    }

    const q = query(
      collection(db, COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(HISTORY_LIMIT),
    );
    const unsub = onSnapshot(
      q,
      snap => {
        setRuns(snap.docs.map(d => d.data() as StandaloneSimulation));
        setLoading(false);
      },
      () => setLoading(false),   // 오류가 나도 로딩은 풀어 준다 — 시작 버튼은 정상 노출
    );
    return () => unsub();
  }, []);

  return { runs, loading };
}
