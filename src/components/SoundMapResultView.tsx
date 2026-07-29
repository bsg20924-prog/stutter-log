// 소리 지도 결과 화면 — 압력 임계점 지도 + 단계별 성공률 + (접힘) 조음 위치 + 처방 카드.
//
// 색은 심각도(안전 → 압박 반응 → 목소리부터 → 소리 자체)를 나타내는 순서형 팔레트이고,
// 검증 스크립트를 통과한 hex 를 THRESHOLD_META 에서 그대로 쓴다.
// 글자는 항상 먹색(gray-*)을 쓰고, 색은 칩의 배경/테두리와 범례만 담당한다.

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  MicOff, HelpCircle, ChevronDown, Check, Timer, Target, Sparkles, Info,
  MessageSquare, VolumeX,
} from 'lucide-react';
import { ko } from 'date-fns/locale';
import {
  SoundMapResult, SoundMapCardResult,
  THRESHOLD_META, THRESHOLD_ORDER, summarizeSoundMap, normalizeThresholdCounts,
} from '../utils/soundMapResult';
import { summarizeSimulation } from '../utils/simulationResult';
import { SOUND_GROUPS } from '../data/soundMap';
import {
  Prescription, SimulationPrescription,
  BLOCKAGE_META, buildPrescriptions,
  buildSimulationPrescriptions, buildSituationPrescriptionsFromCards,
} from '../utils/soundMapPrescription';
import { ZONES } from '../utils/phonetics';
import { extractPhoneme } from '../utils/phoneme';
import { getStrategy, Strategy, STRATEGY_CATEGORIES } from '../data/strategies';
import { useLogStore } from '../hooks/useLogStore';
import RecordingList from './RecordingList';
import QuickPracticeModal from './QuickPracticeModal';
import StrategyDetailModal from './StrategyDetailModal';
import ArticulationMap from './ArticulationMap';

// 기록 note 접두사 — 같은 소리 지도에서 두 번 등록되는 것을 막는 데 쓴다.
const NOTE_CHALLENGE = '소리 지도 · 압력 사다리에서 걸림';
const NOTE_EVIDENCE = '소리 지도 · 예상보다 잘 나온 증거';

