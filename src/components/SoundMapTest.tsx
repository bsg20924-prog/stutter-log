import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { X, ChevronLeft, Plus, Map as MapIcon } from 'lucide-react';
import {
  SoundCard, SoundResponse, Assessment, SoundStepId, RecordingMode, SituationAssignment,
  SOUND_STEPS, ASSESSMENTS, UNKNOWN_ASSESSMENT, KIND_LABEL,
  buildDefaultCards, makeCustomCard, SUGGESTED_CUSTOM_WORDS,
} from '../data/soundMap';
import { assignSituations, templateAssignment, AssignResult } from '../utils/situationAssign';
import SituationStep from './SituationStep';
import { useMicPressure, MicPressure } from '../hooks/useMicPressure';
import {
  SoundMapResult, computeSoundMapResult, isSoundMapComplete,
} from '../utils/soundMapResult';
import { saveSoundMapResult } from '../hooks/useSoundMaps';
import { useLogStore } from '../hooks/useLogStore';
import { getActiveChallengeWords } from '../utils/challenge';
import RecordingPressurePanel from './RecordingPressurePanel';
import GeminiKeySettings from './GeminiKeySettings';
import VoiceSettings from './VoiceSettings';
import SoundMapResultView from './SoundMapResultView';

// 상황(4단계)은 카드마다 사다리 안에서 겪는다 — 별도 단계가 아니다.
type Stage = 'intro' | 'card' | 'done';

