// 소리 지도 4단계 · 실제 상황.
//
// 압력 사다리의 꼭대기. 같은 소리를 '상황 속 문장'으로 말한다.
// 실행 순서는 상황 시뮬레이션과 동일하다:
//   시작(터치) → 상대의 말 재생 → 3-2-1 → 응답 창 → 자가 평가
//
// ⚠️ iOS 는 터치 핸들러 안에서 동기적으로 시작한 소리만 허용한다.
// primeAudio() 와 speakPrompt() 사이에 await 를 끼우면 소리가 조용히 사라진다.

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, Play, Volume2, Sparkles } from 'lucide-react';
import { Assessment, ASSESSMENTS, UNKNOWN_ASSESSMENT, SituationAssignment } from '../data/soundMap';
import { RESPONSE_WINDOW_SEC, AMBIENT_META, AmbientKey } from '../data/simulation';
import {
  primeAudio, speakPrompt, cancelSpeech, SpeakHandle, SpeechOutcome,
} from '../utils/speech';

type Phase = 'ready' | 'prompt' | 'countdown' | 'respond' | 'assess';

const COUNTDOWN_FROM = 3;
const COUNTDOWN_INTERVAL = 800;

// 시나리오 id → 배경 상황 표시 (배경음 키와 같은 매핑)
const AMBIENT_BY_SCENARIO: Record<string, AmbientKey> = {
  'order-cafe': 'cafe',
  'introduction': 'office',
  'phone-reservation': 'phone',
};

