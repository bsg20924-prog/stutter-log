import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ClipboardPen, ScrollText, Lightbulb, Target, LogOut, Map as MapIcon, ChevronRight } from 'lucide-react';
import {
  onAuthStateChanged, signInWithPopup, signOut, type User,
} from 'firebase/auth';
import { auth, googleProvider, OWNER_EMAIL } from './firebase';
import { pullGeminiKey } from './utils/gemini';
import { blockReload, onUpdatePending, applyUpdateNow } from './utils/swUpdate';
import { LogStoreProvider, useLogStore } from './hooks/useLogStore';
import { useLatestSoundMap } from './hooks/useSoundMaps';
import { LogEntry } from './types';
import LogForm from './components/LogForm';
import LogList from './components/LogList';
import StatsPanel from './components/StatsPanel';
import ExportButton from './components/ExportButton';
import QuickLogInput from './components/QuickLogInput';
import ChallengeList from './components/ChallengeList';
import SoundMapPanel from './components/SoundMapPanel';
import SoundMapTest from './components/SoundMapTest';
import SimulationTest from './components/SimulationTest';
import InstallPrompt from './components/InstallPrompt';
import './index.css';

type Tab = 'record' | 'log' | 'challenge' | 'soundmap' | 'stats';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'record',    label: '기록하기',  icon: <ClipboardPen size={20} /> },
  { id: 'log',       label: '나의 기록', icon: <ScrollText size={20} /> },
  { id: 'challenge', label: '도전 단어', icon: <Target size={20} /> },
  { id: 'soundmap',  label: '소리 지도', icon: <MapIcon size={20} /> },
  { id: 'stats',     label: '인사이트',  icon: <Lightbulb size={20} /> },
];

