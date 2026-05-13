import { useState } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ClipboardPen, ScrollText, Lightbulb } from 'lucide-react';
import { LogStoreProvider, useLogStore } from './hooks/useLogStore';
import { LogEntry } from './types';
import LogForm from './components/LogForm';
import LogList from './components/LogList';
import StatsPanel from './components/StatsPanel';
import ExportButton from './components/ExportButton';
import './index.css';

type Tab = 'record' | 'log' | 'stats';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'record', label: '기록하기', icon: <ClipboardPen size={22} /> },
  { id: 'log',    label: '나의 기록', icon: <ScrollText size={22} /> },
  { id: 'stats',  label: '인사이트',  icon: <Lightbulb size={22} /> },
];

// Provider 안에서 실제 앱 렌더링 (useLogStore 사용 가능)
function AppShell() {
  const [activeTab, setActiveTab] = useState<Tab>('record');
  const { addEntry, loading } = useLogStore();

  function handleAdd(entry: Omit<LogEntry, 'id' | 'createdAt'>) {
    addEntry(entry);
    setActiveTab('log'); // 저장 후 로그 탭으로 자동 이동
  }

  const today = format(new Date(), 'M월 d일 (EEEE)', { locale: ko });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-dvh bg-gray-50">
        <p className="text-gray-400 text-sm">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-dvh bg-gray-50">

      {/* ── 헤더 ── */}
      <header className="shrink-0 flex items-center gap-2 px-4 h-14 bg-white shadow-sm z-10">
        <h1 className="font-bold text-base tracking-wide text-gray-800">말막힘 일지</h1>
        <span className="text-gray-400 text-xs">{today}</span>
        <div className="ml-auto">
          <ExportButton />
        </div>
      </header>

      {/* ── 스크롤 콘텐츠 ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-32">
          {activeTab === 'record' && <LogForm onSubmit={handleAdd} />}
          {activeTab === 'log'    && <LogList />}
          {activeTab === 'stats'  && <StatsPanel />}
        </div>
      </main>

      {/* ── 하단 탭 바 (iOS 플로팅) ── */}
      <nav className="fixed bottom-0 inset-x-0 z-10 px-4 pb-5">
        <div className="flex max-w-lg mx-auto bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-gray-100/80">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex-1 flex flex-col items-center justify-center gap-1 py-3.5 text-xs font-medium transition-all duration-150 rounded-2xl',
                activeTab === tab.id
                  ? 'text-teal-600 bg-teal-50/60'
                  : 'text-gray-400 hover:text-gray-500',
              ].join(' ')}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

    </div>
  );
}

export default function App() {
  return (
    <LogStoreProvider>
      <AppShell />
    </LogStoreProvider>
  );
}
