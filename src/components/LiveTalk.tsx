// 살아있는 대화 (전체 화면) — 상대가 내 말을 받아 다음 말을 만든다.
//
// 사다리(속삭임 → 목소리 → 녹음 → 상황) 위에 얹히는 칸이다.
// 4단계까지는 "무슨 말을 할지 화면에 적혀 있다". 여기서는 적혀 있지 않고,
// 다음에 무슨 질문이 올지도 모른다 — 실전과 사다리 사이의 빈칸이 그것이다.
//
// ⚠️ 여기서 나온 결과는 소리 지도 채점에 넣지 않는다.
// 자유 발화에서는 "검사 단어가 문장 맨 앞" 이라는 측정 조건을 지킬 수 없다.
// 이 화면의 목적은 측정이 아니라 노출/둔감화다.
//
// 흐름: 상대 발화 → 내 차례 → (인식 결과를 넘겨) 상대 발화 → ... → 마무리
//
// iOS 제약이 두 군데를 결정한다:
//  1. 「시작」 핸들러 안에서 primeAudio() 를 동기 호출해 오디오 잠금을 푼다.
//  2. 이후 상대 발화는 Gemini 응답을 await 한 뒤라 제스처 밖이다 —
//     speech.ts 의 공용 잠금해제 엘리먼트가 그걸 가능하게 한다.

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, MessagesSquare, Play, Mic, MicOff, Volume2, ChevronRight, Loader2, Download,
} from 'lucide-react';
import {
  LIVE_SCENARIOS, LiveScenario, Turn, NextTurn, UNHEARD, ANSWERED, selectLine, openerFor,
} from '../utils/liveConversation';
import { AMBIENT_META } from '../data/simulation';
import { primeAudio, speakPrompt, cancelSpeech, SpeakHandle } from '../utils/speech';
import { generateTts, prefetchTts } from '../utils/geminiTts';
import { getGeminiKey, hasGeminiKey } from '../utils/gemini';
import {
  useSpeechRecognition, isSpeechRecognitionSupported,
} from '../hooks/useSpeechRecognition';
import { checkAmbientAvailable, createAmbientPlayer, AmbientPlayer } from '../utils/ambient';
import { countPrepared, prepareAllVoices, PrepareProgress } from '../utils/ttsPrepare';

/**
 * 내 차례의 길이. 상황 시뮬레이션(8초)보다 길게 잡는다 —
 * 막힘은 '말을 시작하기 전 침묵'으로 나타나므로 8초는 막힌 사람을 잘라 버린다.
 */
const MY_TURN_SEC = 15;

/**
 * 상대의 음성을 기다리는 상한.
 *
 * ⚠️ 실측값이 직관을 두 번 배신한 자리다.
 * 처음 2.5초 → 매번 초과 → 7초로 올림 → 그래도 매번 초과.
 * 실제로 재보니 TTS 생성이 5~15초, 문장 생성까지 더하면 턴당 최대 19초였다.
 * 그래서 내 차례(15초) 동안 미리 만들어도 못 덮는 경우가 있다.
 *
 * 지금은 **음성을 확실히 듣는 쪽**에 걸어 둔다 — 결국 브라우저 음성이 나올 거면
 * 기다린 시간이 통째로 낭비이기 때문이다. 대가는 턴 사이의 공백이다.
 * 이 공백이 견딜 만한지가 이 기능의 존폐를 가르며, 아니라면 대사 풀을 미리
 * 만들어두고 AI 는 고르기만 하는 구조로 바꿔야 한다.
 */
const TTS_WAIT_MS = 25000;

type Phase = 'intro' | 'thinking' | 'them' | 'me' | 'done';

/** 화면에 그릴 대화 한 줄. 모델에 넘기는 텍스트와 화면 표시는 다를 수 있다. */
interface UiTurn {
  who: 'them' | 'me';
  /** 모델에게 넘기는 텍스트 */
  text: string;
  /** 내 말을 못 알아들은 턴 — 화면에는 판정처럼 보이지 않게 표시한다 */
  unheard?: boolean;
}