// Provider 안에서 실제 앱 렌더링 (useLogStore 사용 가능)
function AppShell({ onSignOut }: { onSignOut: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('record');
  const [showSoundMap, setShowSoundMap] = useState(false);
  const [showSimulation, setShowSimulation] = useState(false);
  const { addEntry, loading } = useLogStore();
  const [updateReady, setUpdateReady] = useState(false);

  // 검사/시뮬레이션이 열려 있는 동안에는 자동 새로고침을 막는다 —
  // 응답이 메모리에만 있어서 중간에 새로고침되면 진행이 통째로 날아간다.
  useEffect(() => {
    blockReload(showSoundMap || showSimulation);
  }, [showSoundMap, showSimulation]);

  useEffect(() => onUpdatePending(setUpdateReady), []);
  // 소리 지도를 한 번도 만들지 않은 사용자에게만 기록 탭 상단 유도 카드를 띄운다.
  const { latest: soundMap, loading: soundMapLoading } = useLatestSoundMap();

  async function handleAdd(entry: Omit<LogEntry, 'id' | 'createdAt'>) {
    await addEntry(entry);
    setActiveTab('log');
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
        <div className="ml-auto flex items-center gap-1">
          <ExportButton />
          <button
            onClick={onSignOut}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="로그아웃"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* ── 스크롤 콘텐츠 ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-32">
          {activeTab === 'record' && (
            <div className="space-y-4">
              <InstallPrompt />
              {!soundMapLoading && !soundMap && (
                <SoundMapPromptCard onStart={() => setShowSoundMap(true)} />
              )}
              <QuickLogInput />
              <div>
                <p className="text-xs font-semibold text-gray-400 mb-3 px-1">상세 기록</p>
                <LogForm onSubmit={handleAdd} />
              </div>
            </div>
          )}
          {activeTab === 'log'       && <LogList />}
          {activeTab === 'challenge' && <ChallengeList />}
          {activeTab === 'soundmap'  && (
            <SoundMapPanel
              onStart={() => setShowSoundMap(true)}
              onStartSimulation={() => setShowSimulation(true)}
            />
          )}
          {activeTab === 'stats'     && <StatsPanel />}
        </div>
      </main>

      {/* ── 소리 지도 만들기 (전체 화면) ── */}
      {showSoundMap && (
        <SoundMapTest
          onClose={() => {
            setShowSoundMap(false);
            setActiveTab('soundmap');
          }}
        />
      )}

      {/* ── 상황 시뮬레이션 단독 실행 (전체 화면) ── */}
      {showSimulation && (
        <SimulationTest
          onClose={() => {
            setShowSimulation(false);
            setActiveTab('soundmap');
          }}
          onStartSoundMap={() => {
            setShowSimulation(false);
            setShowSoundMap(true);
          }}
        />
      )}

      {/* ── 새 버전 안내 — 검사 중이라 자동 반영을 미룬 경우에만 뜬다 ── */}
      {updateReady && (
        <div className="fixed bottom-24 inset-x-0 z-30 px-4 pointer-events-none">
          <button
            onClick={applyUpdateNow}
            className="pointer-events-auto mx-auto flex max-w-lg w-full items-center gap-2 rounded-xl bg-gray-800 text-white px-4 py-3 shadow-lg"
          >
            <span className="text-xs font-medium flex-1 text-left">
              새 버전이 준비됐어요. 지금 진행 중인 건 끝내고 반영돼요.
            </span>
            <span className="text-xs font-bold shrink-0">지금 새로고침</span>
          </button>
        </div>
      )}

      {/* ── 하단 탭 바 (iOS 플로팅) ── */}
      <nav className="fixed bottom-0 inset-x-0 z-10 px-4 pb-5">
        <div className="flex max-w-lg mx-auto bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-gray-100/80">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex-1 flex flex-col items-center justify-center gap-1 py-3.5 text-[11px] font-medium whitespace-nowrap transition-all duration-150 rounded-2xl',
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

// 기록 탭 상단의 소리 지도 유도 카드 — 아직 지도를 만들지 않은 사용자에게만 보인다.
function SoundMapPromptCard({ onStart }: { onStart: () => void }) {
  return (
    <button
      onClick={onStart}
      className="w-full flex items-center gap-3 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 text-white px-4 py-3.5 shadow-[0_8px_30px_rgba(13,148,136,0.25)] hover:from-teal-600 hover:to-teal-700 transition-all text-left"
    >
      <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/20 shrink-0">
        <MapIcon size={22} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold">소리 지도 만들기</p>
        <p className="text-xs text-teal-50/90 mt-0.5">어느 압력에서 왜 걸리는지 찾고 맞춤 전략 받기</p>
      </div>
      <ChevronRight size={20} className="shrink-0 opacity-80" />
    </button>
  );
}

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center h-dvh bg-gray-50">
      <div className="text-center px-6">{children}</div>
    </div>
  );
}

function SignInScreen({ onSignIn, error }: { onSignIn: () => void; error: string | null }) {
  return (
    <CenterMessage>
      <h1 className="font-bold text-lg text-gray-800 mb-1">말막힘 일지</h1>
      <p className="text-gray-400 text-sm mb-6">내 기록은 나만 볼 수 있어요.</p>
      <button
        onClick={onSignIn}
        className="rounded-xl px-5 py-3 text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 transition-colors"
      >
        Google로 로그인
      </button>
      {error && <p className="text-red-500 text-xs mt-4">{error}</p>}
    </CenterMessage>
  );
}

function UnauthorizedScreen({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  return (
    <CenterMessage>
      <p className="text-4xl mb-3">🔒</p>
      <p className="text-gray-600 text-sm mb-1">이 계정으로는 접근할 수 없어요.</p>
      {email && <p className="text-gray-400 text-xs mb-6">{email}</p>}
      <button
        onClick={onSignOut}
        className="rounded-xl px-5 py-2.5 text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
      >
        다른 계정으로 로그인
      </button>
    </CenterMessage>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, u => {
    setUser(u);
    setChecking(false);
    // 로그인이 확인된 뒤에만 동기화된 Gemini 키를 가져온다.
    // 이 문서는 firestore.rules 의 isOwner() 로 잠겨 있어 로그인 전에는 읽히지 않는다.
    // 실패해도 무시 — 키가 없으면 기본 문장으로 동작할 뿐이다.
    if (u?.email === OWNER_EMAIL) void pullGeminiKey();
  }), []);

  async function handleSignIn() {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch {
      setAuthError('로그인에 실패했어요. 다시 시도해 주세요.');
    }
  }

  // 개발 서버(npm run dev)에서만 로그인 게이트를 건너뛴다.
  // import.meta.env.DEV 는 프로덕션 빌드에서 false 이므로 배포에는 영향 없음.
  const bypassAuth = import.meta.env.DEV;

  if (!bypassAuth) {
    if (checking) {
      return <CenterMessage><p className="text-gray-400 text-sm">불러오는 중...</p></CenterMessage>;
    }
    if (!user) {
      return <SignInScreen onSignIn={handleSignIn} error={authError} />;
    }
    if (user.email !== OWNER_EMAIL) {
      return <UnauthorizedScreen email={user.email} onSignOut={() => signOut(auth)} />;
    }
  }

  return (
    <LogStoreProvider>
      <AppShell onSignOut={() => signOut(auth)} />
    </LogStoreProvider>
  );
}
