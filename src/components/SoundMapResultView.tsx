// 소리 지도 결과 화면 — 압력 임계점 지도 + 단계별 성공률 + (접힘) 조음 위치 + 처방 카드.
//
// 색은 심각도(안전 → 압박 반응 → 목소리부터 → 소리 자체)를 나타내는 순서형 팔레트이고,
// 검증 스크립트를 통과한 hex 를 THRESHOLD_META 에서 그대로 쓴다.
// 글자는 항상 먹색(gray-*)을 쓰고, 색은 칩의 배경/테두리와 범례만 담당한다.

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { MicOff, HelpCircle, ChevronDown, Check, Timer, Target, Sparkles } from 'lucide-react';
import { ko } from 'date-fns/locale';
import {
  SoundMapResult, SoundMapCardResult, PressureThreshold,
  THRESHOLD_META, THRESHOLD_ORDER, summarizeSoundMap,
} from '../utils/soundMapResult';
import { SoundKind, KIND_LABEL } from '../data/soundMap';
import { ZONES } from '../utils/phonetics';
import { extractPhoneme } from '../utils/phoneme';
import { getStrategy, Strategy } from '../data/strategies';
import { useLogStore } from '../hooks/useLogStore';
import QuickPracticeModal from './QuickPracticeModal';

const KIND_ORDER: SoundKind[] = ['vowel', 'consonant', 'custom'];

// 기록 note 접두사 — 같은 소리 지도에서 두 번 등록되는 것을 막는 데 쓴다.
const NOTE_CHALLENGE = '소리 지도 · 녹음 압박에서 걸림';
const NOTE_EVIDENCE = '소리 지도 · 예상보다 잘 나온 증거';

// 속삭임에서도 걸리는 소리는 힘이 과하게 들어간 경우가 많아 '가벼운 접촉'을 기본 연습으로 건다.
const HARD_SOUND_STRATEGY = 'light-contact';

