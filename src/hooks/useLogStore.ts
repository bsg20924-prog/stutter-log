import React, {
  useState, useCallback, useMemo, useEffect,
  createContext, useContext,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  collection, onSnapshot, doc,
  setDoc, deleteDoc, query, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import { LogEntry, LogStatus, OutcomeTag } from '../types';

const SITUATION_MAP: Record<string, LogEntry['situations'][number]> = {
  카페_주문:  '주문/결제',
  식당_주문:  '주문/결제',
  전화통화:   '전화',
  친구대화:   '지인/가족',
  낯선사람:   '낯선사람',
  발표_수업:  '발표/자기소개',
  군_상황:    '군_상황',
  기타:       '기타',
};

const OUTCOME_MAP: Record<string, LogEntry['outcome']> = {
  회피함:          '아예_회피함',
  막혔지만_말함:   '막혔지만_끝까지_말함',
  자연스럽게_말함: '그대로_자연스럽게',
};

const VALID_STATUSES = new Set<LogStatus>(['avoided', 'blocked', 'overcome']);

function inferStatusFromOutcome(outcome?: OutcomeTag | ''): LogStatus {
  if (
    outcome === '아예_회피함' ||
    outcome === '중간에_포기함' ||
    outcome === '상대가_대신_말함'
  ) return 'avoided';
  if (outcome === '그대로_자연스럽게') return 'overcome';
  return 'blocked';
}

function migrateSituation(raw: unknown): LogEntry['situations'][number] {
  const s = String(raw);
  return (SITUATION_MAP[s] ?? s) as LogEntry['situations'][number];
}

function migrateOutcome(raw: unknown): LogEntry['outcome'] {
  const s = String(raw ?? '');
  return (OUTCOME_MAP[s] ?? s) as LogEntry['outcome'];
}

function migrate(data: Record<string, unknown>): LogEntry {
  const rawSituations: unknown[] = Array.isArray(data.situations)
    ? data.situations
    : data.situation ? [data.situation] : [];

  // 구형: blockedSyllable/phoneme (string) → 신형: blockedSyllables/phonemes (string[])
  let blockedSyllables: string[];
  let phonemes: string[];
  if (Array.isArray(data.blockedSyllables)) {
    blockedSyllables = (data.blockedSyllables as unknown[]).map(s => String(s)).filter(Boolean);
  } else {
    const old = String(data.blockedSyllable ?? '');
    blockedSyllables = old ? [old] : [];
  }
  if (Array.isArray(data.phonemes)) {
    phonemes = (data.phonemes as unknown[]).map(s => String(s)).filter(Boolean);
  } else {
    const old = String(data.phoneme ?? '');
    phonemes = old ? [old] : [];
  }

  const outcome = migrateOutcome(data.outcome);
  const rawStatus = String(data.status ?? '');
  const status: LogStatus = VALID_STATUSES.has(rawStatus as LogStatus)
    ? (rawStatus as LogStatus)
    : inferStatusFromOutcome(outcome);

  return {
    id:              String(data.id ?? ''),
    createdAt:       String(data.createdAt ?? ''),
    word:            String(data.word ?? ''),
    blockedSyllables,
    phonemes,
    situations:      rawSituations.map(migrateSituation),
    outcome,
    status,
    isDetailed:      Boolean(data.isDetailed ?? false),
    physicalState:   data.physicalState ? String(data.physicalState) : undefined,
    emotionalState:  data.emotionalState ? String(data.emotionalState) : undefined,
    note:            data.note ? String(data.note) : undefined,
  };
}

interface LogStore {
  entries: LogEntry[];
  loading: boolean;
  addEntry: (entry: Omit<LogEntry, 'id' | 'createdAt'>) => Promise<LogEntry>;
  updateEntry: (id: string, updates: Omit<LogEntry, 'id' | 'createdAt'>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  getAllEntries: () => LogEntry[];
  getEntriesByDate: (date: string) => LogEntry[];
}

const LogStoreContext = createContext<LogStore | null>(null);

const COLLECTION = 'logs';
const LOCAL_KEY = 'stutter_log';
const MIGRATED_KEY = 'stutter_log_migrated';

async function migrateFromLocalStorage() {
  if (localStorage.getItem(MIGRATED_KEY)) return;
  const raw = localStorage.getItem(LOCAL_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>[];
    await Promise.all(
      parsed.map(item => {
        const entry = migrate(item);
        return setDoc(doc(db, COLLECTION, entry.id), entry);
      })
    );
    localStorage.setItem(MIGRATED_KEY, '1');
  } catch {
    // 마이그레이션 실패 시 무시 — 다음 실행에 재시도
  }
}

export function LogStoreProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub: (() => void) | null = null;

    migrateFromLocalStorage().then(() => {
      const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
      unsub = onSnapshot(
        q,
        (snapshot) => {
          const docs = snapshot.docs.map(d => migrate({ ...d.data(), id: d.id }));
          setEntries(docs);
          setLoading(false);
        },
        () => {
          // Firestore 오류 시 로딩 해제 — 빈 상태로 폼은 정상 노출
          setLoading(false);
        },
      );
    }).catch(() => {
      setLoading(false);
    });

    return () => { unsub?.(); };
  }, []);

  const addEntry = useCallback(async (entry: Omit<LogEntry, 'id' | 'createdAt'>): Promise<LogEntry> => {
    const newEntry: LogEntry = {
      ...entry,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, COLLECTION, newEntry.id), newEntry);
    return newEntry;
  }, []);

  const updateEntry = useCallback(async (id: string, updates: Omit<LogEntry, 'id' | 'createdAt'>) => {
    const existing = entries.find(e => e.id === id);
    if (!existing) return;
    await setDoc(doc(db, COLLECTION, id), { ...updates, id, createdAt: existing.createdAt });
  }, [entries]);

  const deleteEntry = useCallback(async (id: string) => {
    await deleteDoc(doc(db, COLLECTION, id));
  }, []);

  const getAllEntries = useCallback(() => entries, [entries]);

  const getEntriesByDate = useCallback(
    (date: string) => entries.filter(e => e.createdAt.startsWith(date)),
    [entries],
  );

  const value = useMemo(
    () => ({ entries, loading, addEntry, updateEntry, deleteEntry, getAllEntries, getEntriesByDate }),
    [entries, loading, addEntry, updateEntry, deleteEntry, getAllEntries, getEntriesByDate],
  );

  return React.createElement(LogStoreContext.Provider, { value }, children);
}

export function useLogStore(): LogStore {
  const ctx = useContext(LogStoreContext);
  if (!ctx) throw new Error('useLogStore must be called inside <LogStoreProvider>');
  return ctx;
}