export default function SituationStep({
  assignment, selected, onSelect,
}: {
  assignment: SituationAssignment;
  selected?: Assessment;
  onSelect: (v: Assessment) => void;
}) {
  const [phase, setPhase] = useState<Phase>('ready');
  const [countdown, setCountdown] = useState(COUNTDOWN_FROM);
  const [respondLeft, setRespondLeft] = useState(RESPONSE_WINDOW_SEC);
  const [outcome, setOutcome] = useState<SpeechOutcome | null>(null);

  const speakRef = useRef<SpeakHandle | null>(null);
  const timerRef = useRef<number | null>(null);
  const genRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 카드가 바뀌면(=배정 문장이 바뀌면) 항상 처음부터.
  useEffect(() => {
    genRef.current += 1;
    clearTimer();
    cancelSpeech();
    setPhase('ready');
    setOutcome(null);
    setCountdown(COUNTDOWN_FROM);
    setRespondLeft(RESPONSE_WINDOW_SEC);
  }, [assignment.sentence, clearTimer]);

  // 화면을 벗어나면 남은 발화·타이머를 정리한다.
  useEffect(() => () => {
    genRef.current += 1;
    speakRef.current?.cancel();
    cancelSpeech();
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
  }, []);

  const startRespond = useCallback((gen: number) => {
    if (genRef.current !== gen) return;
    setPhase('respond');
    let left = RESPONSE_WINDOW_SEC;
    setRespondLeft(left);
    clearTimer();
    timerRef.current = window.setInterval(() => {
      if (genRef.current !== gen) return;
      left -= 1;
      setRespondLeft(left);
      if (left <= 0) { clearTimer(); setPhase('assess'); }
    }, 1000);
  }, [clearTimer]);

  const startCountdown = useCallback((gen: number) => {
    if (genRef.current !== gen) return;
    setPhase('countdown');
    let n = COUNTDOWN_FROM;
    setCountdown(n);
    clearTimer();
    timerRef.current = window.setInterval(() => {
      if (genRef.current !== gen) return;
      n -= 1;
      if (n <= 0) { clearTimer(); startRespond(gen); }
      else setCountdown(n);
    }, COUNTDOWN_INTERVAL);
  }, [clearTimer, startRespond]);

  /** ⚠️ 반드시 버튼 onClick 에서 직접 호출 — 사이에 await 를 넣지 말 것. */
  function handleStart() {
    genRef.current += 1;
    const gen = genRef.current;
    primeAudio();
    setPhase('prompt');
    setOutcome(null);
    speakRef.current = speakPrompt(assignment.ttsPrompt, result => {
      if (genRef.current !== gen) return;
      setOutcome(result);
      startCountdown(gen);
    });
  }

  const ambient = AMBIENT_BY_SCENARIO[assignment.scenarioId];
  const ambientMeta = ambient ? AMBIENT_META[ambient] : null;

  return (
    <div className="space-y-3">
      {/* 상황 헤더 */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-xs font-semibold text-gray-700">{assignment.scenarioLabel}</span>
        {ambientMeta && (
          <span className="text-[11px] text-gray-400">{ambientMeta.emoji} {ambientMeta.label}</span>
        )}
        {assignment.source === 'gemini' && (
          <span
            className="ml-auto flex items-center gap-1 text-[10px] text-teal-500"
            title="이 문장은 AI 가 이 단어에 맞춰 만들었어요"
          >
            <Sparkles size={10} /> AI 문장
          </span>
        )}
      </div>

      {/* 상대의 말 — TTS 가 안 되는 기기에서는 이게 유일한 전달 수단이다 */}
      <div>
        <div className="inline-flex items-start gap-2 max-w-full bg-white rounded-2xl rounded-tl-sm shadow-[0_8px_30px_rgb(0,0,0,0.05)] px-4 py-3">
          <MessageSquare size={15} className="shrink-0 text-gray-300 mt-0.5" />
          <p className="text-sm text-gray-700 break-keep">{assignment.ttsPrompt}</p>
        </div>
        {phase === 'prompt' && (
          <p className="text-[11px] text-teal-500 mt-1.5 px-1">
            {outcome === 'fallback' ? '알림음으로 안내했어요' : '재생 중...'}
          </p>
        )}
      </div>

      {/* 말할 문장 */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] px-4 py-4 text-center">
        <p className="text-[11px] font-medium text-teal-500 mb-2">이렇게 답해 보세요</p>
        <p className="text-lg font-bold text-gray-800 leading-snug break-keep">{assignment.sentence}</p>
      </div>

      {phase === 'ready' && (
        <button
          onClick={handleStart}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 transition-colors"
        >
          <Play size={16} /> 시작
        </button>
      )}

      {phase === 'prompt' && (
        <div className="rounded-2xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] py-6 text-center">
          <p className="text-sm text-gray-500">상대의 말을 듣는 중...</p>
        </div>
      )}

      {phase === 'countdown' && (
        <div className="rounded-2xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] py-6 text-center">
          <p className="text-5xl font-bold text-teal-500 tabular-nums">{countdown}</p>
          <p className="text-xs text-gray-400 mt-2">곧 말할 차례예요</p>
        </div>
      )}

      {phase === 'respond' && (
        <div className="rounded-2xl bg-teal-50 border border-teal-200 py-6 text-center">
          <p className="text-sm font-semibold text-teal-800">지금 말하세요</p>
          <p className="text-4xl font-bold text-teal-600 tabular-nums mt-1">{Math.max(0, respondLeft)}</p>
          <button
            onClick={() => { clearTimer(); setPhase('assess'); }}
            className="mt-2 text-xs font-medium text-teal-700 underline underline-offset-2"
          >
            다 말했어요
          </button>
        </div>
      )}

      {phase === 'assess' && (
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
          <p className="text-sm text-gray-600 text-center mb-3">방금 어땠나요?</p>
          <div className="grid grid-cols-3 gap-2">
            {ASSESSMENTS.map(a => (
              <button
                key={a.value}
                onClick={() => onSelect(a.value)}
                className={[
                  'rounded-xl py-3 text-sm font-semibold border-2 transition-all active:scale-[0.98]',
                  selected === a.value ? a.activeCls : `bg-white border-gray-200 ${a.cls} hover:border-current`,
                ].join(' ')}
              >
                {a.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => onSelect(UNKNOWN_ASSESSMENT.value)}
            className={[
              'w-full mt-2 rounded-xl py-2.5 text-xs font-medium border-2 transition-all active:scale-[0.98]',
              selected === UNKNOWN_ASSESSMENT.value
                ? 'bg-gray-400 text-white border-gray-400'
                : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300',
            ].join(' ')}
          >
            {UNKNOWN_ASSESSMENT.label}
          </button>
          <p className="text-[11px] text-gray-400 text-center mt-2">
            확실하지 않으면 눌러도 괜찮아요. 모르는 것도 기록이에요.
          </p>
        </div>
      )}

      {/* 다시 듣기 */}
      {(phase === 'ready' || phase === 'assess') && (
        <button
          onClick={handleStart}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
        >
          <Volume2 size={14} /> 다시 듣기
        </button>
      )}
    </div>
  );
}
