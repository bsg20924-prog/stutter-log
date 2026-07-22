import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Info, Timer } from 'lucide-react';
import { DiagnosticResult, summarizeResult, getZoneInterpretation } from '../utils/diagnostic';
import { getStrategy, Strategy, STRATEGY_CATEGORIES, TEMPORARY_STARTER_TAG } from '../data/strategies';
import StrategyDetailModal from './StrategyDetailModal';
import QuickPracticeModal from './QuickPracticeModal';
import ArticulationMap from './ArticulationMap';

function rateStyle(rate: number): { bar: string; text: string } {
  if (rate >= 0.6) return { bar: 'bg-red-400', text: 'text-red-500' };
  if (rate >= 0.35) return { bar: 'bg-amber-400', text: 'text-amber-500' };
  return { bar: 'bg-teal-400', text: 'text-teal-600' };
}

const LANGUAGE_LABEL = { ko: '한국어', en: 'English', unified: '통합' } as const;

export default function DiagnosticResultView({ result }: { result: DiagnosticResult }) {
  const [detail, setDetail] = useState<Strategy | null>(null);
  const [practice, setPractice] = useState<Strategy | null>(null);

  // 예전 기록에는 blockedWords 가 없을 수 있음
  const blockedWords = result.blockedWords ?? [];

  const overallPct = Math.round(result.overallRate * 100);
  const overallStyle = rateStyle(result.overallRate);
  const recommended = result.recommendedStrategies
    .map(getStrategy)
    .filter((s): s is Strategy => Boolean(s));

  // 예전 기록에는 zoneBlockage 가 없을 수 있으므로 방어적으로 처리
  const zoneBlockage = result.zoneBlockage;
  const interpretation = zoneBlockage ? getZoneInterpretation(zoneBlockage) : null;

  return (
    <div className="space-y-4">
      {/* 요약 카드 */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-400">
            {LANGUAGE_LABEL[result.language]} 진단
          </span>
          <span className="text-xs text-gray-300">
            {format(parseISO(result.createdAt), 'M월 d일 HH:mm', { locale: ko })}
          </span>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <p className={`text-3xl font-bold ${overallStyle.text}`}>{overallPct}%</p>
            <p className="text-xs text-gray-400 mt-0.5">전체 막힘률</p>
          </div>
          <p className="text-sm text-gray-600 leading-snug pb-1">{summarizeResult(result)}</p>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          답변 {result.answered}개 · 막힘 {result.blocked}개 · 건너뜀 {result.skipped}개
        </p>
      </div>

      {/* 음성 유형별 막힘 밀도 */}
      {result.groupStats.length > 0 && (
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">음성 유형별 막힘 밀도</h3>
          <div className="space-y-3">
            {result.groupStats.map(g => {
              const pct = Math.round(g.rate * 100);
              const style = rateStyle(g.rate);
              return (
                <div key={g.groupId}>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700">{g.label}</span>
                    <span className={`text-xs font-semibold ${style.text}`}>
                      {pct}% <span className="text-gray-400 font-normal">({g.blocked}/{g.answered})</span>
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${style.bar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 발음 기관 히트맵 — 진단 막힘 위치를 빨강/주황으로 표시 */}
      {zoneBlockage && result.blocked > 0 && (
        <div className="space-y-2">
          <ArticulationMap frequency={zoneBlockage} heat />
          {interpretation && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3">
              <p className="text-xs text-orange-800 leading-relaxed">
                🔥 {interpretation.text}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 맞춤 실전 전략 */}
      {recommended.length > 0 && (
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">🎯 추천 실전 전략</h3>
          <p className="text-xs text-teal-500 mb-3">진단 패턴에 맞춰 골라낸 전략이에요. 카드를 눌러 방법을 확인하세요.</p>
          <div className="space-y-3">
            {recommended.map(s => {
              const category = STRATEGY_CATEGORIES.find(c => c.id === s.category);
              return (
                <div key={s.id} className="bg-gray-50 rounded-2xl overflow-hidden">
                  {/* 전략 설명 열기 */}
                  <button
                    type="button"
                    onClick={() => setDetail(s)}
                    className="w-full text-left px-4 py-3 hover:bg-teal-50/60 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">{category?.emoji}</span>
                      <span className="text-sm font-semibold text-gray-800">{s.name}</span>
                      {s.isTemporaryStarter && (
                        <span className="text-[10px] font-medium text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5">
                          {TEMPORARY_STARTER_TAG}
                        </span>
                      )}
                      <Info size={15} className="ml-auto text-gray-300 shrink-0" />
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{s.actionGuide}</p>
                  </button>
                  {/* 10초 연습 */}
                  <button
                    type="button"
                    onClick={() => setPractice(s)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-teal-600 bg-teal-50 hover:bg-teal-100 border-t border-teal-100 transition-colors"
                  >
                    <Timer size={14} />
                    🎯 지금 10초 연습하기
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {detail && <StrategyDetailModal strategy={detail} onClose={() => setDetail(null)} />}
      {practice && (
        <QuickPracticeModal
          strategy={practice}
          blockedWords={blockedWords}
          onClose={() => setPractice(null)}
        />
      )}
    </div>
  );
}
