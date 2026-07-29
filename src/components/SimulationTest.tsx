// 상황 시뮬레이션 단독 실행 (전체 화면).
//
// 소리 지도 28장을 다 돌지 않고 시뮬레이션만 하고 싶을 때의 경로다.
// 진행 화면은 SimulationRunner 를 그대로 재사용하고, 이 셸은 저장과 결과만 담당한다.
// 소리 지도 안의 Stage 4 경로(SoundMapTest)는 그대로 남는다 — 지도를 막 만든 직후에는
// 이어서 하는 흐름이 더 자연스럽기 때문이다.

import { useState, useRef, useEffect } from 'react';
import { X, Drama } from 'lucide-react';
import { SimScenario } from '../data/simulation';
import { SimSentenceResponse, buildSimulationResult } from '../utils/simulationResult';
import {
  StandaloneSimulation, buildStandaloneSimulation,
} from '../utils/simulationStandalone';
import { saveSimulationRun } from '../hooks/useSimulations';
import { useLatestSoundMap } from '../hooks/useSoundMaps';
import { useLogStore } from '../hooks/useLogStore';
import { getActiveChallengeWords } from '../utils/challenge';
import { attachSoundMapId, deleteClipsBySession } from '../utils/recordingStore';
import { Strategy } from '../data/strategies';
import SimulationRunner from './SimulationRunner';
import SimulationResultView from './SimulationResultView';
import StrategyDetailModal from './StrategyDetailModal';

type Stage = 'run' | 'done';

export default function SimulationTest({
  onClose, onStartSoundMap,
}: {
  onClose: () => void;
  onStartSoundMap?: () => void;
}) {
  const [stage, setStage] = useState<Stage>('run');
  const [scenarios, setScenarios] = useState<SimScenario[]>([]);
  const [responses, setResponses] = useState<Record<string, SimSentenceResponse>>({});
  const [recordingSessionId, setRecordingSessionId] = useState<string | undefined>();
  const [confirmExit, setConfirmExit] = useState(false);

  const { entries } = useLogStore();
  const challengeWords = getActiveChallengeWords(entries).map(c => c.word);
  // 판별 기준선 — 없으면 원인 분석 없이 진행한다.
  const { latest: referenceMap } = useLatestSoundMap();

  function finish(
    s: SimScenario[],
    r: Record<string, SimSentenceResponse>,
    sessionId?: string,
  ) {
    setScenarios(s);
    setResponses(r);
    setRecordingSessionId(sessionId);
    setStage('done');
  }

  return (
    <div className="fixed inset-0 z-40 bg-gray-50 flex flex-col h-dvh">
      <header className="shrink-0 flex items-center gap-2 px-4 h-14 bg-white shadow-sm">
        <Drama size={18} className="text-teal-500" />
        <h1 className="font-bold text-base text-gray-800">상황 시뮬레이션</h1>
        <button
          onClick={() => (stage === 'run' ? setConfirmExit(true) : onClose())}
          className="ml-auto flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="종료"
        >
          <X size={20} />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-5">
          {stage === 'run' && (
            <SimulationRunner
              challengeWords={challengeWords}
              onFinish={finish}
              onSkip={onClose}
            />
          )}

          {stage === 'done' && (
            <DoneScreen
              scenarios={scenarios}
              responses={responses}
              referenceMap={referenceMap}
              recordingSessionId={recordingSessionId}
              onClose={onClose}
              onStartSoundMap={onStartSoundMap}
            />
          )}
        </div>
      </main>

      {confirmExit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmExit(false)}>
          <div className="w-full max-w-xs bg-white rounded-2xl p-5 text-center" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold text-gray-800 mb-1">시뮬레이션을 종료할까요?</p>
            <p className="text-xs text-gray-400 mb-4">진행 상황은 저장되지 않아요.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmExit(false)} className="flex-1 rounded-xl py-2.5 text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                계속하기
              </button>
              <button onClick={onClose} className="flex-1 rounded-xl py-2.5 text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">
                종료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DoneScreen({
  scenarios, responses, referenceMap, recordingSessionId, onClose, onStartSoundMap,
}: {
  scenarios: SimScenario[];
  responses: Record<string, SimSentenceResponse>;
  referenceMap: ReturnType<typeof useLatestSoundMap>['latest'];
  recordingSessionId?: string;
  onClose: () => void;
  onStartSoundMap?: () => void;
}) {
  const [run, setRun] = useState<StandaloneSimulation | null>(null);
  const [unsaved, setUnsaved] = useState(false);
  const [detail, setDetail] = useState<Strategy | null>(null);
  const ranRef = useRef(false);   // StrictMode 이중 실행 방어

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const sim = buildSimulationResult(scenarios, responses);
    const computed = buildStandaloneSimulation(sim, referenceMap);
    const stamp = (): StandaloneSimulation =>
      ({ ...computed, id: 'unsaved', createdAt: new Date().toISOString() });

    // 한 문장도 평가하지 않았으면 저장하지 않는다.
    if (sim.sentences.length === 0) {
      if (recordingSessionId) void deleteClipsBySession(recordingSessionId);
      setRun(stamp());
      setUnsaved(true);
      return;
    }

    saveSimulationRun(computed)
      .then(saved => {
        // 녹음은 실행 id 가 정해지기 전에 만들어지므로 지금 붙인다.
        if (recordingSessionId) {
          void attachSoundMapId(recordingSessionId, saved.id).finally(() => setRun(saved));
        } else {
          setRun(saved);
        }
      })
      .catch(() => {
        // 저장 실패 시 녹음도 남기지 않는다 — 안내와 실제가 어긋나면 안 된다.
        if (recordingSessionId) void deleteClipsBySession(recordingSessionId);
        setRun(stamp());
        setUnsaved(true);
      });
  }, [scenarios, responses, referenceMap, recordingSessionId]);

  if (!run) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-400 text-sm">결과를 정리하는 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center pt-2 pb-1">
        <p className="text-3xl mb-2">🎭</p>
        <h2 className="text-lg font-bold text-gray-800">시뮬레이션을 마쳤어요!</h2>
        {unsaved && (
          <p className="text-xs text-amber-600 mt-2">
            이번 기록은 저장되지 않았어요.
            {recordingSessionId && ' 녹음도 함께 지웠어요.'}
          </p>
        )}
      </div>

      <SimulationResultView
        run={run}
        onStartSoundMap={onStartSoundMap}
        onDetail={setDetail}
      />

      <button
        onClick={onClose}
        className="w-full rounded-xl py-3.5 text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 transition-colors"
      >
        완료
      </button>

      {detail && <StrategyDetailModal strategy={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
