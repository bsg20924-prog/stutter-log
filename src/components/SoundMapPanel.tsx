// 소리 지도 탭 — 구 진단 패널을 대체한다.
// 지도가 없으면 안내 + 시작 CTA, 있으면 최근 지도 결과를 보여준다.

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  RefreshCw, Map as MapIcon, Drama, MessagesSquare, ChevronRight, Clock,
} from 'lucide-react';
import {
  useLatestSoundMap, saveSoundMapResult, clearLocalSoundMaps,
} from '../hooks/useSoundMaps';
import { useSimulationRuns } from '../hooks/useSimulations';
import { DEFAULT_CARD_COUNT } from '../data/soundMap';
import { SCENARIO_COUNT } from '../data/simulation';
import { summarizeStandalone } from '../utils/simulationStandalone';
import SoundMapResultView from './SoundMapResultView';
import SimulationResultView from './SimulationResultView';

export default function SoundMapPanel({
  onStart, onStartSimulation, onStartLiveTalk,
}: {
  onStart: () => void;
  onStartSimulation: () => void;
  onStartLiveTalk: () => void;
}) {
  const { latest, loading } = useLatestSoundMap();
  const { runs } = useSimulationRuns();
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-400 text-sm">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {import.meta.env.DEV && <DevSeedBar hasMap={!!latest} />}

      {/* ── 무엇을 할지 고르기 ── */}
      {/* 두 경로를 나란히 둔다. 시뮬레이션만 하려고 카드 28장을 다 도는 건 말이 안 된다. */}
      <div className="space-y-2">
        <ModeCard
          icon={<MapIcon size={20} />}
          title={latest ? '소리 지도 다시 만들기' : '소리 지도 만들기'}
          desc={`소리 ${DEFAULT_CARD_COUNT}개를 속삭임 → 목소리 → 녹음 → 실제 상황으로 재요.`}
          note="어느 압력에서 왜 걸리는지 원인까지 가려내요. 20분 안팎."
          onClick={onStart}
          primary
        />
        <ModeCard
          icon={<Drama size={20} />}
          title="상황 시뮬레이션만 하기"
          desc={`상황 ${SCENARIO_COUNT}개에서 문장으로 답해요. 3~5분.`}
          note={latest
            ? '최근 소리 지도에 비춰 상황 탓인지 소리 탓인지 가려드려요.'
            : '지도가 없어도 할 수 있어요. 다만 원인 분석은 지도가 있어야 해요.'}
          onClick={onStartSimulation}
        />
        {/*
          사다리 위의 칸 — 여기부터는 말할 문장이 주어지지 않는다.
          측정이 아니라 노출이므로 소리 지도 점수와 섞지 않는다.
        */}
        <ModeCard
          icon={<MessagesSquare size={20} />}
          title="살아있는 대화"
          desc="말할 문장 없이, 상대가 내 대답을 받아 다음 말을 해요. 2~3분."
          note="다음에 무슨 말이 올지 모르는 것 — 그게 실전 압박의 핵심이에요."
          onClick={onStartLiveTalk}
        />
      </div>

      {/* ── 최근 시뮬레이션 이력 ── */}
      {runs.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-600 px-1 mb-2">최근 시뮬레이션</h2>
          <div className="space-y-2">
            {runs.slice(0, 5).map(run => (
              <div key={run.id} className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
                <button
                  onClick={() => setOpenRunId(openRunId === run.id ? null : run.id)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Clock size={13} className="shrink-0 text-gray-300" />
                    <span className="text-xs text-gray-400">
                      {format(parseISO(run.createdAt), 'M월 d일 HH:mm', { locale: ko })}
                    </span>
                    <ChevronRight
                      size={16}
                      className={`ml-auto shrink-0 text-gray-300 transition-transform ${openRunId === run.id ? 'rotate-90' : ''}`}
                    />
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed mt-1">{summarizeStandalone(run)}</p>
                </button>
                {openRunId === run.id && (
                  <div className="px-3 pb-3 pt-1 bg-gray-50/60">
                    <SimulationResultView run={run} onStartSoundMap={onStart} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 최근 소리 지도 ── */}
      {latest && (
        <>
          <div className="flex items-center justify-between px-1 pt-2">
            <h2 className="text-sm font-semibold text-gray-600">최근 소리 지도</h2>
            <button
              onClick={onStart}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-teal-50 text-teal-600 border border-teal-200 hover:bg-teal-100 transition-colors"
            >
              <RefreshCw size={13} />
              다시 만들기
            </button>
          </div>
          <SoundMapResultView result={latest} />
        </>
      )}
    </div>
  );
}

// 시작 경로 카드 — 소요 시간을 앞에 밝혀 고르기 쉽게 한다.
function ModeCard({
  icon, title, desc, note, onClick, primary,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  note: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'w-full flex items-start gap-3 rounded-2xl px-4 py-3.5 text-left transition-all',
        primary
          ? 'bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-[0_8px_30px_rgba(13,148,136,0.25)] hover:from-teal-600 hover:to-teal-700'
          : 'bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:bg-gray-50',
      ].join(' ')}
    >
      <span className={[
        'flex items-center justify-center w-10 h-10 rounded-xl shrink-0',
        primary ? 'bg-white/20' : 'bg-teal-50 text-teal-600',
      ].join(' ')}>
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-sm font-bold ${primary ? '' : 'text-gray-800'}`}>{title}</span>
        <span className={`block text-xs mt-0.5 ${primary ? 'text-teal-50/90' : 'text-gray-500'}`}>{desc}</span>
        <span className={`block text-[11px] mt-1 leading-relaxed ${primary ? 'text-teal-50/70' : 'text-gray-400'}`}>{note}</span>
      </span>
      <ChevronRight size={20} className={`shrink-0 mt-2 ${primary ? 'opacity-80' : 'text-gray-300'}`} />
    </button>
  );
}

// 개발 전용: 전체 카드를 다 돌지 않고 결과 화면을 바로 확인한다.
// 목업 데이터는 동적 import 라 프로덕션 번들에 들어가지 않고, 이 블록 자체도 DEV 에서만 렌더된다.
function DevSeedBar({ hasMap }: { hasMap: boolean }) {
  const [busy, setBusy] = useState(false);

  async function seed() {
    setBusy(true);
    try {
      const { buildMockSoundMap } = await import('../dev/soundMapMock');
      await saveSoundMapResult(buildMockSoundMap());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-purple-300 bg-purple-50/60 px-3 py-2">
      <span className="text-[10px] font-bold text-purple-500 tracking-wider shrink-0">DEV</span>
      <button
        onClick={seed}
        disabled={busy}
        className="rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-purple-500 text-white hover:bg-purple-600 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
      >
        {busy ? '만드는 중…' : '목업 지도 넣기'}
      </button>
      {hasMap && (
        <button
          onClick={clearLocalSoundMaps}
          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-purple-600 hover:bg-purple-100 transition-colors"
        >
          지우기
        </button>
      )}
      <span className="ml-auto text-[10px] text-purple-400 truncate">결과 화면 미리보기</span>
    </div>
  );
}
