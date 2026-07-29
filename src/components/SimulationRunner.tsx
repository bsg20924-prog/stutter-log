// Stage 4 · 상황 시뮬레이션 진행 화면.
//
// iOS Safari 대응이 이 컴포넌트의 흐름을 결정한다.
// speechSynthesis 와 AudioContext 는 **사용자 터치 핸들러 안에서 동기적으로** 시작해야 하므로,
// 「시작」 버튼 핸들러가 primeAudio() → speakPrompt() 를 곧바로 호출하고,
// 그 뒤 3-2-1 카운트다운과 응답 창은 콜백 체인으로 이어진다.
// 중간에 await 를 끼우면 제스처 컨텍스트가 끊겨 iOS 에서 소리가 조용히 사라진다.

import { useState, useEffect, useRef, useCallback, useMemo, KeyboardEvent } from 'react';
import { MessageSquare, Volume2, VolumeX, Play, ChevronRight, Plus, X } from 'lucide-react';
import {
  SimScenario, SimSentence, AMBIENT_META, RESPONSE_WINDOW_SEC, buildScenarios,
} from '../data/simulation';
import { Assessment, ASSESSMENTS, UNKNOWN_ASSESSMENT } from '../data/soundMap';
import { SimSentenceResponse } from '../utils/simulationResult';
import {
  primeAudio, speakPrompt, cancelSpeech, warmUpVoices, hasKoreanVoice,
  SpeakHandle, SpeechOutcome,
} from '../utils/speech';

// 프롬프트 재생 → 카운트다운 → 응답 창 → 자가 평가
type Phase = 'ready' | 'prompt' | 'countdown' | 'respond' | 'assess';

const COUNTDOWN_FROM = 3;
const COUNTDOWN_INTERVAL = 800;   // ms — 소리 지도 3단계와 같은 박자

export default function SimulationRunner({
  challengeWords, onFinish, onSkip,
}: {
  challengeWords: string[];
  onFinish: (scenarios: SimScenario[], responses: Record<string, SimSentenceResponse>) => void;
  onSkip: () => void;
}) {
  const [scenarios, setScenarios] = useState<SimScenario[] | null>(null);
  const [responses, setResponses] = useState<Record<string, SimSentenceResponse>>({});

  if (!scenarios) {
    return (
      <SimulationIntro
        challengeWords={challengeWords}
        onStart={setScenarios}
        onSkip={onSkip}
      />
    );
  }

  return (
    <ScenarioPlayer
      scenarios={scenarios}
      responses={responses}
      onRespond={(id, r) => setResponses(prev => ({ ...prev, [id]: r }))}
      onFinish={() => onFinish(scenarios, responses)}
    />
  );
}

