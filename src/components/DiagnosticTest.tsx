import { useState } from 'react';
import { X, SkipForward, ChevronLeft, Check, Ban } from 'lucide-react';
import { unifiedDiagnosticWords, getDiagnosticGroup } from '../data/diagnosticWords';
import {
  computeDiagnosticResult, DiagnosticResult, WordResponse,
} from '../utils/diagnostic';
import { saveDiagnosticResult } from '../hooks/useDiagnostics';
import { useLogStore } from '../hooks/useLogStore';
import { getActiveChallengeWords } from '../utils/challenge';
import DiagnosticResultView from './DiagnosticResultView';

type Stage = 'test' | 'result';

export default function DiagnosticTest({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [stage, setStage] = useState<Stage>('test');
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, WordResponse>>({});
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const { entries, addEntry } = useLogStore();

  const words = unifiedDiagnosticWords;

  // 막힌 단어를 도전 단어 목록에 자동 추가 (이미 활성 도전 단어면 건너뜀).
  // 도전 단어는 로그에서 파생되므로, 'blocked' 로그를 남기는 방식으로 추가한다.
  async function addBlockedToChallenges(blockedWords: string[]) {
    const active = new Set(
      getActiveChallengeWords(entries).map(c => c.word.trim().toLowerCase()),
    );
    const toAdd = [...new Set(blockedWords.map(w => w.trim()))]
      .filter(w => w && !active.has(w.toLowerCase()));

    await Promise.allSettled(
      toAdd.map(word => addEntry({
        word,
        blockedSyllables: [],
        phonemes: [],
        situations: [],
        outcome: '',
        status: 'blocked',
        isDetailed: false,
        note: '자가 진단에서 막힘',
      })),
    );
  }

  async function finish(finalResponses: Record<string, WordResponse>) {
    const computed = computeDiagnosticResult(finalResponses);
    setStage('result');
    // 막힌 단어를 도전 단어로 자동 추가 (결과 표시를 막지 않도록 병렬 진행)
    addBlockedToChallenges(computed.blockedWords);
    try {
      const saved = await saveDiagnosticResult(computed);
      setResult(saved);
      onSaved?.();
    } catch {
      // 저장 실패 시에도 결과는 보여준다 (재시도 안내)
      setSaveError(true);
      setResult({ ...computed, id: 'local', createdAt: new Date().toISOString() });
    }
  }

  function answer(response: WordResponse) {
    const word = words[index];
    const next = { ...responses, [word.id]: response };
    setResponses(next);
    if (index + 1 >= words.length) {
      finish(next);
    } else {
      setIndex(index + 1);
    }
  }

  function goBack() {
    if (index > 0) setIndex(index - 1);
  }

  function requestExit() {
    if (stage === 'test' && Object.keys(responses).length > 0) setConfirmExit(true);
    else onClose();
  }

  return (
    <div className="fixed inset-0 z-40 bg-gray-50 flex flex-col h-dvh">

      {/* ── 헤더 ── */}
      <header className="shrink-0 flex items-center gap-2 px-4 h-14 bg-white shadow-sm">
        <h1 className="font-bold text-base text-gray-800">자가 진단 테스트</h1>
        <button
          onClick={requestExit}
          className="ml-auto flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="테스트 종료"
        >
          <X size={20} />
        </button>
      </header>

      {/* ── 본문 ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-5">

          {stage === 'test' && (
            <TestRunner
              word={words[index].word}
              groupLabel={getDiagnosticGroup(words[index].displayGroupId)?.label ?? ''}
              groupSub={getDiagnosticGroup(words[index].displayGroupId)?.sublabel ?? ''}
              index={index}
              total={words.length}
              onAnswer={answer}
              onBack={goBack}
            />
          )}

          {stage === 'result' && result && (
            <div className="space-y-4 pb-4">
              <div className="text-center pt-2">
                <p className="text-2xl mb-1">🎉</p>
                <h2 className="text-lg font-bold text-gray-800">진단 완료!</h2>
                <p className="text-xs text-gray-400 mt-1">결과가 저장되어 앱 전반의 추천에 반영돼요.</p>
              </div>
              {saveError && (
                <p className="text-xs text-red-500 text-center">
                  결과 저장에 실패했어요. 네트워크 확인 후 다시 진단해 주세요.
                </p>
              )}
              <DiagnosticResultView result={result} />
              <button
                onClick={onClose}
                className="w-full rounded-xl py-3 text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 transition-colors"
              >
                완료
              </button>
            </div>
          )}
        </div>
      </main>

      {/* ── 종료 확인 ── */}
      {confirmExit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmExit(false)}>
          <div className="w-full max-w-xs bg-white rounded-2xl p-5 text-center" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold text-gray-800 mb-1">진단을 종료할까요?</p>
            <p className="text-xs text-gray-400 mb-4">진행 상황은 저장되지 않아요.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmExit(false)}
                className="flex-1 rounded-xl py-2.5 text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                계속하기
              </button>
              <button
                onClick={onClose}
                className="flex-1 rounded-xl py-2.5 text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                종료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TestRunner({
  word, groupLabel, groupSub, index, total, onAnswer, onBack,
}: {
  word: string;
  groupLabel: string;
  groupSub: string;
  index: number;
  total: number;
  onAnswer: (r: WordResponse) => void;
  onBack: () => void;
}) {
  const progress = Math.round(((index + 1) / total) * 100);

  return (
    <div className="flex flex-col">
      {/* 진행 표시 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-gray-500">단어 {index + 1} / {total}</span>
          <span className="text-xs text-gray-400">{progress}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-teal-400 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* 플래시카드 */}
      <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] px-6 py-12 text-center mb-6">
        <p className="text-xs font-medium text-teal-500 mb-4">{groupLabel} · {groupSub}</p>
        <p className="text-5xl font-bold text-gray-800 tracking-tight break-keep">{word}</p>
        <p className="text-xs text-gray-400 mt-6">소리 내어 읽어보세요</p>
      </div>

      {/* 주요 액션 버튼 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <button
          onClick={() => onAnswer('blocked')}
          className="flex flex-col items-center gap-1.5 rounded-2xl py-5 bg-red-50 text-red-600 border-2 border-red-200 hover:bg-red-100 active:scale-[0.98] transition-all"
        >
          <Ban size={26} />
          <span className="text-sm font-bold">막힘</span>
          <span className="text-xs text-red-400">Blocked</span>
        </button>
        <button
          onClick={() => onAnswer('clear')}
          className="flex flex-col items-center gap-1.5 rounded-2xl py-5 bg-teal-50 text-teal-600 border-2 border-teal-200 hover:bg-teal-100 active:scale-[0.98] transition-all"
        >
          <Check size={26} />
          <span className="text-sm font-bold">안 막힘</span>
          <span className="text-xs text-teal-400">Clear</span>
        </button>
      </div>

      {/* 보조 컨트롤 */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          disabled={index === 0}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors py-2"
        >
          <ChevronLeft size={14} /> 이전
        </button>
        <button
          onClick={() => onAnswer('skip')}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-teal-500 transition-colors py-2"
        >
          <SkipForward size={14} /> 이 단어 건너뛰기
        </button>
      </div>
    </div>
  );
}
