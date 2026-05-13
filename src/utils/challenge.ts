import { LogEntry } from '../types';

export interface ChallengeWord {
  word: string;
  latestEntry: LogEntry;
  totalCount: number;
  lastBlockedAt: string;
}

export function getActiveChallengeWords(entries: LogEntry[]): ChallengeWord[] {
  const map = new Map<string, LogEntry[]>();

  for (const entry of entries) {
    const key = entry.word.trim().toLowerCase();
    const list = map.get(key) ?? [];
    list.push(entry);
    map.set(key, list);
  }

  const result: ChallengeWord[] = [];

  for (const [, wordEntries] of map) {
    const sorted = [...wordEntries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const latest = sorted[0];

    if (latest.status === 'overcome') continue;

    const blockedEntries = sorted.filter(e => e.status !== 'overcome');

    result.push({
      word: latest.word,
      latestEntry: latest,
      totalCount: blockedEntries.length,
      lastBlockedAt: latest.createdAt,
    });
  }

  return result.sort((a, b) => b.lastBlockedAt.localeCompare(a.lastBlockedAt));
}
