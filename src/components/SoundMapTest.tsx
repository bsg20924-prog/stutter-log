import { useState, KeyboardEvent } from 'react';
import { X, ChevronLeft, Mic, Plus, Map as MapIcon } from 'lucide-react';
import {
  SoundCard, SoundResponse, Assessment, SoundStepId,
  SOUND_STEPS, ASSESSMENTS, KIND_LABEL,
  buildDefaultCards, makeCustomCard, SUGGESTED_CUSTOM_WORDS,
} from '../data/soundMap';

type Stage = 'intro' | 'card' | 'done';

export default function SoundMapTest({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState<Stage>('intro');
  const [cards, setCards] = useState<SoundCard[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [step, setStep] = useState(0); // 0~3
  const [responses, setResponses] = useState<Record<string, SoundResponse>>({});
  const [confirmExit, setConfirmExit] = useState(false);

  const card = cards[cardIndex];

  function start(customWords: string[]) {
    const custom = customWords.map((w, i) => makeCustomCard(w, i + 1));
    setCards([...buildDefaultCards(), ...custom]);
    setCardIndex(0);
    setStep(0);
    setResponses({});
    setStage('card');
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
    setResponses(prev => ({ ...prev, [card.id]: { ...prev[card.id], [stepId]: value } }));
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
          {stage === 'intro' && <IntroScreen onStart={start} />}

          {stage === 'card' && card && (
            <CardRunner
              card={card}
              cardIndex={cardIndex}
              total={cards.length}
              step={step}
              response={responses[card.id] ?? {}}
              onFear={setFear}
              onAssess={setAssessment}
              onBack={back}
            />
          )}

          {stage === 'done' && (
            <DoneScreen cardCount={cards.length} onClose={onClose} />
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
function IntroScreen({ onStart }: { onStart: (customWords: string[]) => void }) {
  const [custom, setCustom] = useState<string[]>([]);
  const [input, setInput] = useState('');

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

  const remainingSuggestions = SUGGESTED_CUSTOM_WORDS.filter(w => !custom.includes(w));

  return (
    <div className="space-y-4">
      <div className="text-center pt-2 pb-1">
        <p className="text-3xl mb-2">🗺️</p>
        <h2 className="text-lg font-bold text-gray-800">소리 지도 만들기</h2>
        <p className="text-xs text-gray-400 mt-2 leading-relaxed">
          같은 소리를 <b>속삭임 → 목소리 → 녹음 압박</b> 3단계로 말하며<br />
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
        <p className="text-xs text-gray-400 mb-3">이름, 자주 막히는 단어를 넣으면 지도에 함께 담아요.</p>

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

      <p className="text-xs text-gray-400 text-center">
        기본 모음 6개 + 자음 8개{custom.length > 0 ? ` + 나의 단어 ${custom.length}개` : ''} 로 시작해요.
      </p>

      <button
        onClick={() => onStart(custom)}
        className="w-full rounded-xl py-3.5 text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 transition-colors"
      >
        시작하기
      </button>
    </div>
  );
}

// ── 카드 진행: 4단계 ──────────────────────────────────────
function CardRunner({
  card, cardIndex, total, step, response, onFear, onAssess, onBack,
}: {
  card: SoundCard;
  cardIndex: number;
  total: number;
  step: number;
  response: SoundResponse;
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

      {/* 소리 카드 */}
      <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] px-6 py-10 text-center mb-5">
        <p className="text-xs font-medium text-teal-500 mb-3">{stepDef.title}</p>
        <p className="text-6xl font-bold text-gray-800 tracking-tight break-keep">{card.text}</p>
      </div>

      {/* 단계별 입력 */}
      {stepDef.id === 'fear' ? (
        <FearInput prompt={stepDef.prompt} value={response.fear} onSelect={onFear} />
      ) : (
        <SpeakInput
          prompt={stepDef.prompt}
          recording={stepDef.id === 'recording'}
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
  prompt, recording, selected, onSelect,
}: {
  prompt: string;
  recording: boolean;
  selected?: Assessment;
  onSelect: (v: Assessment) => void;
}) {
  return (
    <div className="space-y-3">
      {/* 녹음 압박 플레이스홀더 (실제 녹음 로직은 이후 파트) */}
      {recording && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-5 flex flex-col items-center">
          <div className="relative flex items-center justify-center mb-2">
            <span className="absolute w-12 h-12 rounded-full bg-red-200 animate-ping opacity-60" />
            <span className="relative flex items-center justify-center w-11 h-11 rounded-full bg-red-500 text-white">
              <Mic size={20} />
            </span>
          </div>
          <p className="text-xs font-semibold text-red-600">녹음 압박 모드</p>
          <p className="text-[11px] text-gray-400 mt-0.5">준비 중 · 실제 녹음은 곧 추가됩니다</p>
        </div>
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
      </div>
    </div>
  );
}

function DoneScreen({ cardCount, onClose }: { cardCount: number; onClose: () => void }) {
  return (
    <div className="space-y-4 text-center pt-6">
      <p className="text-3xl">🗺️</p>
      <h2 className="text-lg font-bold text-gray-800">소리 지도가 완성됐어요!</h2>
      <p className="text-sm text-gray-500 leading-relaxed">
        {cardCount}개의 소리를 3단계로 기록했어요.<br />
        압력 단계별 분석 결과는 곧 추가됩니다.
      </p>
      <button
        onClick={onClose}
        className="w-full rounded-xl py-3.5 text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 transition-colors"
      >
        완료
      </button>
    </div>
  );
}