export default function SoundMapResultView({ result }: { result: SoundMapResult }) {
  const [practice, setPractice] = useState<Strategy | null>(null);
  const t = result.thresholdCounts;
  const broken = t.recording + t.normal + t.whisper;
  const present = THRESHOLD_ORDER.filter(k => t[k] > 0);

  const overpredictedCards = result.cards.filter(c => c.fearGap === 'over');

  return (
    <div className="space-y-4">
      {/* ── 요약 ── */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-400">소리 지도</span>
          <span className="text-xs text-gray-300">
            {format(parseISO(result.createdAt), 'M월 d일 HH:mm', { locale: ko })}
          </span>
        </div>
        <p className="text-sm text-gray-700 leading-relaxed">{summarizeSoundMap(result)}</p>

        {/* 임계점 분포 — 100% 누적 막대. 조각 사이 2px 흰 간격 */}
        {present.length > 0 && (
          <div className="mt-3 flex gap-0.5 h-2.5" role="img" aria-label="압력 임계점 분포">
            {present.map(k => (
              <div
                key={k}
                title={`${THRESHOLD_META[k].label} ${t[k]}개`}
                style={{
                  width: `${(t[k] / result.totalCards) * 100}%`,
                  backgroundColor: THRESHOLD_META[k].color,
                }}
                className="first:rounded-l-full last:rounded-r-full"
              />
            ))}
          </div>
        )}

        <p className="text-xs text-gray-400 mt-3">
          소리 {result.totalCards}개 · 걸림 {broken}개 · 안전 {t.none}개
          {t.unknown > 0 && ` · 모르겠음 ${t.unknown}개`}
        </p>

        {/* 마이크 없이 진행한 카드가 있으면 근거의 무게를 낮춰 안내 */}
        {result.manualCards > 0 && (
          <p className="flex items-start gap-1.5 text-[11px] text-gray-400 mt-2 leading-relaxed">
            <MicOff size={13} className="shrink-0 mt-0.5" />
            <span>
              {result.manualCards}개 소리는 마이크 없이 수동 압박으로 진행했어요.
              3단계 결과는 실제 녹음 압박보다 약하게 봐 주세요.
            </span>
          </p>
        )}
      </div>

      {/* ── 지도 ── */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">나의 소리 지도</h3>
        <p className="text-xs text-gray-400 mb-3">각 소리가 어느 압력에서 처음 걸렸는지예요.</p>

        {/* 범례 — 색만으로 구분되지 않도록 항상 표시 */}
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 mb-4">
          {THRESHOLD_ORDER.map(k => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: THRESHOLD_META[k].color }}
              />
              <span className="text-[11px] text-gray-500">
                {THRESHOLD_META[k].label}
                <span className="text-gray-400"> {t[k]}</span>
              </span>
            </span>
          ))}
        </div>

        <div className="space-y-3">
          {KIND_ORDER.map(kind => {
            const cards = result.cards.filter(c => c.kind === kind);
            if (cards.length === 0) return null;
            return (
              <div key={kind}>
                <p className="text-[11px] font-medium text-gray-400 mb-1.5">{KIND_LABEL[kind]}</p>
                <div className="flex flex-wrap gap-1.5">
                  {cards.map(c => <SoundChip key={c.cardId} card={c} />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 압력 단계별 성공률 ── */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">압력 단계별 성공률</h3>
        <p className="text-xs text-gray-400 mb-3">
          단계가 올라갈수록 급격히 떨어진다면, 소리보다 압박이 원인이에요.
        </p>
        <div className="space-y-3">
          {result.stepStats.map(s => {
            const pct = Math.round(s.smoothRate * 100);
            return (
              <div key={s.stepId}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700">{s.label}</span>
                  <span className="text-xs font-semibold text-gray-600">
                    {s.answered > 0 ? `${pct}%` : '—'}
                    <span className="text-gray-400 font-normal">
                      {' '}({s.smooth}/{s.answered} 술술)
                      {s.unknown > 0 && ` · 모름 ${s.unknown}`}
                    </span>
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: THRESHOLD_META.none.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 조음 위치 (접힘 · 참고용) ── */}
      {/* 예전에 저장된 결과에는 zoneSamples 가 없을 수 있어 방어적으로 처리 */}
      {(result.zoneSamples ?? 0) > 0 && <ZoneDetails result={result} />}

      {/* ── 처방 카드 ── */}
      {result.pressureSensitiveWords.length > 0 && (
        <InsightCard
          threshold="recording"
          title="압박에만 반응한 소리"
          words={result.pressureSensitiveWords}
          action={<RegisterChallengeAction words={result.pressureSensitiveWords} />}
        />
      )}

      {result.hardSoundWords.length > 0 && (
        <InsightCard
          threshold="whisper"
          title="속삭임에서도 걸린 소리"
          words={result.hardSoundWords}
          action={
            <PracticeAction onStart={() => setPractice(getStrategy(HARD_SOUND_STRATEGY) ?? null)} />
          }
        />
      )}

      {overpredictedCards.length > 0 && (
        <div className="bg-teal-50 border border-teal-100 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-teal-800 mb-1">💚 생각보다 잘 나온 소리</h3>
          <p className="text-xs text-teal-700 leading-relaxed mb-3">
            어렵다고 예상했지만 3단계를 모두 통과했어요. 두려움이 실제보다 컸던 소리예요.
          </p>
          <WordChips words={overpredictedCards.map(c => c.text)} color={THRESHOLD_META.none.color} />
          <div className="mt-3">
            <RememberEvidenceAction cards={overpredictedCards} />
          </div>
        </div>
      )}

      {/* ── 인식의 공백 ── */}
      {result.unknownWords.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1">
            <HelpCircle size={15} className="text-gray-400" />
            판단이 어려웠던 소리
          </h3>
          <p className="text-xs text-gray-500 leading-relaxed mb-3">
            몸 감각은 원래 불확실해요. 억지로 고르지 않은 것도 정확한 기록이고,
            이 소리들이 줄어드는 것 자체가 인식이 좋아지고 있다는 신호예요.
          </p>
          <WordChips words={result.unknownWords} color={THRESHOLD_META.unknown.color} />
        </div>
      )}

      {practice && (
        <QuickPracticeModal
          strategy={practice}
          blockedWords={result.hardSoundWords}
          onClose={() => setPractice(null)}
        />
      )}
    </div>
  );
}

// ── 조음 위치: 기본은 접어 두고, 열면 단순 목록으로만 보여준다 ──────────
function ZoneDetails({ result }: { result: SoundMapResult }) {
  const [open, setOpen] = useState(false);
  const rows = ZONES
    .map(z => ({ zone: z, count: result.zoneBlockage[z] }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-700">발음 기관별 세부 정보 보기</span>
        <ChevronDown
          size={16}
          className={`ml-auto shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3">
          {rows.length === 0 ? (
            <p className="text-xs text-gray-400">자음에서 걸린 소리가 없어 표시할 정보가 없어요.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {rows.map(r => (
                <li key={r.zone} className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-700">{r.zone}</span>
                  <span className="text-sm text-gray-500 tabular-nums">{r.count}회</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
            표본 수가 적어 참고용 정보입니다.
            {' '}자음 {result.zoneSamples}개 기준이며, 모음은 조음 위치 집계에서 제외했어요.
          </p>
        </div>
      )}
    </div>
  );
}

// 지도 위의 소리 한 칸
function SoundChip({ card }: { card: SoundMapCardResult }) {
  const meta = THRESHOLD_META[card.threshold];
  return (
    <span
      title={`${card.text} · ${meta.label}${card.fear ? ` · 예상 긴장 ${card.fear}/5` : ''}`}
      className="inline-flex items-center justify-center min-w-9 h-9 px-2.5 rounded-xl text-sm font-bold text-gray-800 border"
      style={{ backgroundColor: meta.tint, borderColor: meta.color }}
    >
      {card.text}
    </span>
  );
}

function WordChips({ words, color }: { words: string[]; color: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {words.map(w => (
        <span
          key={w}
          className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700 border"
          style={{ borderColor: color }}
        >
          {w}
        </span>
      ))}
    </div>
  );
}

function InsightCard({
  threshold, title, words, action,
}: {
  threshold: PressureThreshold;
  title: string;
  words: string[];
  action?: React.ReactNode;
}) {
  const meta = THRESHOLD_META[threshold];
  return (
    <div
      className="rounded-2xl p-4 border"
      style={{ backgroundColor: meta.tint, borderColor: meta.color }}
    >
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 mb-1">
        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: meta.color }} />
        {title}
      </h3>
      <p className="text-xs text-gray-600 leading-relaxed mb-3">{meta.desc}</p>
      <WordChips words={words} color={meta.color} />
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// ── 처방 버튼 ────────────────────────────────────────────────
type ActionState = 'idle' | 'busy' | 'done' | 'error';

function ActionButton({
  state, idleLabel, doneLabel, icon, onClick,
}: {
  state: ActionState;
  idleLabel: string;
  doneLabel: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  if (state === 'done') {
    return (
      <p className="flex items-center justify-center gap-1.5 rounded-xl bg-white/70 py-2.5 text-xs font-semibold text-gray-500">
        <Check size={14} /> {doneLabel}
      </p>
    );
  }
  return (
    <div>
      <button
        onClick={onClick}
        disabled={state === 'busy'}
        className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-xs font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:text-gray-400 transition-colors"
      >
        {icon}
        {state === 'busy' ? '기록 중…' : idleLabel}
      </button>
      {state === 'error' && (
        <p className="text-[11px] text-red-500 text-center mt-1.5">
          저장하지 못했어요. 로그인 상태를 확인하고 다시 눌러 주세요.
        </p>
      )}
    </div>
  );
}

// 녹음 압박에서만 걸린 소리 → 도전 단어로 등록
function RegisterChallengeAction({ words }: { words: string[] }) {
  const { entries, addEntry } = useLogStore();
  const [state, setState] = useState<ActionState>('idle');

  const already = words.every(w =>
    entries.some(e => e.word === w && e.note === NOTE_CHALLENGE));

  async function register() {
    setState('busy');
    try {
      for (const word of words) {
        if (entries.some(e => e.word === word && e.note === NOTE_CHALLENGE)) continue;
        await addEntry({
          word,
          blockedSyllables: [],
          phonemes: [extractPhoneme(word)].filter(Boolean),
          situations: [],
          outcome: '',            // 소리 지도는 실제 대화 결과를 모른다 — 비워 둔다
          status: 'blocked',
          isDetailed: false,
          note: NOTE_CHALLENGE,
        });
      }
      setState('done');
    } catch {
      setState('error');
    }
  }

  return (
    <ActionButton
      state={already ? 'done' : state}
      idleLabel="도전 단어로 등록"
      doneLabel="도전 단어로 등록됨"
      icon={<Target size={14} />}
      onClick={register}
    />
  );
}

// 속삭임에서도 걸린 소리 → 10초 연습
function PracticeAction({ onStart }: { onStart: () => void }) {
  return (
    <button
      onClick={onStart}
      className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-xs font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
    >
      <Timer size={14} />
      10초 연습하기
    </button>
  );
}

// 예상보다 잘 나온 소리 → 성공 증거로 기록
// expectedFear/actualDifficulty 를 함께 남겨 통계 탭의 '예상 vs 실제' 에도 반영되게 한다.
function RememberEvidenceAction({ cards }: { cards: SoundMapCardResult[] }) {
  const { entries, addEntry } = useLogStore();
  const [state, setState] = useState<ActionState>('idle');

  const already = cards.every(c =>
    entries.some(e => e.word === c.text && e.note === NOTE_EVIDENCE));

  async function remember() {
    setState('busy');
    try {
      for (const c of cards) {
        if (entries.some(e => e.word === c.text && e.note === NOTE_EVIDENCE)) continue;
        await addEntry({
          word: c.text,
          blockedSyllables: [],
          phonemes: [extractPhoneme(c.text)].filter(Boolean),
          situations: [],
          outcome: '그대로_자연스럽게',
          status: 'overcome',
          isDetailed: false,
          note: NOTE_EVIDENCE,
          ...(c.fear !== undefined ? { expectedFear: c.fear, actualDifficulty: 1 } : {}),
        });
      }
      setState('done');
    } catch {
      setState('error');
    }
  }

  return (
    <ActionButton
      state={already ? 'done' : state}
      idleLabel="이 증거 기억하기"
      doneLabel="증거로 기록됨"
      icon={<Sparkles size={14} />}
      onClick={remember}
    />
  );
}
