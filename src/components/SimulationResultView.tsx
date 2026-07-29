// 상황 시뮬레이션 단독 실행 결과 화면.
//
// 소리 지도 결과 화면(SoundMapResultView)과 다른 점은 하나다:
// 압력 사다리 데이터가 없으므로 "왜 걸렸는가"를 이 실행만으로는 알 수 없다.
// 그래서 기준 지도가 있으면 그것에 비춰 셋으로 가르고, 없으면 그 사실을 그대로 밝힌다.
// 추측으로 원인을 채우면 사용자는 엉뚱한 연습을 하게 된다.

import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { MessageSquare, VolumeX, Map as MapIcon, Info, AlertCircle } from 'lucide-react';
import { StandaloneSimulation, summarizeStandalone } from '../utils/simulationStandalone';
import { THRESHOLD_META } from '../utils/soundMapResult';
import { buildSimulationPrescriptions } from '../utils/soundMapPrescription';
import { getStrategy, Strategy, STRATEGY_CATEGORIES } from '../data/strategies';
import RecordingList from './RecordingList';

export default function SimulationResultView({
  run, onStartSoundMap, onDetail,
}: {
  run: StandaloneSimulation;
  onStartSoundMap?: () => void;
  onDetail?: (s: Strategy) => void;
}) {
  const sim = run.simulation;
  const meta = THRESHOLD_META.simulation;
  const caughtSentences = sim.sentences.filter(
    s => s.assessment === 'partial' || s.assessment === 'blocked',
  );
  // 저장 시점에 굳혀 둔 분류를 그대로 쓴다 — 나중에 지도를 새로 만들어도 그때의 판단이 남아야 한다.
  const prescriptions = buildSimulationPrescriptions(sim, run.situationalWords);

  return (
    <div className="space-y-4">
      {/* ── 요약 ── */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-400">상황 시뮬레이션</span>
          <span className="text-xs text-gray-300">
            {format(parseISO(run.createdAt), 'M월 d일 HH:mm', { locale: ko })}
          </span>
        </div>
        <p className="text-sm text-gray-700 leading-relaxed">{summarizeStandalone(run)}</p>

        <div className="space-y-3 mt-4">
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

        {caughtSentences.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <p className="text-[11px] font-semibold text-gray-400 mb-2">걸렸던 문장</p>
            <div className="space-y-1.5">
              {caughtSentences.map(s => (
                <div key={s.sentenceId} className="rounded-lg px-2.5 py-2" style={{ backgroundColor: meta.tint }}>
                  <p className="text-xs text-gray-700 break-keep">{s.text}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{s.scenarioLabel}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <RecordingList soundMapId={run.id} />

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

      {/* ── 기준 지도가 없을 때: 원인을 못 가린다는 사실을 그대로 밝힌다 ── */}
      {!run.referenceMapId && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-amber-800 mb-1">
            <AlertCircle size={15} />
            아직 원인은 가릴 수 없어요
          </h3>
          <p className="text-xs text-amber-800 leading-relaxed mb-3">
            이번 결과로는 <b>걸렸다</b>는 것까지만 알 수 있어요.
            그게 그 소리가 원래 어려워서인지, 상황 때문인지는
            압력 사다리(속삭임 → 목소리 → 녹음)를 재봐야 갈립니다.
          </p>
          {onStartSoundMap && (
            <button
              onClick={onStartSoundMap}
              className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors"
            >
              <MapIcon size={14} />
              소리 지도 만들기
            </button>
          )}
        </div>
      )}

      {/* ── 기준 지도가 있을 때: 원래 어려운 소리와 상황 반응을 분리 ── */}
      {run.referenceMapId && run.alreadyHardWords.length > 0 && (
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">상황 탓이 아닌 단어</h3>
          <p className="text-xs text-gray-500 leading-relaxed mb-3">
            이 단어들은 소리 지도에서도 걸렸어요. 상황을 익히기보다
            <b> 발성 방법</b>을 먼저 다뤄야 해서 노출 처방에서 빠집니다.
          </p>
          <WordChips words={run.alreadyHardWords} color={THRESHOLD_META.normal.color} />
        </div>
      )}

      {run.unmatchedWords.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">아직 가릴 수 없는 단어</h3>
          <p className="text-xs text-gray-500 leading-relaxed mb-3">
            소리 지도에 없는 단어예요. 다음 지도를 만들 때
            <b> ‘무서운 단어 추가’</b>에 넣으면 원인을 가릴 수 있어요.
          </p>
          <WordChips words={run.unmatchedWords} color={THRESHOLD_META.unknown.color} />
        </div>
      )}

      {/* ── 노출 처방 ── */}
      {prescriptions.length > 0 && (
        <div className="space-y-3">
          <div className="px-1">
            <h3 className="text-sm font-semibold text-gray-700">🎭 상황 노출 처방</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              소리에는 문제가 없고 상황에만 반응한 단어들이에요.
              {run.referenceMapAt && (
                <span className="text-gray-300">
                  {' '}({format(parseISO(run.referenceMapAt), 'M월 d일', { locale: ko })} 소리 지도 기준)
                </span>
              )}
            </p>
          </div>
          {prescriptions.map(p => (
            <div key={p.scenarioId} className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: meta.color }}>
              <div className="px-4 pt-4 pb-3" style={{ backgroundColor: meta.tint }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: meta.color }} />
                  <span className="text-sm font-semibold text-gray-800">{p.headline}</span>
                </div>
                <p className="text-xs font-medium text-gray-600 mb-1">상황 — {p.scenarioLabel}</p>
                <p className="text-xs text-gray-600 leading-relaxed mb-3">{p.reason}</p>
                <WordChips words={p.words} color={meta.color} />
              </div>

              <div className="px-4 py-3 space-y-3">
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 mb-2">노출 사다리 · 위에서부터 차례로</p>
                  <ol className="space-y-1.5">
                    {p.exposureSteps.map((s, i) => (
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
                  </p>
                </div>

                <div className="pt-1 border-t border-gray-100">
                  <p className="text-[11px] font-semibold text-gray-400 mb-2 mt-2">말하기 직전에 쓸 전략</p>
                  <div className="space-y-2">
                    {p.strategies.map(getStrategy).filter((s): s is Strategy => Boolean(s)).map(s => {
                      const category = STRATEGY_CATEGORIES.find(c => c.id === s.category);
                      return (
                        <button
                          key={s.id}
                          onClick={() => onDetail?.(s)}
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
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 모두 통과했을 때 */}
      {caughtSentences.length === 0 && (
        <div className="bg-teal-50 border border-teal-100 rounded-2xl p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-teal-800 mb-1">
            <MessageSquare size={15} />
            걸린 문장이 없었어요
          </h3>
          <p className="text-xs text-teal-700 leading-relaxed">
            같은 상황을 한 번 더, 조금 더 현실에 가까운 조건에서 해보세요.
            (배경 소음 켜기 · 더 붐비는 시간대 · 실제 상황)
          </p>
        </div>
      )}
    </div>
  );
}

function WordChips({ words, color }: { words: string[]; color: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {words.map(w => (
        <span
          key={w}
          className="text-xs font-medium text-gray-700 rounded-full px-2.5 py-1 border"
          style={{ borderColor: color, backgroundColor: `${color}14` }}
        >
          {w}
        </span>
      ))}
    </div>
  );
}