// ── 인트로: 무엇을 하는지 + 직접 문장 추가 ─────────────────────
function SimulationIntro({
  challengeWords, onStart, onSkip,
}: {
  challengeWords: string[];
  onStart: (scenarios: SimScenario[]) => void;
  onSkip: () => void;
}) {
  const [custom, setCustom] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [koVoice, setKoVoice] = useState(hasKoreanVoice());
  // 자동 생성 문장 중 사용자가 뺀 것.
  // 도전 단어가 이름이면 '김민수 포장해 주세요' 같은 문장이 나오는데,
  // 그 단어가 이름인지 메뉴인지는 사용자만 안다 — 자동으로는 절대 못 가른다.
  // 어색한 문장을 그대로 말하게 하면 웃어버려서 상황 압박이 사라지고 데이터가 망가진다.
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  // 목소리 목록은 비동기로 채워진다 — 미리 데워 두고 준비되면 안내 문구를 바꾼다.
  useEffect(() => warmUpVoices(() => setKoVoice(hasKoreanVoice())), []);

  const preview = useMemo(
    () => buildScenarios(challengeWords, custom),
    [challengeWords, custom],
  );

  // 실제로 진행할 시나리오 — 뺀 문장을 제거하고, 문장이 하나도 없는 상황은 통째로 뺀다.
  const finalScenarios = useMemo(
    () => preview
      .map(s => ({
        ...s,
        responseSentences: s.responseSentences.filter(x => !removed.has(x.id)),
      }))
      .filter(s => s.responseSentences.length > 0),
    [preview, removed],
  );

  const sentenceCount = finalScenarios.reduce((n, s) => n + s.responseSentences.length, 0);

  function toggleRemoved(id: string) {
    setRemoved(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addSentence(raw: string) {
    const s = raw.trim();
    if (!s || custom.includes(s)) return;
    setCustom(prev => [...prev, s]);
    setInput('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      addSentence(input);
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-center pt-2 pb-1">
        <p className="text-3xl mb-2">🎭</p>
        <h2 className="text-lg font-bold text-gray-800">상황 시뮬레이션</h2>
        <p className="text-xs text-gray-400 mt-2 leading-relaxed">
          상대의 말이 먼저 들리고, 그에 맞는 <b>문장</b>으로 답해요.<br />
          소리 하나가 아니라 실제 상황에서 어떤지 확인하는 단계예요.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
        <p className="text-sm font-semibold text-gray-700 mb-2">이렇게 진행돼요</p>
        <ol className="space-y-1.5">
          {[
            '상대의 말이 재생돼요 ("주문 도와드릴까요?")',
            '3-2-1 카운트다운',
            '화면의 문장을 실제로 소리 내어 말하기',
            '방금 어땠는지 고르기',
          ].map((t, i) => (
            <li key={i} className="flex gap-2 text-xs text-gray-600 leading-relaxed">
              <span className="shrink-0 w-4 h-4 rounded-full bg-teal-50 text-teal-600 text-[10px] font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ol>

        <p className="flex items-start gap-1.5 text-[11px] text-gray-400 mt-3 leading-relaxed border-t border-gray-100 pt-3">
          {koVoice ? <Volume2 size={13} className="shrink-0 mt-0.5" /> : <VolumeX size={13} className="shrink-0 mt-0.5" />}
          <span>
            {koVoice
              ? '한국어 음성으로 상대의 말이 재생돼요. 소리를 켜 주세요.'
              : '이 기기에는 한국어 음성이 없어서, 상대의 말은 말풍선과 짧은 알림음으로 표시돼요.'}
          </span>
        </p>
      </div>

      {/* 말할 문장 — 자동 생성분을 미리 보여주고 어색한 건 빼게 한다 */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
        <p className="text-sm font-semibold text-gray-700 mb-1">말할 문장</p>
        <p className="text-xs text-gray-400 mb-3">
          {challengeWords.length > 0
            ? `도전 단어 ${challengeWords.length}개로 만들었어요. 어색한 문장은 빼 주세요.`
            : '아직 도전 단어가 없어서 기본 문장으로 만들었어요.'}
        </p>

        <div className="space-y-3">
          {preview.map(s => (
            <div key={s.id}>
              <p className="text-[11px] font-medium text-gray-400 mb-1.5">{s.label}</p>
              <div className="space-y-1">
                {s.responseSentences.map(x => {
                  const off = removed.has(x.id);
                  return (
                    <div
                      key={x.id}
                      className={[
                        'flex items-center gap-1 rounded-lg pl-2.5 pr-1.5 py-1.5 transition-colors',
                        off ? 'bg-gray-50' : 'bg-gray-100',
                      ].join(' ')}
                    >
                      <span className={[
                        'flex-1 min-w-0 text-xs break-keep',
                        off ? 'text-gray-300 line-through' : 'text-gray-700',
                      ].join(' ')}>
                        {x.text}
                      </span>
                      <button
                        onClick={() => toggleRemoved(x.id)}
                        className="shrink-0 text-gray-400 hover:text-teal-600 px-1"
                        aria-label={off ? '다시 넣기' : '이 문장 빼기'}
                      >
                        {off ? <Plus size={13} /> : <X size={13} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 mt-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="직접 문장 추가 (예: 안녕하세요, 김민수입니다)"
            className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
          />
          <button
            onClick={() => addSentence(input)}
            disabled={!input.trim()}
            className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-teal-500 text-white disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
            aria-label="문장 추가"
          >
            <Plus size={15} />
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
          이름처럼 문장 틀에 안 맞는 단어는 직접 문장으로 넣어 주세요.
        </p>
      </div>

      <button
        onClick={() => onStart(finalScenarios)}
        disabled={sentenceCount === 0}
        className="w-full rounded-xl py-3.5 text-sm font-semibold bg-teal-500 text-white disabled:bg-gray-200 disabled:text-gray-400 hover:bg-teal-600 transition-colors"
      >
        {sentenceCount > 0 ? `상황 시뮬레이션 시작 (${sentenceCount}문장)` : '문장을 하나 이상 남겨 주세요'}
      </button>
      <button
        onClick={onSkip}
        className="w-full rounded-xl py-3 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
      >
        건너뛰고 결과 보기
      </button>
      <p className="text-[11px] text-gray-400 text-center leading-relaxed">
        건너뛰어도 소리 지도는 정상적으로 완성돼요.
      </p>
    </div>
  );
}

// ── 시나리오 진행 ────────────────────────────────────────────
function ScenarioPlayer({
  scenarios, responses, onRespond, onFinish,
}: {
  scenarios: SimScenario[];
  responses: Record<string, SimSentenceResponse>;
  onRespond: (sentenceId: string, r: SimSentenceResponse) => void;
  onFinish: () => void;
}) {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [sentenceIdx, setSentenceIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('ready');
  const [countdown, setCountdown] = useState(COUNTDOWN_FROM);
  const [outcome, setOutcome] = useState<SpeechOutcome | null>(null);
  const [respondLeft, setRespondLeft] = useState(RESPONSE_WINDOW_SEC);

  const speakRef = useRef<SpeakHandle | null>(null);
  const timerRef = useRef<number | null>(null);
  // 늦게 도착한 콜백이 이미 넘어간 문장의 상태를 건드리지 않게 하는 세대 카운터.
  const genRef = useRef(0);

  const scenario = scenarios[scenarioIdx];
  const sentence: SimSentence | undefined = scenario?.responseSentences[sentenceIdx];

  const totalSentences = scenarios.reduce((n, s) => n + s.responseSentences.length, 0);
  const doneCount = scenarios
    .slice(0, scenarioIdx)
    .reduce((n, s) => n + s.responseSentences.length, 0) + sentenceIdx;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 화면을 벗어나면 남은 발화와 타이머를 반드시 정리한다.
  useEffect(() => () => {
    genRef.current += 1;
    speakRef.current?.cancel();
    cancelSpeech();
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
  }, []);

  // 문장이 바뀌면 항상 '시작 전' 으로 되돌린다.
  useEffect(() => {
    genRef.current += 1;
    clearTimer();
    cancelSpeech();
    setPhase('ready');
    setOutcome(null);
    setCountdown(COUNTDOWN_FROM);
    setRespondLeft(RESPONSE_WINDOW_SEC);
  }, [scenarioIdx, sentenceIdx, clearTimer]);

  const startResponseWindow = useCallback((gen: number) => {
    if (genRef.current !== gen) return;
    setPhase('respond');
    let left = RESPONSE_WINDOW_SEC;
    setRespondLeft(left);
    clearTimer();
    timerRef.current = window.setInterval(() => {
      if (genRef.current !== gen) return;
      left -= 1;
      setRespondLeft(left);
      if (left <= 0) {
        clearTimer();
        setPhase('assess');
      }
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
      if (n <= 0) {
        clearTimer();
        startResponseWindow(gen);
      } else {
        setCountdown(n);
      }
    }, COUNTDOWN_INTERVAL);
  }, [clearTimer, startResponseWindow]);

  /**
   * ⚠️ 반드시 버튼 onClick 에서 직접 호출된다.
   * primeAudio 와 speakPrompt 사이에 await 를 넣으면 iOS 에서 소리가 나지 않는다.
   */
  function handleStart() {
    if (!sentence) return;
    genRef.current += 1;
    const gen = genRef.current;

    primeAudio();                 // (1) 제스처 안에서 오디오 잠금 해제
    setPhase('prompt');
    setOutcome(null);

    speakRef.current = speakPrompt(scenario.ttsPrompt, result => {   // (2) 곧바로 발화
      if (genRef.current !== gen) return;
      setOutcome(result);
      startCountdown(gen);        // (3) 재생이 끝나면 즉시 3-2-1
    });
  }

  function goNext() {
    if (sentenceIdx < scenario.responseSentences.length - 1) {
      setSentenceIdx(sentenceIdx + 1);
    } else if (scenarioIdx < scenarios.length - 1) {
      setScenarioIdx(scenarioIdx + 1);
      setSentenceIdx(0);
    } else {
      onFinish();
    }
  }

  function handleAssess(value: Assessment) {
    if (!sentence) return;
    onRespond(sentence.id, { assessment: value, ttsOutcome: outcome ?? undefined });
    goNext();
  }

  /**
   * 건너뛰기는 아무것도 기록하지 않고 넘어간다.
   * '모르겠음'으로 남기면 안 된다 — 그건 "말은 했는데 판단이 안 됐다"는 뜻이라,
   * 아예 말하지 않은 문장을 거기에 섞으면 인식 공백 지표가 오염된다.
   */
  function handleSkip() {
    genRef.current += 1;
    clearTimer();
    cancelSpeech();
    goNext();
  }

  if (!scenario || !sentence) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-gray-400 mb-4">진행할 문장이 없어요.</p>
        <button onClick={onFinish} className="text-sm font-semibold text-teal-600">결과 보기</button>
      </div>
    );
  }

  const ambient = scenario.ambientKey ? AMBIENT_META[scenario.ambientKey] : null;
  const answered = responses[sentence.id];

  return (
    <div>
      {/* 진행 */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-gray-500">
            문장 {doneCount + 1} / {totalSentences}
          </span>
          <span className="text-xs text-gray-400">
            상황 {scenarioIdx + 1} / {scenarios.length}
          </span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-400 rounded-full transition-all duration-300"
            style={{ width: `${((doneCount + 1) / totalSentences) * 100}%` }}
          />
        </div>
      </div>

      {/* 상황 헤더 */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="text-sm font-semibold text-gray-800">{scenario.label}</span>
        {ambient && (
          <span className="text-[11px] text-gray-400">
            {ambient.emoji} {ambient.label}
          </span>
        )}
      </div>

      {/* 상대의 말 — 말풍선. TTS 가 안 되는 기기에서는 이게 유일한 전달 수단이다. */}
      <div className="mb-3">
        <div className="inline-flex items-start gap-2 max-w-full bg-white rounded-2xl rounded-tl-sm shadow-[0_8px_30px_rgb(0,0,0,0.05)] px-4 py-3">
          <MessageSquare size={15} className="shrink-0 text-gray-300 mt-0.5" />
          <p className="text-sm text-gray-700 break-keep">{scenario.ttsPrompt}</p>
        </div>
        {phase === 'prompt' && (
          <p className="text-[11px] text-teal-500 mt-1.5 px-1">
            {outcome === 'fallback' ? '알림음으로 안내했어요' : '재생 중...'}
          </p>
        )}
      </div>

      {/* 말할 문장 */}
      <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] px-6 py-8 text-center mb-4">
        <p className="text-xs font-medium text-teal-500 mb-3">이렇게 답해 보세요</p>
        <p className="text-2xl font-bold text-gray-800 leading-snug break-keep">{sentence.text}</p>
        {sentence.sourceWords.length > 0 && (
          <p className="text-[11px] text-gray-400 mt-3">
            도전 단어: {sentence.sourceWords.join(', ')}
          </p>
        )}
      </div>

      {/* 단계별 화면 */}
      {phase === 'ready' && (
        <button
          onClick={handleStart}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 transition-colors"
        >
          <Play size={16} />
          시작
        </button>
      )}

      {phase === 'prompt' && (
        <div className="rounded-2xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] py-8 text-center">
          <p className="text-sm text-gray-500">상대의 말을 듣는 중...</p>
        </div>
      )}

      {phase === 'countdown' && (
        <div className="rounded-2xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] py-8 text-center">
          <p className="text-5xl font-bold text-teal-500 tabular-nums">{countdown}</p>
          <p className="text-xs text-gray-400 mt-2">곧 말할 차례예요</p>
        </div>
      )}

      {phase === 'respond' && (
        <div className="rounded-2xl bg-teal-50 border border-teal-200 py-8 text-center">
          <p className="text-sm font-semibold text-teal-800">지금 말하세요</p>
          <p className="text-4xl font-bold text-teal-600 tabular-nums mt-2">{Math.max(0, respondLeft)}</p>
          <button
            onClick={() => { clearTimer(); setPhase('assess'); }}
            className="mt-3 text-xs font-medium text-teal-700 underline underline-offset-2"
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
                onClick={() => handleAssess(a.value)}
                className={[
                  'rounded-xl py-3 text-sm font-semibold border-2 transition-all active:scale-[0.98]',
                  answered?.assessment === a.value
                    ? a.activeCls
                    : `bg-white border-gray-200 ${a.cls} hover:border-current`,
                ].join(' ')}
              >
                {a.label}
              </button>
            ))}
          </div>

          {/* 몸 감각은 원래 불확실하다 — 억지로 고르게 하지 않는다. */}
          <button
            onClick={() => handleAssess(UNKNOWN_ASSESSMENT.value)}
            className={[
              'w-full mt-2 rounded-xl py-2.5 text-xs font-medium border-2 transition-all active:scale-[0.98]',
              answered?.assessment === UNKNOWN_ASSESSMENT.value
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

      {/* 다시 듣기 / 건너뛰기 */}
      {(phase === 'ready' || phase === 'assess') && (
        <div className="flex justify-between mt-4">
          <button
            onClick={handleStart}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors py-2"
          >
            <Volume2 size={14} /> 다시 듣기
          </button>
          <button
            onClick={handleSkip}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors py-2"
          >
            이 문장 건너뛰기 <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
