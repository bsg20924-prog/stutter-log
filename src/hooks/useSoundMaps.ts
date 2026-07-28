// 소리 지도 결과 저장/구독. useDiagnostics 와 같은 구조를 따른다.

import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  collection, doc, setDoc, onSnapshot, query, orderBy, limit,
} from 'firebase/firestore';
import { db } from '../firebase';
import { SoundMapResult } from '../utils/soundMapResult';

const COLLECTION = 'soundMaps';

// 개발 서버(npm run dev)에서는 로그인을 건너뛰어 Firestore 규칙에 막히므로
// localStorage 에 저장한다. 프로덕션 빌드에서는 Firestore 사용.
const USE_LOCAL = import.meta.env.DEV;
const LOCAL_KEY = 'stutter_sound_maps';
const LOCAL_EVENT = 'stutter-sound-map-saved';

function readLocal(): SoundMapResult[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as SoundMapResult[]) : [];
  } catch {
    return [];
  }
}

// 완료된 소리 지도를 저장하고, id/createdAt 이 채워진 전체 결과를 반환.
export async function saveSoundMapResult(
  result: Omit<SoundMapResult, 'id' | 'createdAt'>,
): Promise<SoundMapResult> {
  const full: SoundMapResult = {
    ...result,
    id: uuidv4(),
    createdAt: new Date().toISOString(),
  };

  if (USE_LOCAL) {
    const list = [full, ...readLocal()];
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(LOCAL_EVENT));
    return full;
  }

  await setDoc(doc(db, COLLECTION, full.id), full);
  return full;
}

// 가장 최근 소리 지도를 구독.
export function useLatestSoundMap(): { latest: SoundMapResult | null; loading: boolean } {
  const [latest, setLatest] = useState<SoundMapResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (USE_LOCAL) {
      const refresh = () => {
        setLatest(readLocal()[0] ?? null);
        setLoading(false);
      };
      refresh();
      // 같은 탭 저장(LOCAL_EVENT) + 다른 탭 저장(storage) 모두 반영
      window.addEventListener(LOCAL_EVENT, refresh);
      window.addEventListener('storage', refresh);
      return () => {
        window.removeEventListener(LOCAL_EVENT, refresh);
        window.removeEventListener('storage', refresh);
      };
    }

    const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'), limit(1));
    const unsub = onSnapshot(
      q,
      snapshot => {
        const docSnap = snapshot.docs[0];
        setLatest(docSnap ? (docSnap.data() as SoundMapResult) : null);
        setLoading(false);
      },
      () => setLoading(false), // 오류가 나도 로딩은 풀어 준다 — 시작 카드는 정상 노출
    );
    return () => unsub();
  }, []);

  return { latest, loading };
}
