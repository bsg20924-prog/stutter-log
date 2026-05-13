import { Download } from 'lucide-react';
import { useLogStore } from '../hooks/useLogStore';
import { LogEntry } from '../types';

const STATUS_LABEL: Record<string, string> = {
  avoided:  '회피함',
  blocked:  '막혔음',
  overcome: '편안하게 말함',
};

function toCSV(entries: LogEntry[]): string {
  const escape = (v: string | number | undefined) =>
    `"${String(v ?? '').replace(/"/g, '""')}"`;

  const header = [
    '날짜', '시간', '단어', '막힌음절', '초성',
    '상황', '결과', '신체상태', '감정상태', '메모', '상태',
    '예상 긴장도', '실제 어려움', '사용 전략',
  ].map(escape).join(',');

  const rows = entries.map(e =>
    [
      e.createdAt.slice(0, 10),
      e.createdAt.slice(11, 16),
      e.word,
      (e.blockedSyllables ?? []).join('/'),
      (e.phonemes ?? []).join('/'),
      e.situations.map(s => s.replace(/_/g, ' ')).join(' / '),
      (e.outcome || '빠른기록').replace(/_/g, ' '),
      e.physicalState ?? '',
      e.emotionalState ?? '',
      e.note ?? '',
      STATUS_LABEL[e.status ?? 'blocked'] ?? '막혔음',
      e.expectedFear ?? '',
      e.actualDifficulty ?? '',
      (e.tactics ?? []).map(t => t.replace(/_/g, ' ')).join('/'),
    ].map(escape).join(',')
  );

  return '﻿' + [header, ...rows].join('\n');
}

export default function ExportButton() {
  const { entries } = useLogStore();

  if (entries.length === 0) return null;

  function handleExport() {
    const blob = new Blob([toCSV(entries)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `말막힘-일지-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={handleExport}
      title={`${entries.length}개 기록 내보내기`}
      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:text-teal-600 hover:bg-teal-50 transition-colors"
    >
      <Download size={15} />
      <span className="hidden sm:inline">내보내기</span>
    </button>
  );
}