export default function LiveTalk({ onClose }: { onClose: () => void }) {
  const [scenario, setScenario] = useState<LiveScenario | null>(null);
  const [sttOn, setSttOn] = useState(isSpeechRecognitionSupported());
  const [ambientOn, setAmbientOn] = useState(false);

  if (!scenario) {
    return (
      <Shell onClose={onClose} title="살아있는 대화">
        <Intro
          sttOn={sttOn}
          onSttChange={setSttOn}
          ambientOn={ambientOn}
          onAmbientChange={setAmbientOn}
          onPick={setScenario}
        />
      </Shell>
    );
  }

  return (
    <Shell onClose={onClose} title={scenario.label}>
      <Conversation
        scenario={scenario}
        sttOn={sttOn}
        ambientOn={ambientOn}
        onRestart={() => setScenario(null)}
        onClose={onClose}
      />
    </Shell>
  );
}

function Shell({
  title, children, onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-gray-50 flex flex-col h-dvh">
      <header className="shrink-0 flex items-center gap-2 px-4 h-14 bg-white shadow-sm">
        <MessagesSquare size={18} className="text-teal-500" />
        <h1 className="font-bold text-base text-gray-800">{title}</h1>
        <button
          onClick={onClose}
          className="ml-auto flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="종료"
        >
          <X size={20} />
        </button>
      </header>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-5">{children}</div>
      </main>
    </div>
  );
}

