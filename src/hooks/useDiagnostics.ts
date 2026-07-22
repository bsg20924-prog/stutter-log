import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  collection, doc, setDoc, onSnapshot, query, orderBy, limit,
} from 'firebase/firestore';
import { db } from '../firebase';
import { DiagnosticResult } from '../utils/diagnostic';

const COLLECTION = 'diagnostics';

// 개발 서버(npm run dev)에서는 로그인을 건너뛰어 Firestore 규칙에 막히므로,
// 진단 결과를 localStorage 에 저장한다. 프로덕션 빌드에서는 Firestore 사용.
const USE_LOCAL = import.meta.env.DEV;
const LOCAL_KEY = 'stutter_diagnostics';
const LOCAL_EVENT = 'stutter-diagnostic-saved';

function readLocal(): DiagnosticResult[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as DiagnosticResult[]) : [];
  } catch {
    return [];
  }
}

// 완료된 진단 결과를 저장하고, id/createdAt 이 채워진 전체 결과를 반환.
export async function saveDiagnosticResult(
  result: Omit<DiagnosticResult, 'id' | 'createdAt'>,
): Promise<DiagnosticResult> {
  const full: DiagnosticResult = {
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

// 가장 최근 진단(기준선)을 구독.
export function useLatestDiagnostic(): { latest: DiagnosticResult | null; loading: boolean } {
  const [latest, setLatest] = useState<DiagnosticResult | null>(null);
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
        setLatest(docSnap ? (docSnap.data() as DiagnosticResult) : null);
        setLoading(false);
      },
      () => setLoading(false), // 오류 시에도 로딩 해제 — 진단 시작 화면은 정상 노출
    );
    return () => unsub();
  }, []);

  return { latest, loading };
}