export default function SoundMapTest({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState<Stage>('intro');
  const [cards, setCards] = useState<SoundCard[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [step, setStep] = useState(0); // 0~3
  const [responses, setResponses] = useState<Record<string, SoundResponse>>({});
  const [confirmExit, setConfirmExit] = useState(false);
  const [countdownOn, setCountdownOn] = useState(true);
  // 카드별 4단계 상황 배정 (Gemini 우선, 실패하면 템플릿)
  const [situations, setSituations] = useState<Record<string, SituationAssignment>>({});
  const [geminiFailed, setGeminiFailed] = useState(false);
  // 인트로에서 미리 돌려 둔 기본 카드 배정. 사용자가 단어를 넣고 읽는 동안
  // 생성이 끝나 있으면 4단계에서 기다릴 일이 없다.
  const prefetchRef = useRef<Promise<AssignResult> | null>(null);
  // 늦게 도착한 결과를 합칠 때 '이미 답한 카드'를 건너뛰기 위해 최신 응답을 참조한다.
  const responsesRef = useRef(responses);
  responsesRef.current = responses;

  // 인트로가 떠 있는 동안 기본 카드 문장을 미리 만들어 둔다.
  // 사용자가 무서운 단어를 넣고 안내를 읽는 시간이 그대로 생성 시간이 된다.
  useEffect(() => {
    if (stage !== 'intro' || prefetchRef.current) return;
    prefetchRef.current = assignSituations(buildDefaultCards());
  }, [stage]);

  // Stage 4 문장 재료 — 아직 극복하지 못한 도전 단어를 그대로 쓴다.
  const { entries } = useLogStore();
  const challengeWords = getActiveChallengeWords(entries).map(c => c.word);

  const mic = useMicPressure(countdownOn);
  const { start: micStart, stop: micStop, grantedOnce, didRecordRef } = mic;

  const card = cards[cardIndex];
  const onRecordingStep = stage === 'card' && SOUND_STEPS[step]?.id === 'recording';

  // 3단계에 들어오면 녹음을 켜고, 벗어나면(카드 이동·이전·종료 확인) 즉시 마이크를 정리한다.
  useEffect(() => {
    if (!onRecordingStep || confirmExit) {
      micStop();
      return;
    }
    // 첫 카드에서는 사용자가 '녹음 시작하기'를 눌러야 권한 창이 제스처 안에서 뜬다.
    // 한 번 허용된 뒤로는 카드마다 자동으로 시작한다.
    if (grantedOnce) micStart();
  }, [onRecordingStep, confirmExit, cardIndex, grantedOnce, micStart, micStop]);

  async function start(customWords: string[], countdown: boolean) {
    const custom = customWords.map((w, i) => makeCustomCard(w, i + 1));
    const allCards = [...buildDefaultCards(), ...custom];
    setCountdownOn(countdown);
    setCards(allCards);
    setCardIndex(0);
    setStep(0);
    setResponses({});
    setStage('card');

    // 템플릿 배정을 **즉시** 넣어 4단계가 절대 비어 있지 않게 한다.
    // assignSituations 는 템플릿을 먼저 채우고 Gemini 로 덮어쓰므로,
    // 여기서는 결과가 오는 대로 갈아끼우기만 하면 된다 — 기다리지 않는다.
    const templates: Record<string, SituationAssignment> = {};
    allCards.forEach((c, i) => { templates[c.id] = templateAssignment(c, i); });
    setSituations(templates);

    // 인트로에서 미리 돌려 둔 결과가 있으면 그걸 쓴다(기본 카드 한정).
    const pending = prefetchRef.current ?? assignSituations(allCards);
    prefetchRef.current = null;

    void pending.then(result => {
      // 이미 지나간 카드의 문장을 바꾸면 기록과 화면이 어긋난다 —
      // 아직 4단계 응답이 없는 카드에만 적용한다.
      setSituations(prev => {
        const next = { ...prev };
        for (const [id, a] of Object.entries(result.assignments)) {
          if (responsesRef.current[id]?.situation === undefined) next[id] = a;
        }
        return next;
      });
      setGeminiFailed(result.geminiFailed);
    }).catch(() => {
      // 실패해도 템플릿이 이미 들어가 있어 검사는 그대로 진행된다.
    });
  }

  // 다음 단계(또는 다음 카드/완료)로 진행
  function advance() {
    if (step < SOUND_STEPS.length - 1) {
      setStep(step + 1);
    } else if (cardIndex < cards.length - 1) {
      setCardIndex(cardIndex + 1);
      setStep(0);
    } else {
      setStage('done');
    }
  }

  function back() {
    if (step > 0) {
      setStep(step - 1);
    } else if (cardIndex > 0) {
      setCardIndex(cardIndex - 1);
      setStep(SOUND_STEPS.length - 1);
    }
  }

  function setFear(n: number) {
    setResponses(prev => ({ ...prev, [card.id]: { ...prev[card.id], fear: n } }));
    advance();
  }

  function setAssessment(stepId: SoundStepId, value: Assessment) {
    // 실제 녹음이 돌던 중의 응답인지 표시만 남긴다 (오디오는 저장하지 않음).
    // 업데이터 안에서 ref 를 읽으면 실행 시점이 밀릴 수 있어 지금 값을 캡처해 둔다.
    const mode: RecordingMode = didRecordRef.current ? 'mic' : 'manual';
    const situation = situations[card.id];
    setResponses(prev => ({
      ...prev,
      [card.id]: {
        ...prev[card.id],
        [stepId]: value,
        ...(stepId === 'recording' ? { recordingMode: mode } : {}),
        // 어떤 상황/문장에서 나온 응답인지 함께 남긴다 — 처방에 맥락을 붙이는 데 쓴다.
        ...(stepId === 'situation' && situation ? {
          situationScenarioId: situation.scenarioId,
          situationScenarioLabel: situation.scenarioLabel,
          situationSentence: situation.sentence,
          situationSource: situation.source,
        } : {}),
      },
    }));
    advance();
  }

  function requestExit() {
    if (stage === 'card') setConfirmExit(true);
    else onClose();
  }

  return (
    <div className="fixed inset-0 z-40 bg-gray-50 flex flex-col h-dvh">
      {/* ── 헤더 ── */}
      <header className="shrink-0 flex items-center gap-2 px-4 h-14 bg-white shadow-sm">
        <MapIcon size={18} className="text-teal-500" />
        <h1 className="font-bold text-base text-gray-800">소리 지도 만들기</h1>
        <button
          onClick={requestExit}
          className="ml-auto flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="종료"
        >
          <X size={20} />
        </button>
      </header>

      {/* ── 본문 ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-5">
          {stage === 'intro' && (
            <IntroScreen challengeWords={challengeWords} onStart={start} />
          )}

          {stage === 'card' && card && (
            <CardRunner
              card={card}
              cardIndex={cardIndex}
              total={cards.length}
              step={step}
              response={responses[card.id] ?? {}}
              situation={situations[card.id]}
              geminiFailed={geminiFailed}
              mic={mic}
              onFear={setFear}
              onAssess={setAssessment}
              onBack={back}
            />
          )}

          {stage === 'done' && (
            <DoneScreen cards={cards} responses={responses} onClose={onClose} />
          )}
        </div>
      </main>

      {/* ── 종료 확인 ── */}
      {confirmExit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmExit(false)}>
          <div className="w-full max-w-xs bg-white rounded-2xl p-5 text-center" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold text-gray-800 mb-1">소리 지도를 종료할까요?</p>
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

// ── 인트로: 소리 세트 안내 + 무서운 단어 추가 ─────────────────
function IntroScreen({
  challengeWords, onStart,
}: {
  challengeWords: string[];
  onStart: (customWords: string[], countdown: boolean) => void;
}) {
  const [custom, setCustom] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [countdown, setCountdown] = useState(true);

  function addWord(raw: string) {
    const w = raw.trim();
    if (!w || custom.includes(w)) return;
    setCustom(prev => [...prev, w]);
    setInput('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      addWord(input);
    }
  }

  // 실제로 막혔던 도전 단어를 먼저 제안한다.
  // 이 단어들을 카드로 넣어야 Stage 4 에서 걸렸을 때 "상황 탓인지 소리 탓인지"를 가를 수 있다.
  // 넣지 않으면 상황에서 걸려도 비교 기준이 없어 처방을 만들 수 없다.
  const remainingSuggestions = [
    ...challengeWords.slice(0, 5),
    ...SUGGESTED_CUSTOM_WORDS,
  ].filter((w, i, arr) => arr.indexOf(w) === i && !custom.includes(w));

  return (
    <div className="space-y-4">
      <div className="text-center pt-2 pb-1">
        <p className="text-3xl mb-2">🗺️</p>
        <h2 className="text-lg font-bold text-gray-800">소리 지도 만들기</h2>
        <p className="text-xs text-gray-400 mt-2 leading-relaxed">
          같은 소리를 <b>속삭임 → 목소리 → 녹음 → 실제 상황</b> 4단계로 말하며<br />
          어느 압력에서 막히는지 나만의 지도를 만들어요.
        </p>
      </div>

      {/* 단계 미리보기 */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
        <div className="flex items-center justify-between">
          {SOUND_STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className="text-center">
                <div className="mx-auto w-8 h-8 rounded-full bg-teal-50 text-teal-600 text-xs font-bold flex items-center justify-center mb-1">
                  {i}
                </div>
                <span className="text-[10px] text-gray-500">{s.short}</span>
              </div>
              {i < SOUND_STEPS.length - 1 && <div className="w-4 h-px bg-gray-200" />}
            </div>
          ))}
        </div>
      </div>

      {/* 무서운 단어 추가 */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
        <p className="text-sm font-semibold text-gray-700 mb-1">무서운 단어 추가 <span className="text-gray-400 font-normal">(선택)</span></p>
        <p className="text-xs text-gray-400 mb-3">
          이름, 자주 막히는 단어를 넣으면 지도에 함께 담아요.
          {challengeWords.length > 0 && ' 도전 단어를 넣으면 마지막 상황 단계와 비교할 수 있어요.'}
        </p>

        <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 mb-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="예: 아메리카노"
            className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
          />
          <button
            onClick={() => addWord(input)}
            disabled={!input.trim()}
            className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-teal-500 text-white disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
            aria-label="추가"
          >
            <Plus size={15} />
          </button>
        </div>

        {remainingSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {remainingSuggestions.map(w => (
              <button
                key={w}
                onClick={() => addWord(w)}
                className="text-xs text-teal-600 bg-teal-50 border border-teal-200 rounded-full px-2.5 py-1 hover:bg-teal-100 transition-colors"
              >
                + {w}
              </button>
            ))}
          </div>
        )}

        {custom.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {custom.map(w => (
              <span key={w} className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-full pl-2.5 pr-1.5 py-1">
                {w}
                <button onClick={() => setCustom(prev => prev.filter(x => x !== w))} className="text-gray-400 hover:text-red-400" aria-label="제거">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <VoiceSettings />

      <GeminiKeySettings />

      {/* 녹음 압박 설정 */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-700">녹음 전 3-2-1 카운트다운</p>
            <p className="text-xs text-gray-400 mt-0.5">숨 고를 틈을 두고 녹음이 시작돼요.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={countdown}
            aria-label="녹음 전 3-2-1 카운트다운"
            onClick={() => setCountdown(v => !v)}
            className={[
              'relative shrink-0 w-11 h-6 rounded-full transition-colors',
              countdown ? 'bg-teal-500' : 'bg-gray-200',
            ].join(' ')}
          >
            <span
              className={[
                'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all',
                countdown ? 'left-[22px]' : 'left-0.5',
              ].join(' ')}
            />
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-3 leading-relaxed border-t border-gray-100 pt-3">
          3단계에서는 <b className="text-gray-500">실제로 마이크 녹음이 켜집니다.</b> 녹음된 소리는
          저장되지 않고 바로 사라져요. 마이크를 허용하지 않아도 수동 압박 모드로 계속할 수 있어요.
        </p>
      </div>

      <p className="text-xs text-gray-400 text-center">
        기본 모음 6개 + 자음 8개{custom.length > 0 ? ` + 나의 단어 ${custom.length}개` : ''} 로 시작해요.
      </p>

      <button
        onClick={() => onStart(custom, countdown)}
        className="w-full rounded-xl py-3.5 text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 transition-colors"
      >
        시작하기
      </button>
    </div>
  );
}

// ── 카드 진행: 4단계 ──────────────────────────────────────
function CardRunner({
  card, cardIndex, total, step, response, situation, geminiFailed,
  mic, onFear, onAssess, onBack,
}: {
  card: SoundCard;
  cardIndex: number;
  total: number;
  step: number;
  response: SoundResponse;
  situation?: SituationAssignment;
  geminiFailed: boolean;
  mic: MicPressure;
  onFear: (n: number) => void;
  onAssess: (stepId: SoundStepId, value: Assessment) => void;
  onBack: () => void;
}) {
  const stepDef = SOUND_STEPS[step];
  const progress = Math.round(((cardIndex + 1) / total) * 100);

  return (
    <div>
      {/* 진행 표시 */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-gray-500">소리 {cardIndex + 1} / {total}</span>
          <span className="text-xs text-gray-400">{KIND_LABEL[card.kind]}</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-teal-400 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* 4단계 스테퍼 */}
      <div className="flex items-center justify-between mb-5 px-1">
        {SOUND_STEPS.map((s, i) => {
          const state = i < step ? 'done' : i === step ? 'active' : 'todo';
          return (
            <div key={s.id} className="flex items-center gap-1.5">
              <div className="text-center">
                <div className={[
                  'mx-auto w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center mb-1 transition-colors',
                  state === 'active' ? 'bg-teal-500 text-white'
                    : state === 'done' ? 'bg-teal-100 text-teal-600'
                    : 'bg-gray-100 text-gray-400',
                ].join(' ')}>
                  {i}
                </div>
                <span className={`text-[10px] ${state === 'active' ? 'text-teal-600 font-medium' : 'text-gray-400'}`}>
                  {s.short}
                </span>
              </div>
              {i < SOUND_STEPS.length - 1 && <div className="w-3 h-px bg-gray-200 mb-4" />}
            </div>
          );
        })}
      </div>

      {/* 소리 카드 — 4단계에서는 문장이 주인공이라 작게 줄인다 */}
      <div className={[
        'bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] text-center mb-5',
        stepDef.id === 'situation' ? 'px-6 py-5' : 'px-6 py-10',
      ].join(' ')}>
        <p className="text-xs font-medium text-teal-500 mb-3">{stepDef.title}</p>
        <p className={[
          'font-bold text-gray-800 tracking-tight break-keep',
          stepDef.id === 'situation' ? 'text-3xl' : 'text-6xl',
        ].join(' ')}>
          {card.text}
        </p>
      </div>

      {/* 단계별 입력 */}
      {stepDef.id === 'fear' ? (
        <FearInput prompt={stepDef.prompt} value={response.fear} onSelect={onFear} />
      ) : stepDef.id === 'situation' ? (
        // 생성이 끝나기를 기다리지 않는다. 템플릿 문장이 이미 들어가 있고,
        // AI 문장이 도착하면 아직 답하지 않은 카드부터 조용히 갈아끼운다.
        situation ? (
          <>
            {geminiFailed && (
              <p className="text-[11px] text-gray-400 mb-2 px-1">
                AI 문장 생성에 실패해서 기본 문장으로 진행해요.
              </p>
            )}
            <SituationStep
              assignment={situation}
              selected={response.situation}
              onSelect={v => onAssess('situation', v)}
            />
          </>
        ) : (
          // 배정이 없는 예외 상황 — 단계를 막지 않고 건너뛸 수 있게 한다.
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4 text-center">
            <p className="text-sm text-gray-500 mb-3">이 소리는 상황 문장을 만들지 못했어요.</p>
            <button
              onClick={() => onAssess('situation', UNKNOWN_ASSESSMENT.value)}
              className="rounded-xl px-4 py-2.5 text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              건너뛰기
            </button>
          </div>
        )
      ) : (
        <SpeakInput
          prompt={stepDef.prompt}
          recording={stepDef.id === 'recording'}
          mic={mic}
          selected={response[stepDef.id]}
          onSelect={v => onAssess(stepDef.id, v)}
        />
      )}

      {/* 이전 */}
      <div className="flex justify-start mt-4">
        <button
          onClick={onBack}
          disabled={cardIndex === 0 && step === 0}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors py-2"
        >
          <ChevronLeft size={14} /> 이전
        </button>
      </div>
    </div>
  );
}

function FearInput({ prompt, value, onSelect }: { prompt: string; value?: number; onSelect: (n: number) => void }) {
  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
      <p className="text-sm text-gray-600 text-center mb-3">{prompt}</p>
      <div className="flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => onSelect(n)}
            className={[
              'w-12 h-12 rounded-2xl text-base font-bold transition-all',
              value === n ? 'bg-teal-500 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
            ].join(' ')}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between mt-2 px-1">
        <span className="text-[10px] text-gray-400">전혀 안 어려움</span>
        <span className="text-[10px] text-gray-400">매우 어려움</span>
      </div>
    </div>
  );
}

function SpeakInput({
  prompt, recording, mic, selected, onSelect,
}: {
  prompt: string;
  recording: boolean;
  mic: MicPressure;
  selected?: Assessment;
  onSelect: (v: Assessment) => void;
}) {
  return (
    <div className="space-y-3">
      {recording && (
        <RecordingPressurePanel
          state={mic.state}
          elapsedSec={mic.elapsedSec}
          countdownValue={mic.countdownValue}
          analyserRef={mic.analyserRef}
          onStart={mic.start}
        />
      )}

      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
        <p className="text-sm text-gray-600 text-center mb-3">{prompt}</p>
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

        {/* 몸 감각은 원래 불확실하다 — 억지로 고르게 하지 않는다. */}
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
    </div>
  );
}

// 완료 화면 — 결과를 계산하고, 완주한 경우에만 저장한 뒤 지도를 보여준다.
function DoneScreen({
  cards, responses, onClose,
}: {
  cards: SoundCard[];
  responses: Record<string, SoundResponse>;
  onClose: () => void;
}) {
  const [result, setResult] = useState<SoundMapResult | null>(null);
  const [unsaved, setUnsaved] = useState(false);
  const ranRef = useRef(false);   // StrictMode 이중 실행으로 두 번 저장되지 않게

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    // 상황(4단계) 응답은 responses 안에 이미 들어 있다 — 별도 인자가 필요 없다.
    const computed = computeSoundMapResult(cards, responses);
    const stamp = () => ({ ...computed, id: 'unsaved', createdAt: new Date().toISOString() });

    // 중간에 빠져나온 기록은 저장하지 않는다 (화면에서만 보여줌).
    if (!isSoundMapComplete(cards, responses)) {
      setResult(stamp());
      setUnsaved(true);
      return;
    }

    // 언마운트 플래그(alive)를 두면 안 된다: StrictMode 는 effect 를 실행 → 정리 → 재실행하는데,
    // 재실행은 ranRef 때문에 바로 빠져나가므로 첫 저장의 then 만 남는다.
    // 그때 alive 가 이미 false 면 setResult 가 영영 호출되지 않아 "만드는 중..." 에서 멈춘다.
    // 중복 저장은 ranRef 가 막고 있고, React 18 에서 언마운트 후 setState 는 조용한 no-op 이다.
    saveSoundMapResult(computed)
      .then(setResult)
      .catch(() => {
        // 저장에 실패해도 방금 만든 지도는 반드시 보여준다.
        setResult(stamp());
        setUnsaved(true);
      });
  }, [cards, responses]);

  if (!result) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-400 text-sm">지도를 만드는 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center pt-2 pb-1">
        <p className="text-3xl mb-2">🗺️</p>
        <h2 className="text-lg font-bold text-gray-800">소리 지도가 완성됐어요!</h2>
        {unsaved && (
          <p className="text-xs text-amber-600 mt-2">
            이번 기록은 저장되지 않았어요. 화면을 닫으면 사라집니다.
          </p>
        )}
      </div>

      <SoundMapResultView result={result} />

      <button
        onClick={onClose}
        className="w-full rounded-xl py-3.5 text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 transition-colors"
      >
        완료
      </button>
    </div>
  );
}