// ── 인트로: 무엇을 하는지 + 상황 고르기 ───────────────────────
function Intro({
  sttOn, onSttChange, ambientOn, onAmbientChange, onPick,
}: {
  sttOn: boolean;
  onSttChange: (v: boolean) => void;
  ambientOn: boolean;
  onAmbientChange: (v: boolean) => void;
  onPick: (s: LiveScenario) => void;
}) {
  const [ambientReady, setAmbientReady] = useState(false);
  const sttSupported = isSpeechRecognitionSupported();
  const aiReady = hasGeminiKey();

  useEffect(() => {
    let alive = true;
    void Promise.all((['cafe', 'office', 'phone'] as const).map(checkAmbientAvailable))
      .then(r => { if (alive) setAmbientReady(r.some(Boolean)); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-4">
      <div className="text-center pt-2 pb-1">
        <p className="text-3xl mb-2">💬</p>
        <h2 className="text-lg font-bold text-gray-800">살아있는 대화</h2>
        <p className="text-xs text-gray-400 mt-2 leading-relaxed">
          말할 문장이 정해져 있지 않아요.<br />
          상대가 <b>내 대답을 받아서</b> 다음 말을 해요.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
        <p className="text-sm font-semibold text-gray-700 mb-2">왜 이걸 하나요</p>
        <p className="text-xs text-gray-600 leading-relaxed">
          상황 시뮬레이션의 멘트는 정해져 있어서 한 번 하면 다음에 무슨 말이 올지 알게 돼요.
          그런데 <b>다음 말을 예측할 수 없다는 것</b>이야말로 실제 상황이 주는 압박의 핵심이에요.
          여기서는 매번 다르게 흘러가요.
        </p>
        <p className="text-[11px] text-gray-400 leading-relaxed mt-3 border-t border-gray-100 pt-3">
          이건 검사가 아니라 <b>연습</b>이에요. 소리 지도 점수에는 들어가지 않아요.
        </p>
      </div>

      {/* 옵션 */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4 space-y-3">
        {sttSupported ? (
          <Toggle
            icon={<Mic size={15} className="text-gray-400" />}
            title="내 말을 알아듣게 하기"
            desc="상대가 내가 한 말에 맞춰 대답해요. 잘 안 들리면 상대가 되물어요."
            checked={sttOn}
            onChange={onSttChange}
          />
        ) : (
          <p className="flex items-start gap-1.5 text-[11px] text-gray-400 leading-relaxed">
            <MicOff size={13} className="shrink-0 mt-0.5" />
            <span>이 브라우저는 음성인식을 지원하지 않아요. 상대는 내 말을 듣지 않고 자기 순서대로 진행해요.</span>
          </p>
        )}

        {ambientReady && (
          <Toggle
            icon={<Volume2 size={15} className="text-gray-400" />}
            title="배경 소음 켜기"
            desc="카페·사무실 소리를 작게 깔아 실제에 가깝게 만들어요."
            checked={ambientOn}
            onChange={onAmbientChange}
          />
        )}
      </div>

      {!aiReady && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
          <p className="text-[11px] text-amber-800 leading-relaxed">
            AI 연결이 없어서 상대가 <b>정해진 순서</b>로 말해요. 대화는 그대로 이어지지만,
            내 대답을 받아치지는 못해요. 설정에서 키를 넣으면 훨씬 살아나요.
          </p>
        </div>
      )}

      {aiReady && <VoicePrepCard />}

      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2 px-1">어떤 상황을 연습할까요</p>
        <div className="space-y-2">
          {LIVE_SCENARIOS.map(s => (
            <button
              key={s.id}
              onClick={() => onPick(s)}
              className="w-full flex items-center gap-3 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
            >
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-gray-800">{s.label}</span>
                <span className="block text-xs text-gray-500 mt-0.5">{s.hint}</span>
                <span className="block text-[11px] text-gray-400 mt-1">
                  {s.ambientKey ? `${AMBIENT_META[s.ambientKey].emoji} ` : ''}
                  목표: {s.goal}
                </span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-gray-300" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 음성 미리 받아두기.
 *
 * 이 카드가 이 기능의 안정성을 사실상 결정한다.
 * 대화 도중에 음성을 만들면 preview 모델의 지연(5~15초)과 과부하(500)를 그대로
 * 뒤집어쓰고 브라우저 음성으로 떨어진다. 여기서 미리 받아 두면 대화 중에는
 * 네트워크를 아예 타지 않는다.
 */
function VoicePrepCard() {
  const [stat, setStat] = useState<{ ready: number; total: number } | null>(null);
  const [progress, setProgress] = useState<PrepareProgress | null>(null);
  const [stopping, setStopping] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    void countPrepared().then(s => { if (alive) setStat(s); });
    return () => {
      alive = false;
      abortRef.current?.abort();
    };
  }, []);

  const running = progress !== null;
  const ready = progress ? progress.done : stat?.ready ?? 0;
  const total = progress ? progress.total : stat?.total ?? 0;
  const allReady = total > 0 && ready >= total;

  async function run() {
    const controller = new AbortController();
    abortRef.current = controller;
    // 이미 받아둔 개수에서 이어서 센다. 0 부터 시작하면 시작하자마자
    // 숫자가 뒤로 가서 "받아둔 게 사라졌다"로 읽힌다.
    setProgress({ done: ready, total, failed: 0, active: 0, note: '확인하는 중...' });
    setStopping(false);
    await prepareAllVoices(setProgress, controller.signal);
    abortRef.current = null;
    setProgress(null);
    setStopping(false);
    setStat(await countPrepared());
  }

  /**
   * 멈추기는 **즉시 화면에 반영해야 한다.**
   * 진행 중인 요청이 끝날 때까지(최대 수십 초) 아무 반응이 없으면
   * 버튼이 고장 난 것으로 읽힌다 — 실제로 그렇게 보였다.
   */
  function stop() {
    setStopping(true);
    abortRef.current?.abort();
  }

  if (!stat) return null;

  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
        <Download size={15} className="text-gray-400" />
        상대 목소리 미리 받아두기
      </p>
      <p className="text-xs text-gray-400 mt-1 leading-relaxed">
        {allReady
          ? '다 받아뒀어요. 대화 중에는 인터넷을 쓰지 않아 목소리가 바로 나와요.'
          : '한 번만 받아두면 대화가 끊기지 않고 목소리도 바로 나와요. 몇 분 걸려요.'}
      </p>

      <div className="flex items-center gap-2 mt-3">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${allReady ? 'bg-teal-400' : 'bg-teal-300'}`}
            style={{ width: total > 0 ? `${(ready / total) * 100}%` : '0%' }}
          />
        </div>
        <span className="shrink-0 text-[11px] text-gray-400 tabular-nums">{ready} / {total}</span>
      </div>

      {/* 지금 무슨 일이 일어나는 중인지 — 아무 표시 없이 멈춰 있으면 고장으로 읽힌다 */}
      {progress && (
        <p className="flex items-center gap-1.5 text-[11px] text-gray-400 mt-2 leading-relaxed">
          {progress.active > 0 && !stopping && (
            <Loader2 size={11} className="shrink-0 animate-spin" />
          )}
          <span className="min-w-0 truncate">
            {stopping ? '멈추는 중... 받던 것만 마저 끝낼게요.' : progress.note}
          </span>
        </p>
      )}

      {/*
        할당량 소진은 '나중에 다시'로 안내하면 안 된다 — 기다린다고 풀리지 않는다.
        무엇을 확인해야 하는지까지 말해 줘야 사용자가 헤매지 않는다.
      */}
      {progress?.quotaExhausted ? (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 mt-2">
          <p className="text-[11px] font-semibold text-amber-800">
            AI 사용 한도를 다 썼어요.
          </p>
          <p className="text-[11px] text-amber-700 leading-relaxed mt-0.5">
            기다린다고 풀리지 않아요. 결제가 이 API 키의 프로젝트에 연결돼 있는지
            확인해 주세요. 한도가 갱신된 뒤에 다시 누르면 남은 것만 받아요.
          </p>
        </div>
      ) : progress && progress.failed > 0 && (
        <p className="text-[11px] text-amber-600 mt-1">
          {progress.failed}개는 서버가 바빠서 못 받았어요. 다시 누르면 그것만 받아요.
        </p>
      )}

      {!allReady && (
        <button
          onClick={() => { if (running) stop(); else void run(); }}
          disabled={stopping}
          className={[
            'w-full mt-3 rounded-xl py-2.5 text-xs font-semibold transition-colors',
            stopping
              ? 'bg-gray-100 text-gray-400'
              : running
                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                : 'bg-teal-500 text-white hover:bg-teal-600',
          ].join(' ')}
        >
          {stopping ? '멈추는 중...' : running ? '그만 받기' : '받아두기'}
        </button>
      )}
    </div>
  );
}

function Toggle({
  icon, title, desc, checked, onChange,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">{icon}{title}</p>
        <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className={[
          'relative shrink-0 w-11 h-6 rounded-full transition-colors',
          checked ? 'bg-teal-500' : 'bg-gray-200',
        ].join(' ')}
      >
        <span className={[
          'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all',
          checked ? 'left-[22px]' : 'left-0.5',
        ].join(' ')} />
      </button>
    </div>
  );
}

// ── 대화 진행 ────────────────────────────────────────────────
function Conversation({
  scenario, sttOn, ambientOn, onRestart, onClose,
}: {
  scenario: LiveScenario;
  sttOn: boolean;
  ambientOn: boolean;
  onRestart: () => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [turns, setTurns] = useState<UiTurn[]>([]);
  const [left, setLeft] = useState(MY_TURN_SEC);

  const stt = useSpeechRecognition(sttOn);
  const ambientRef = useRef<AmbientPlayer | null>(null);
  if (ambientOn && !ambientRef.current) ambientRef.current = createAmbientPlayer();

  // 첫 마디는 고정 후보에서 고른다 — 매번 같은 인사를 듣지 않도록 시나리오마다 한 번 뽑는다.
  const openerSeed = useRef(Math.floor(Math.random() * 997)).current;

  // ★ 인트로에 머무는 동안 첫 마디 음성을 미리 만들어 둔다.
  // 「시작」을 누른 직후가 가장 기다리기 싫은 순간인데, 여기서 벌어 두면 첫 마디가 즉시 나온다.
  useEffect(() => {
    const key = getGeminiKey();
    if (key) prefetchTts(openerFor(scenario, openerSeed), key, scenario.id);
  }, [scenario, openerSeed]);

  // 콜백 체인이 길어서 최신 값을 ref 로 들고 다닌다.
  const turnsRef = useRef<UiTurn[]>([]);
  const speakRef = useRef<SpeakHandle | null>(null);
  const timerRef = useRef<number | null>(null);
  const genRef = useRef(0);
  // 내 차례 동안 미리 만들어 두는 다음 대사.
  const speculativeRef = useRef<{ gen: number; promise: Promise<NextTurn> } | null>(null);
  // 연속으로 못 알아들은 횟수. 두 번째부터는 되묻지 않게 한다 —
  // "네?" 를 연달아 듣는 것은 연습이 아니라 상처다.
  const unheardStreakRef = useRef(0);
  // stt.stop 은 partial 에 의존해 매 렌더 새로 만들어진다 — 콜백에서는 ref 로 부른다.
  const sttRef = useRef(stt);
  sttRef.current = stt;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 화면을 벗어나면 발화·타이머·마이크·배경음을 반드시 정리한다.
  useEffect(() => () => {
    genRef.current += 1;
    speakRef.current?.cancel();
    cancelSpeech();
    ambientRef.current?.stop();
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
  }, []);

  const pushTurn = useCallback((t: UiTurn) => {
    turnsRef.current = [...turnsRef.current, t];
    setTurns(turnsRef.current);
  }, []);

  /** 모델에 넘길 대화 기록 — 화면 표시용 정보는 떼어낸다. */
  const modelHistory = (): Turn[] =>
    turnsRef.current.map(t => ({ who: t.who, text: t.text }));

  // 내 차례를 끝내는 유일한 경로. 시간 만료·「다 말했어요」 둘 다 여기를 지난다.
  const endMyTurnRef = useRef<() => void | Promise<void>>(() => {});
  // 내 차례를 끝내는 처리가 이미 돌고 있는지 (비동기라 중복 진입이 가능하다)
  const endingRef = useRef(false);
  // 이번 대화에서 이미 꺼낸 풀 대사 — 같은 말을 두 번 하지 않기 위해서다.
  const usedRef = useRef<Set<number>>(new Set());

  /**
   * 다음 대사를 만들고 음성 생성까지 걸어 둔다.
   * 음성은 기다리지 않는다 — 캐시에 채워두는 것이 목적이다.
   */
  const prepare = useCallback(async (history: Turn[]): Promise<NextTurn> => {
    const next = await selectLine(scenario, history, usedRef.current, openerSeed);
    // 고른 것은 즉시 사용 완료로 표시한다 — 안 그러면 같은 말을 두 번 하게 된다.
    if (next.poolIndex !== undefined) usedRef.current.add(next.poolIndex);
    // 음성은 대개 미리받기로 이미 보관돼 있어 이 호출이 즉시 끝난다.
    const key = getGeminiKey();
    if (key) prefetchTts(next.line, key, scenario.id);
    return next;
  }, [scenario, openerSeed]);

  const startMyTurn = useCallback((gen: number) => {
    if (genRef.current !== gen) return;
    setPhase('me');
    ambientRef.current?.unduck();
    sttRef.current.start();

    // ★ 내가 말하는 동안 다음 대사와 음성을 미리 만든다.
    //
    // 실측: 문장 생성 4초 + 음성 생성 5~15초 = 턴당 9~19초가 직렬로 든다.
    // 사용자가 말을 마친 뒤에 시작하면 그 시간이 통째로 정적이 되고,
    // 기다리지 않으면 브라우저 음성으로 떨어진다 — 어떤 타임아웃 값으로도 못 푼다.
    // 내 차례 15초를 생성 시간으로 쓰면 둘 다 피한다.
    //
    // 대가: 지금 하는 답변의 '내용'은 아직 모르므로 상대가 그걸 인용하지 못한다.
    // 대신 그 자리에 ANSWERED 를 넣어 "답은 했다"는 사실만 알린다.
    // 지난 답변들은 그대로 들어가므로 대화 맥락 자체는 이어진다.
    // 정형 대화(카페·계산대·전화)는 원래 순서가 정해져 있어 티가 나지 않고,
    // 면접·친구도 되묻는 후속 질문은 답 내용 없이 성립한다.
    speculativeRef.current = {
      gen,
      promise: prepare([...modelHistory(), { who: 'me', text: ANSWERED }]),
    };

    let n = MY_TURN_SEC;
    setLeft(n);
    clearTimer();
    timerRef.current = window.setInterval(() => {
      if (genRef.current !== gen) return;
      n -= 1;
      setLeft(n);
      if (n <= 0) endMyTurnRef.current();
    }, 1000);
    // modelHistory 는 ref 를 읽는 함수라 의존성에 넣지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearTimer, prepare]);

  const runThemTurn = useCallback(async (gen: number) => {
    if (genRef.current !== gen) return;
    setPhase('thinking');
    ambientRef.current?.duck();

    // 내 차례 동안 미리 만들어 둔 것이 있으면 그걸 쓴다 (보통 이미 끝나 있다).
    const spec = speculativeRef.current;
    speculativeRef.current = null;
    const next = spec?.gen === gen
      ? await spec.promise
      : await prepare(modelHistory());
    if (genRef.current !== gen) return;

    pushTurn({ who: 'them', text: next.line });

    // 음성이 준비될 때까지는 'them' 으로 넘기지 않는다.
    // 소리가 나기도 전에 "듣는 중"이라고 적어 두면 화면이 거짓말을 한다.
    // 대사 말풍선은 이미 위에 떠 있으므로 읽을 것은 있다.
    const key = getGeminiKey();
    if (key) {
      await Promise.race([
        generateTts(next.line, key, scenario.id),
        new Promise(r => window.setTimeout(r, TTS_WAIT_MS)),
      ]);
      if (genRef.current !== gen) return;
    }
    setPhase('them');

    speakRef.current = speakPrompt(next.line, () => {
      if (genRef.current !== gen) return;
      if (next.done) {
        clearTimer();
        ambientRef.current?.stop();
        setPhase('done');
      } else {
        startMyTurn(gen);
      }
    }, scenario.id);
  }, [scenario, openerSeed, pushTurn, startMyTurn, clearTimer]);

  // 렌더마다 최신 상태를 담아 갱신한다.
  endMyTurnRef.current = async () => {
    // 인식 결과를 기다리는 동안 「다 말했어요」를 또 누르면 턴이 두 번 쌓인다.
    if (endingRef.current) return;
    endingRef.current = true;

    const gen = genRef.current;
    clearTimer();
    ambientRef.current?.duck();
    // ⚠️ 반드시 기다린다. iOS 는 최종 인식 결과를 stop() 뒤에 비동기로 준다.
    const said = await sttRef.current.stop();
    endingRef.current = false;
    if (genRef.current !== gen) return;

    let text: string;
    let unheard = false;
    if (!sttOn) {
      // 인식을 끈 경우 — 상대는 내용을 모른 채 자기 순서를 이어간다.
      text = ANSWERED;
    } else if (said) {
      unheardStreakRef.current = 0;
      text = said;
    } else {
      unheardStreakRef.current += 1;
      unheard = true;
      // 두 번 연속이면 되묻지 않고 넘어간다.
      text = unheardStreakRef.current >= 2 ? ANSWERED : UNHEARD;
    }

    pushTurn({ who: 'me', text, unheard });
    void runThemTurn(gen);
  };

  /** ⚠️ 버튼 onClick 에서 직접 호출된다 — primeAudio 앞에 await 를 두지 말 것. */
  function handleStart() {
    genRef.current += 1;
    const gen = genRef.current;
    primeAudio();                       // 오디오 잠금 해제 (이후 턴이 전부 여기 달려 있다)
    if (ambientOn && scenario.ambientKey) {
      ambientRef.current?.play(scenario.ambientKey);
      ambientRef.current?.duck();
    }
    turnsRef.current = [];
    setTurns([]);
    unheardStreakRef.current = 0;
    usedRef.current = new Set();
    void runThemTurn(gen);
  }

  const themCount = turns.filter(t => t.who === 'them').length;

  return (
    <div className="space-y-4">
      {/* 목표 — 말할 문장은 안 주지만, 뭘 하러 왔는지는 알려 준다 */}
      <div className="rounded-xl bg-teal-50 border border-teal-200 px-3 py-2.5">
        <p className="text-[11px] font-semibold text-teal-800">목표</p>
        <p className="text-xs text-teal-700 leading-relaxed mt-0.5">{scenario.goal}</p>
      </div>

      {/* 대화 기록 */}
      {turns.length > 0 && (
        <div className="space-y-2">
          {turns.map((t, i) => (
            <Bubble key={i} turn={t} />
          ))}
        </div>
      )}

      {/* 단계별 화면 */}
      {phase === 'intro' && (
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-5 text-center">
          <p className="text-xs text-gray-500 leading-relaxed mb-4">
            준비되면 시작하세요. 상대가 먼저 말을 걸어요.<br />
            <b>말할 문장은 화면에 안 나와요.</b> 하고 싶은 말을 그대로 하면 돼요.
          </p>
          <button
            onClick={handleStart}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 transition-colors"
          >
            <Play size={16} />
            시작
          </button>
        </div>
      )}

      {phase === 'thinking' && (
        <div className="rounded-2xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] py-8 text-center">
          <Loader2 size={20} className="mx-auto text-gray-300 animate-spin" />
          <p className="text-xs text-gray-400 mt-2">
            {themCount === 0 ? '상대를 기다리는 중...' : '상대가 말하려고 해요...'}
          </p>
        </div>
      )}

      {phase === 'them' && (
        <div className="rounded-2xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] py-8 text-center">
          <p className="text-sm text-gray-500">듣는 중...</p>
        </div>
      )}

      {phase === 'me' && (
        <div className="rounded-2xl bg-teal-50 border border-teal-200 py-6 px-4 text-center">
          <p className="text-sm font-semibold text-teal-800">지금 말하세요</p>
          <p className="text-4xl font-bold text-teal-600 tabular-nums mt-2">{Math.max(0, left)}</p>

          {/* 인식 중인 말 — 흐리게, 판정처럼 보이지 않게 */}
          {sttOn && !stt.denied && (
            <p className="text-xs text-teal-700/70 mt-2 min-h-[1.2em] break-keep">
              {stt.partial || ' '}
            </p>
          )}
          {sttOn && stt.denied && (
            <p className="text-[11px] text-teal-700/70 mt-2">
              마이크를 쓸 수 없어서 상대는 순서대로 진행해요.
            </p>
          )}

          <button
            onClick={() => endMyTurnRef.current()}
            className="mt-3 text-xs font-medium text-teal-700 underline underline-offset-2"
          >
            다 말했어요
          </button>
        </div>
      )}

      {phase === 'done' && (
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-5 text-center space-y-3">
          <p className="text-2xl">🫱</p>
          <p className="text-sm font-semibold text-gray-800">대화를 끝까지 했어요.</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            끝까지 간 것 자체가 이 연습의 전부예요.<br />
            위에 오간 말이 그대로 남아 있어요.
          </p>
          <div className="flex gap-2 pt-1">
            <button
              onClick={onRestart}
              className="flex-1 rounded-xl py-3 text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              다른 상황 하기
            </button>
            <button
              onClick={onClose}
              className="flex-1 rounded-xl py-3 text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 transition-colors"
            >
              마치기
            </button>
          </div>
        </div>
      )}

      {/* 진행 표시 — 언제 끝나는지 몰라 불안해지지 않게 */}
      {phase !== 'intro' && phase !== 'done' && (
        <p className="text-[11px] text-gray-400 text-center">
          {themCount} / {scenario.maxTurns} 마디쯤 오갔어요
        </p>
      )}
    </div>
  );
}

// 말풍선. 못 알아들은 내 턴은 '…' 으로 둔다 —
// "안 들렸어요" 같은 문구를 띄우면 그 순간 연습이 아니라 판정이 된다.
function Bubble({ turn }: { turn: UiTurn }) {
  if (turn.who === 'them') {
    return (
      <div className="flex">
        <div className="max-w-[85%] bg-white rounded-2xl rounded-tl-sm shadow-[0_8px_30px_rgb(0,0,0,0.05)] px-4 py-2.5">
          <p className="text-sm text-gray-700 break-keep">{turn.text}</p>
        </div>
      </div>
    );
  }
  const shown = turn.unheard || turn.text === ANSWERED ? '…' : turn.text;
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] bg-teal-500 rounded-2xl rounded-tr-sm px-4 py-2.5">
        <p className="text-sm text-white break-keep">{shown}</p>
      </div>
    </div>
  );
}
