import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Trash2, ChevronDown, Pencil } from 'lucide-react';
import { useLogStore } from '../hooks/useLogStore';
import { LogEntry, SituationTag, OutcomeTag } from '../types';
import LogForm from './LogForm';

// ── 상황 뱃지 ──────────────────────────────────────────────
const SITUATION_LABEL: Record<SituationTag, string> = {
  전화:             '전화',
  '주문/결제':      '주문/결제',
  '발표/자기소개':  '발표/자기소개',
  낯선사람:         '낯선 사람',
  '지인/가족':      '지인/가족',
  군_상황:          '군 상황',
  '피곤함/수면부족': '피곤/수면부족',
  '급함/압박감':    '급함/압박',
  기타:             '기타',
};

const SITUATION_COLOR: Record<SituationTag, string> = {
  전화:             'bg-blue-100 text-blue-700',
  '주문/결제':      'bg-amber-100 text-amber-700',
  '발표/자기소개':  'bg-rose-100 text-rose-700',
  낯선사람:         'bg-slate-100 text-slate-600',
  '지인/가족':      'bg-violet-100 text-violet-700',
  군_상황:          'bg-green-100 text-green-700',
  '피곤함/수면부족': 'bg-indigo-100 text-indigo-700',
  '급함/압박감':    'bg-orange-100 text-orange-700',
  기타:             'bg-gray-100 text-gray-600',
};

// ── 결과 뱃지 ──────────────────────────────────────────────
const QUICK_BADGE = { label: '빠른 기록', className: 'bg-teal-50 text-teal-500 border border-teal-200' };

const OUTCOME_CONFIG: Record<OutcomeTag, { label: string; className: string }> = {
  그대로_자연스럽게:    { label: '자연스럽게',    className: 'bg-emerald-100 text-emerald-700' },
  막혔지만_끝까지_말함: { label: '끝까지 말함',   className: 'bg-yellow-100 text-yellow-700' },
  다른_단어로_바꿈:     { label: '단어 바꿈',     className: 'bg-orange-100 text-orange-700' },
  우회해서_말함:        { label: '우회함',        className: 'bg-orange-100 text-orange-700' },
  상대가_대신_말함:     { label: '상대가 대신',   className: 'bg-red-100 text-red-700' },
  중간에_포기함:        { label: '포기함',        className: 'bg-red-100 text-red-700' },
  아예_회피함:          { label: '회피함',        className: 'bg-red-200 text-red-800' },
};

// ── 유틸 ──────────────────────────────────────────────────
function groupByDate(entries: LogEntry[]): [string, LogEntry[]][] {
  const map = new Map<string, LogEntry[]>();
  for (const entry of entries) {
    const date = entry.createdAt.slice(0, 10);
    const list = map.get(date) ?? [];
    list.push(entry);
    map.set(date, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, list]) => [
      date,
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    ]);
}

function formatDateHeader(iso: string): string {
  return format(parseISO(iso), 'M월 d일 (EEEE)', { locale: ko });
}

// ── 하위 컴포넌트 ──────────────────────────────────────────

function HighlightedWord({ word, blockedSyllables }: { word: string; blockedSyllables: string[] }) {
  if (!blockedSyllables.length) return <span className="font-medium">{word}</span>;
  const parts: React.ReactNode[] = [];
  let remaining = word;
  let key = 0;
  for (const syl of blockedSyllables) {
    const idx = remaining.indexOf(syl);
    if (idx === -1) continue;
    if (idx > 0) parts.push(<span key={key++}>{remaining.slice(0, idx)}</span>);
    parts.push(<strong key={key++} className="text-red-500">{syl}</strong>);
    remaining = remaining.slice(idx + syl.length);
  }
  if (remaining) parts.push(<span key={key++}>{remaining}</span>);
  return <span className="font-medium">{parts}</span>;
}