export default function SoundMapResultView({ result }: { result: SoundMapResult }) {
  const [practice, setPractice] = useState<Strategy | null>(null);
  const [detail, setDetail] = useState<Strategy | null>(null);
  // Stage 4 이전에 저장된 지도에는 'simulation' 칸이 없다 — 정규화하지 않으면 산수가 NaN 이 된다.
  const t = normalizeThresholdCounts(result.thresholdCounts);
  const broken = t.recording + t.normal + t.whisper;
  const present = THRESHOLD_ORDER.filter(k => t[k] > 0);

  const overpredictedCards = result.cards.filter(c => c.fearGap === 'over');
  // 저장된 카드에서 매번 파생 — 예전 지도도 처방을 받을 수 있다.
  const prescriptions = buildPrescriptions(result.cards);
  // 상황에서만 걸린 것은 원인이 달라 따로 묶는다.
  // 우선순위: 카드 4단계 데이터 → 없으면 예전 방식(별도 시뮬레이션)으로 폴백.
  // 예전에 저장된 지도도 계속 처방을 받을 수 있어야 한다.
  const fromCards = buildSituationPrescriptionsFromCards(result.cards);
  const simPrescriptions = fromCards.length > 0
    ? fromCards
    : buildSimulationPrescriptions(result.simulation, result.simulationOnlyWords);
  // 연습 모달에 넘길 단어: 처방 대상 단어가 없으면 걸린 소리 전체
  const practiceWords = prescriptions.flatMap(p => p.words);

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
          {t.simulation > 0 && ` · 상황 반응 ${t.simulation}개`}
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
          {SOUND_GROUPS.map(group => {
            // 예전에 저장된 지도는 groupId 가 없을 수 있어 kind 로 보정한다
            const cards = result.cards.filter(c =>
              (c.groupId ?? (c.kind === 'custom' ? 'custom' : '')) === group.id);
            if (cards.length === 0) return null;
            return (
              <div key={group.id}>
                <p className="text-[11px] font-medium text-gray-400 mb-1.5">
                  {group.label}
                  <span className="text-gray-300"> · {group.sublabel}</span>
                </p>
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

      {/* ── 맞춤 처방: 언제(임계점) × 왜(막힘 유형) → 무엇(전략) ── */}
      {prescriptions.length > 0 && (
        <div className="space-y-3">
          <div className="px-1">
            <h3 className="text-sm font-semibold text-gray-700">🎯 맞춤 처방</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              어느 압력에서 걸렸는지와 왜 걸렸는지를 함께 보고 고른 전략이에요.
            </p>
          </div>
          {prescriptions.map(p => (
            <PrescriptionCard
              key={`${p.threshold}:${p.blockage}`}
              prescription={p}
              onDetail={setDetail}
              onPractice={setPractice}
            />
          ))}
        </div>
      )}

      {/* ── Stage 4: 상황 시뮬레이션 (건너뛰었으면 통째로 없음) ── */}
      {result.simulation && <SimulationSummary result={result} />}

      {/* ── 노출 처방: 상황에서만 걸린 것 ── */}
      {simPrescriptions.length > 0 && (
        <div className="space-y-3">
          <div className="px-1">
            <h3 className="text-sm font-semibold text-gray-700">🎭 상황 노출 처방</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              소리에는 문제가 없고 상황에만 반응한 단어들이에요. 발성이 아니라 노출로 다뤄요.
            </p>
          </div>
          {simPrescriptions.map(p => (
            <SimulationPrescriptionCard
              key={p.scenarioId}
              prescription={p}
              onDetail={setDetail}
            />
          ))}
        </div>
      )}

      {/* ── 조음 위치 (접힘 · 참고용) ── */}
      {/* 예전에 저장된 결과에는 zoneSamples 가 없을 수 있어 방어적으로 처리 */}
      {(result.zoneSamples ?? 0) > 0 && <ZoneDetails result={result} />}

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

      {detail && <StrategyDetailModal strategy={detail} onClose={() => setDetail(null)} />}
      {practice && (
        <QuickPracticeModal
          strategy={practice}
          blockedWords={practiceWords.length > 0 ? practiceWords : result.hardSoundWords}
          onClose={() => setPractice(null)}
        />
      )}
    </div>
  );
}

// ── 처방 카드: 언제 × 왜 → 무엇 ──────────────────────────────
function PrescriptionCard({
  prescription, onDetail, onPractice,
}: {
  prescription: Prescription;
  onDetail: (s: Strategy) => void;
  onPractice: (s: Strategy) => void;
}) {
  const meta = THRESHOLD_META[prescription.threshold];
  const blockage = BLOCKAGE_META[prescription.blockage];
  const strategies = prescription.strategies
    .map(getStrategy)
    .filter((s): s is Strategy => Boolean(s));

  return (
    <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: meta.color }}>
      {/* 언제 */}
      <div className="px-4 pt-4 pb-3" style={{ backgroundColor: meta.tint }}>
        <div className="flex items-center gap-1.5 mb-1">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: meta.color }} />
          <span className="text-sm font-semibold text-gray-800">{prescription.headline}</span>
        </div>
        {/* 왜 */}
        <p className="text-xs font-medium text-gray-600 mb-1">왜 — {blockage.label}</p>
        <p className="text-xs text-gray-600 leading-relaxed mb-3">{prescription.reason}</p>
        <WordChips words={prescription.words} color={meta.color} />
      </div>

      {/* 무엇 */}
      <div className="px-4 py-3 space-y-2">
        <p className="text-[11px] font-semibold text-gray-400">추천 전략</p>
        {strategies.map(s => {
          const category = STRATEGY_CATEGORIES.find(c => c.id === s.category);
          return (
            <button
              key={s.id}
              onClick={() => onDetail(s)}
              className="w-full text-left rounded-xl bg-gray-50 px-3 py-2.5 hover:bg-teal-50/60 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <span className="text-sm">{category?.emoji}</span>
                <span className="text-sm font-semibold text-gray-800">{s.name}</span>
                <Info size={14} className="ml-auto shrink-0 text-gray-300" />
              </span>
              <span className="block text-xs text-gray-500 leading-relaxed mt-0.5">{s.actionGuide}</span>
            </button>
          );
        })}

        <div className="flex gap-2 pt-1">
          <RegisterChallengeAction words={prescription.words} compact />
          {strategies[0] && (
            <button
              onClick={() => onPractice(strategies[0])}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-teal-50 py-2.5 text-xs font-semibold text-teal-700 border border-teal-200 hover:bg-teal-100 transition-colors"
            >
              <Timer size={14} />
              10초 연습하기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stage 4 결과 요약: 상황별로 몇 문장에서 걸렸는지 ──────────────────
function SimulationSummary({ result }: { result: SoundMapResult }) {
  const sim = result.simulation;
  if (!sim) return null;

  const meta = THRESHOLD_META.simulation;
  const caughtSentences = sim.sentences.filter(
    s => s.assessment === 'partial' || s.assessment === 'blocked',
  );

  // 상황에서 걸렸지만 소리 지도에 같은 단어가 없는 경우.
  // 이때는 "상황 때문"인지 "원래 어려운 소리"인지 가를 근거가 없어 승격도 처방도 못 한다.
  // 그냥 조용히 빠지면 사용자는 분명히 걸렸는데 아무 말이 없는 이유를 알 수 없다 — 밝혀서 안내한다.
  const cardTexts = new Set(result.cards.map(c => c.text.trim().toLowerCase()));
  const unmatched = sim.caughtWords.filter(w => !cardTexts.has(w.trim().toLowerCase()));

  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1">
        <MessageSquare size={15} className="text-gray-400" />
        상황 시뮬레이션
      </h3>
      <p className="text-xs text-gray-500 leading-relaxed mb-3">{summarizeSimulation(sim)}</p>

      {/* 상황별 결과 */}
      <div className="space-y-3">
        {sim.scenarios.filter(s => s.total > 0).map(s => {
          const rate = s.answered > 0 ? Math.round((s.smooth / s.answered) * 100) : 0;
          return (
            <div key={s.scenarioId}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs font-medium text-gray-700">{s.label}</span>
                <span className="text-xs font-semibold text-gray-600">
                  {s.answered > 0 ? `${rate}%` : '—'}
                  <span className="text-gray-400 font-normal">
                    {' '}({s.smooth}/{s.answered} 술술)
                    {s.unknown > 0 && ` · 모름 ${s.unknown}`}
                  </span>
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${rate}%`, backgroundColor: THRESHOLD_META.none.color }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* 걸린 문장 원문 — 어떤 문장이었는지가 다음 노출 연습의 재료가 된다 */}
      {caughtSentences.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <p className="text-[11px] font-semibold text-gray-400 mb-2">걸렸던 문장</p>
          <div className="space-y-1.5">
            {caughtSentences.map(s => (
              <div
                key={s.sentenceId}
                className="rounded-lg px-2.5 py-2"
                style={{ backgroundColor: meta.tint }}
              >
                <p className="text-xs text-gray-700 break-keep">{s.text}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{s.scenarioLabel}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 이 기기에 저장된 녹음 — 없으면 통째로 렌더되지 않는다 */}
      <RecordingList soundMapId={result.id} />

      {/* 소리 지도에 없어서 원인을 가릴 수 없는 단어 */}
      {unmatched.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-[11px] font-semibold text-gray-400 mb-2">아직 원인을 가릴 수 없는 단어</p>
          <WordChips words={unmatched} color={THRESHOLD_META.unknown.color} />
          <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
            상황에서 걸렸지만 이 단어들은 압력 사다리로 재보지 않았어요.
            <b className="text-gray-500"> 상황 때문인지 원래 어려운 소리인지</b> 가르려면,
            다음 소리 지도를 만들 때 <b className="text-gray-500">‘무서운 단어 추가’</b>에 넣어 주세요.
          </p>
        </div>
      )}

      {/* 음성 없이 진행했다면 근거의 무게를 낮춰 안내한다 */}
      {sim.fallbackCount > 0 && (
        <p className="flex items-start gap-1.5 text-[11px] text-gray-400 mt-3 leading-relaxed">
          <VolumeX size={13} className="shrink-0 mt-0.5" />
          <span>
            {sim.fallbackCount}개 문장은 한국어 음성 없이 말풍선으로 진행했어요.
            실제 상황보다 압박이 약했을 수 있어요.
          </span>
        </p>
      )}
    </div>
  );
}

// ── 노출 처방 카드: 상황 × 노출 사다리 ────────────────────────
function SimulationPrescriptionCard({
  prescription, onDetail,
}: {
  prescription: SimulationPrescription;
  onDetail: (s: Strategy) => void;
}) {
  const meta = THRESHOLD_META.simulation;
  const strategies = prescription.strategies
    .map(getStrategy)
    .filter((s): s is Strategy => Boolean(s));

  return (
    <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: meta.color }}>
      <div className="px-4 pt-4 pb-3" style={{ backgroundColor: meta.tint }}>
        <div className="flex items-center gap-1.5 mb-1">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: meta.color }} />
          <span className="text-sm font-semibold text-gray-800">{prescription.headline}</span>
        </div>
        <p className="text-xs font-medium text-gray-600 mb-1">상황 — {prescription.scenarioLabel}</p>
        <p className="text-xs text-gray-600 leading-relaxed mb-3">{prescription.reason}</p>
        <WordChips words={prescription.words} color={meta.color} />
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* 노출 사다리 — 이 처방의 핵심 */}
        <div>
          <p className="text-[11px] font-semibold text-gray-400 mb-2">노출 사다리 · 위에서부터 차례로</p>
          <ol className="space-y-1.5">
            {prescription.exposureSteps.map((s, i) => (
              <li key={i} className="flex gap-2 text-xs text-gray-600 leading-relaxed">
                <span className="shrink-0 w-4 h-4 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
            각 단계는 <b className="text-gray-500">긴장이 내려갈 때까지</b> 머문 뒤 다음으로 넘어가세요.
            불안이 높은 상태에서 그만두면 그 상황이 위험하다는 학습만 남아요.
          </p>
        </div>

        <div className="pt-1 border-t border-gray-100">
          <p className="text-[11px] font-semibold text-gray-400 mb-2 mt-2">말하기 직전에 쓸 전략</p>
          <div className="space-y-2">
            {strategies.map(s => {
              const category = STRATEGY_CATEGORIES.find(c => c.id === s.category);
              return (
                <button
                  key={s.id}
                  onClick={() => onDetail(s)}
                  className="w-full text-left rounded-xl bg-gray-50 px-3 py-2.5 hover:bg-teal-50/60 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm">{category?.emoji}</span>
                    <span className="text-sm font-semibold text-gray-800">{s.name}</span>
                    <Info size={14} className="ml-auto shrink-0 text-gray-300" />
                  </span>
                  <span className="block text-xs text-gray-500 leading-relaxed mt-0.5">{s.actionGuide}</span>
                </button>
              );
            })}
          </div>
        </div>

        <RegisterChallengeAction words={prescription.words} />
      </div>
    </div>
  );
}

// ── 조음 위치: 기본은 접어 두고, 열면 단순 목록으로만 보여준다 ──────────
function ZoneDetails({ result }: { result: SoundMapResult }) {
  const [open, setOpen] = useState(false);
  const [showMap, setShowMap] = useState(false);
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
            <p className="text-xs text-gray-400">걸린 소리가 없어 표시할 정보가 없어요.</p>
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
            {' '}소리 {result.zoneSamples}개 기준이며, 내가 추가한 단어는 조음 위치를 알 수 없어 제외했어요.
          </p>

          {/* 해부도는 2차 정보 — 목록 아래에 한 번 더 접어 둔다. 강한 빨강 히트맵은 쓰지 않는다. */}
          {rows.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <button
                onClick={() => setShowMap(m => !m)}
                aria-expanded={showMap}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
              >
                발음 기관 그림으로 보기
                <ChevronDown
                  size={14}
                  className={`shrink-0 text-gray-400 transition-transform ${showMap ? 'rotate-180' : ''}`}
                />
              </button>
              {showMap && (
                <div className="mt-2">
                  <ArticulationMap frequency={result.zoneBlockage} />
                </div>
              )}
            </div>
          )}
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

// ── 처방 버튼 ────────────────────────────────────────────────
type ActionState = 'idle' | 'busy' | 'done' | 'error';

function ActionButton({
  state, idleLabel, doneLabel, icon, onClick, compact,
}: {
  state: ActionState;
  idleLabel: string;
  doneLabel: string;
  icon: React.ReactNode;
  onClick: () => void;
  compact?: boolean;
}) {
  if (state === 'done') {
    return (
      <p className={`flex items-center justify-center gap-1.5 rounded-xl bg-gray-50 py-2.5 text-xs font-semibold text-gray-500 ${compact ? 'flex-1' : 'w-full'}`}>
        <Check size={14} /> {doneLabel}
      </p>
    );
  }
  return (
    <div className={compact ? 'flex-1' : ''}>
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

// 걸린 소리 → 도전 단어로 등록
function RegisterChallengeAction({ words, compact }: { words: string[]; compact?: boolean }) {
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
      doneLabel="등록됨"
      icon={<Target size={14} />}
      onClick={register}
      compact={compact}
    />
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
