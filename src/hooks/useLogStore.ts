import React, {
  useState, useCallback, useMemo,
  createContext, useContext,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { LogEntry } from '../types';

const STORAGE_KEY = 'stutter_log';

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

function migrateSituation(raw: unknown): LogEntry['situations'][number] {
  const s = String(raw);
  return (SITUATION_MAP[s] ?? s) as LogEntry['situations'][number];
}

function migrateOutcome(raw: unknown): LogEntry['outcome'] {
  const s = String(raw ?? '');
  return (OUTCOME_MAP[s] ?? s) as LogEntry['outcome'];
}

function migrate(entry: Record<string, unknown>): LogEntry {
  const rawSituations: unknown[] = Array.isArray(entry.situations)
    ? entry.situations
    : entry.situation ? [entry.situation] : [];

  return {
    id:             String(entry.id ?? ''),
    createdAt:      String(entry.createdAt ?? ''),
    word:           String(entry.word ?? ''),
    blockedSyllable: String(entry.blockedSyllable ?? ''),
    phoneme:        String(entry.phoneme ?? ''),
    situations:     rawSituations.map(migrateSituation),
    outcome:        migrateOutcome(entry.outcome),
    isDetailed:     Boolean(entry.isDetailed ?? false),
    anxietyScore:   typeof entry.anxietyScore === 'number' ? entry.anxietyScore : undefined,
    physicalState:  entry.physicalState ? String(entry.physicalState) : undefined,
    emotionalState: entry.emotionalState ? String(entry.emotionalState) : undefined,
    note:           entry.note ? String(entry.note) : undefined,
  };
}

function load(): LogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, unknown>[];
    return parsed.map(migrate);
  } catch {
    return [];
  }
}

function persist(entries: LogEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

interface LogStore {
  entries: LogEntry[];
  addEntry: (entry: Omit<LogEntry, 'id' | 'createdAt'>) => LogEntry;
  updateEntry: (id: string, updates: Omit<LogEntry, 'id' | 'createdAt'>) => void;
  deleteEntry: (id: string) => void;
  getAllEntries: () => LogEntry[];
  getEntriesByDate: (date: string) => LogEntry[];
}

const LogStoreContext = createContext<LogStore | null>(null);

export function LogStoreProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<LogEntry[]>(load);

  const addEntry = useCallback((entry: Omit<LogEntry, 'id' | 'createdAt'>): LogEntry => {
    const newEntry: LogEntry = {
      ...entry,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
    };
    setEntries(prev => {
      const next = [newEntry, ...prev];
      persist(next);
      return next;
    });
    return newEntry;
  }, []);

  const updateEntry = useCallback((id: string, updates: Omit<LogEntry, 'id' | 'createdAt'>) => {
    setEntries(prev => {
      const next = prev.map(e =>
        e.id === id ? { ...updates, id: e.id, createdAt: e.createdAt } : e
      );
      persist(next);
      return next;
    });
  }, []);

  const deleteEntry = useCallback((id: string) => {
    setEntries(prev => {
      const next = prev.filter(e => e.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const getAllEntries = useCallback(() => entries, [entries]);

  const getEntriesByDate = useCallback(
    (date: string) => entries.filter(e => e.createdAt.startsWith(date)),
    [entries]
  );

  const value = useMemo(
    () => ({ entries, addEntry, updateEntry, deleteEntry, getAllEntries, getEntriesByDate }),
    [entries, addEntry, updateEntry, deleteEntry, getAllEntries, getEntriesByDate]
  );

  // React.createElement를 사용해 .ts 파일에서 JSX 없이 Provider 렌더링
  return React.createElement(LogStoreContext.Provider, { value }, children);
}

export function useLogStore(): LogStore {
  const ctx = useContext(LogStoreContext);
  if (!ctx) throw new Error('useLogStore must be called inside <LogStoreProvider>');
  return ctx;
}