function EntryCard({
  entry,
  onDelete,
  onEditStart,
}: {
  entry: LogEntry;
  onDelete: (id: string) => void;
  onEditStart: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const time = format(parseISO(entry.createdAt), 'HH:mm');
  const outcome = entry.outcome
    ? (OUTCOME_CONFIG[entry.outcome] ?? { label: String(entry.outcome).replace(/_/g, ' '), className: 'bg-gray-100 text-gray-600' })
    : QUICK_BADGE;

  return (
    <div
      className="bg-white rounded-2xl px-4 py-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)] cursor-pointer select-none"
      onClick={() => setExpanded(prev => !prev)}
    >
      {/* 상단 행: 시간 / 결과 / 삭제+화살표 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-slate-400 font-mono">{time}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${outcome.className}`}>
          {outcome.label}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <ChevronDown
            size={14}
            className={`text-slate-300 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          />
          <button
            onClick={e => { e.stopPropagation(); onEditStart(entry.id); }}
            className="text-slate-300 hover:text-teal-400 transition-colors"
            aria-label="수정"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(entry.id); }}
            className="text-slate-300 hover:text-red-400 transition-colors"
            aria-label="삭제"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* 막힌 단어 */}
      <div className="flex items-baseline gap-2 mb-2">
        <HighlightedWord word={entry.word} blockedSyllables={entry.blockedSyllables ?? []} />
        {expanded && entry.phonemes && entry.phonemes.length > 0 && (
          <span className="text-xs text-teal-400">{entry.phonemes.join(', ')}</span>
        )}
      </div>

      {/* 상황 칩 */}
      <div className="flex flex-wrap gap-1">
        {(entry.situations ?? []).map(sit => (
          <span key={sit} className={`text-xs px-2 py-0.5 rounded-full font-medium ${SITUATION_COLOR[sit] ?? 'bg-gray-100 text-gray-600'}`}>
            {SITUATION_LABEL[sit] ?? String(sit).replace(/_/g, ' ')}
          </span>
        ))}
      </div>

      {/* 펼친 상태: 상세 정보 */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
          {entry.anxietyScore !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">긴장도</span>
              <span className="text-xs font-semibold text-teal-600">{entry.anxietyScore} / 10</span>
            </div>
          )}
          {entry.physicalState && (
            <div className="flex gap-2">
              <span className="text-xs text-gray-400 shrink-0">신체</span>
              <span className="text-xs text-gray-600">{entry.physicalState}</span>
            </div>
          )}
          {entry.emotionalState && (
            <div className="flex gap-2">
              <span className="text-xs text-gray-400 shrink-0">감정</span>
              <span className="text-xs text-gray-600">{entry.emotionalState}</span>
            </div>
          )}
          {entry.note && (
            <p className="text-xs text-slate-500 whitespace-pre-wrap pt-0.5">{entry.note}</p>
          )}
          {!entry.isDetailed && (
            <p className="text-xs text-gray-300 italic">상세 기록 없음</p>
          )}
        </div>
      )}

      {/* 접힌 상태: 메모 한 줄 미리보기 */}
      {!expanded && entry.note && (
        <p className="text-xs text-slate-400 truncate mt-1.5">{entry.note}</p>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────
export default function LogList() {
  const { entries, deleteEntry, updateEntry } = useLogStore();
  const handleDelete = async (id: string) => { await deleteEntry(id); };
  const [editingId, setEditingId] = useState<string | null>(null);
  const grouped = useMemo(() => groupByDate(entries), [entries]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <p className="text-4xl mb-3">📭</p>
        <p className="text-sm">아직 기록이 없어요.</p>
        <p className="text-xs mt-1">첫 번째 말막힘을 기록해보세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(([date, dayEntries]) => (
        <section key={date}>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-semibold text-slate-600">{formatDateHeader(date)}</h2>
            <span className="text-xs text-slate-400">{dayEntries.length}건</span>
          </div>
          <div className="space-y-2">
            {dayEntries.map(entry =>
              editingId === entry.id ? (
                <div key={entry.id} className="bg-white rounded-2xl px-4 py-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                  <p className="text-xs font-semibold text-teal-500 mb-4">기록 수정 중</p>
                  <LogForm
                    initialValues={entry}
                    onSubmit={async updates => {
                      await updateEntry(entry.id, updates);
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  onDelete={handleDelete}
                  onEditStart={setEditingId}
                />
              )
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
