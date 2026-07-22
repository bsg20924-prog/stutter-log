import { useEffect, useState } from 'react';
import { X, Shuffle, Check } from 'lucide-react';
import { Strategy, STRATEGY_CATEGORIES } from '../data/strategies';
import { getPracticeSteps, pickPracticeWord } from '../utils/practice';
import { useLogStore } from '../hooks/useLogStore';

const DURATION = 10; // 초

export default function QuickPracticeModal({
  strategy,
  blockedWords,
  onClose,
}: {
  strategy: Strategy;
  blockedWords: string[];
  onClose: () => void;
}) {
  const { addEntry } = useLogStore();
  const category = STRATEGY_CATEGORIES.find(c => c.id === strategy.category);

  const [wordIdx, setWordIdx] = useState(0);
  // 후보 단어: 막힌 단어들(없으면 기본 예시 1개)
  const candidates = blockedWords.length > 0
    ? blockedWords
    : [pickPracticeWord(strategy.id, [])];
  // 시작 단어를 전략에 맞는 것으로 정렬 우선
  const preferred = pickPracticeWord(strategy.id, blockedWords);
  const orderedCandidates = [preferred, ...candidates.filter(w => w !== preferred)];
  const word = orderedCandidates[wordIdx % orderedCandidates.length];

  const [secondsLeft, setSecondsLeft] = useState(DURATION);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // 카운트다운
  useEffect(() => {
    if (done) return;
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, done]);

  const steps = getPracticeSteps(strategy.id, word);
  const progress = (DURATION - secondsLeft) / DURATION; // 0..1
  const R = 26, C = 2 * Math.PI * R;

  async function handleDone() {
    if (saving) return;
    setSaving(true);
    try {
      await addEntry({
        word,
        blockedSyllables: [],
        phonemes: [],
        situations: [],
        outcome: '그대로_자연스럽게',
        status: 'overcome',
        isDetailed: false,
        tactics: [strategy.id],
        note: '10초 연습 완료',
      });
      setDone(true);
    } catch {
      // 저장 실패해도 사용자 흐름은 막지 않음 — 그냥 완료 화면으로
      setDone(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl max-h-[90dvh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-start gap-2 px-5 pt-5 pb-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 mb-0.5">{category?.emoji} 10초 연습</p>
            <h3 className="text-base font-bold text-gray-800">{strategy.name}</h3>
          </div>
          <button onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600" aria-label="닫기">
            <X size={20} />
          </button>
        </div>

        {done ? (
          /* 완료 화면 */
          <div className="px-5 pb-6 pt-2 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center mb-3">
              <Check size={30} className="text-teal-600" />
            </div>
            <p className="text-base font-bold text-gray-800 mb-1">잘했어요 👏</p>
            <p className="text-xs text-gray-500 mb-5">
              '{word}' 성공이 기록되었어요. 도전 단어에서도 사라집니다.
            </p>
            <button
              onClick={onClose}
              className="w-full rounded-xl py-3 text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 transition-colors"
            >
              닫기
            </button>
          </div>
        ) : (
          <div className="px-5 pb-6 space-y-4">
            {/* 연습 단어 + 카운트다운 */}
            <div className="flex items-center gap-4 bg-gray-50 rounded-2xl px-4 py-4">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 mb-1">연습할 단어</p>
                <p className="text-2xl font-bold text-gray-800 break-keep">{word}</p>
                {orderedCandidates.length > 1 && (
                  <button
                    onClick={() => setWordIdx(i => i + 1)}
                    className="mt-1.5 inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700"
                  >
                    <Shuffle size={12} /> 다른 단어
                  </button>
                )}
              </div>
              {/* 카운트다운 링 */}
              <div className="relative shrink-0" style={{ width: 64, height: 64 }}>
                <svg width="64" height="64" className="-rotate-90">
                  <circle cx="32" cy="32" r={R} fill="none" stroke="#e5e7eb" strokeWidth="5" />
                  <circle
                    cx="32" cy="32" r={R} fill="none" stroke="#14b8a6" strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={C}
                    strokeDashoffset={C * progress}
                    style={{ transition: 'stroke-dashoffset 1s linear' }}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-teal-600">
                  {secondsLeft}
                </span>
              </div>
            </div>

            {/* 단계 안내 */}
            <ol className="space-y-2">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-gray-700 leading-relaxed">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>

            {/* 완료 버튼 */}
            <button
              onClick={handleDone}
              disabled={saving}
              className="w-full rounded-xl py-3 text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
            >
              {saving ? '기록 중...' : '연습 완료 — 성공으로 기록'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
