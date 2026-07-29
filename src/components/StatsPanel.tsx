import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, Legend,
  ResponsiveContainer,
} from 'recharts';
import { useLogStore } from '../hooks/useLogStore';
import { OutcomeTag } from '../types';
import {
  getSituationStats, getOutcomeDistribution,
  getFearGapStats, getTacticInsights,
} from '../utils/analytics';
import { getZoneFrequency } from '../utils/phonetics';
import { getTacticLabel } from '../data/strategies';
import ArticulationMap from './ArticulationMap';
import TrendSection from './TrendSection';

const CHART_STYLE = { fontSize: 11, fill: '#64748b' };

const SUCCESS_OUTCOMES = new Set<OutcomeTag>(['그대로_자연스럽게', '막혔지만_끝까지_말함']);
const DETOUR_OUTCOMES  = new Set<OutcomeTag>(['다른_단어로_바꿈', '우회해서_말함']);
const AVOID_OUTCOMES   = new Set<OutcomeTag>(['상대가_대신_말함', '중간에_포기함', '아예_회피함']);

function ChartSection({
  title, insight, children,
}: {
  title: string; insight: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">{title}</h3>
      <p className="text-xs text-teal-500 mb-3">{insight}</p>
      {children}
    </div>
  );
}

export default function StatsPanel() {
  const { entries } = useLogStore();

  const situationData  = useMemo(() => getSituationStats(entries), [entries]);
  const outcomeRaw     = useMemo(() => getOutcomeDistribution(entries), [entries]);
  const fearGapStats   = useMemo(() => getFearGapStats(entries), [entries]);
  const tacticInsights = useMemo(() => getTacticInsights(entries), [entries]);
  const zoneFreq       = useMemo(
    () => getZoneFrequency(entries.flatMap(e => e.phonemes ?? []).filter(Boolean)),
    [entries]
  );

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <p className="text-4xl mb-3">📊</p>
        <p className="text-sm">기록이 쌓이면 인사이트가 표시됩니다.</p>
      </div>
    );
  }

  const total = entries.length;

  // 요약 카드는 status 기준 — outcome 은 상세 기록에만 있어서
  // 간편 기록(3탭 경로)이 통째로 빠지면 비율이 0% 로 보인다.
  const overcomeCount = entries.filter(e => e.status === 'overcome').length;
  const avoidedCount  = entries.filter(e => e.status === 'avoided').length;
  const successRate = Math.round((overcomeCount / total) * 100);
  const avoidRate   = Math.round((avoidedCount  / total) * 100);

  // 결과 분포(도넛)는 outcome 기준 그대로 — 대신 분모를 상세 기록 수로 잡는다.
  const success = outcomeRaw.filter(d => SUCCESS_OUTCOMES.has(d.outcome)).reduce((s, d) => s + d.count, 0);
  const detour  = outcomeRaw.filter(d => DETOUR_OUTCOMES.has(d.outcome)).reduce((s, d) => s + d.count, 0);
  const avoid   = outcomeRaw.filter(d => AVOID_OUTCOMES.has(d.outcome)).reduce((s, d) => s + d.count, 0);
  const outcomeTotal = success + detour + avoid;

  const pct = (n: number) => outcomeTotal > 0 ? Math.round((n / outcomeTotal) * 100) : 0;

  const pieData = [
    { name: '성공', value: success, color: '#0d9488' },
    { name: '우회', value: detour,  color: '#d97706' },
    { name: '회피', value: avoid,   color: '#e11d48' },
  ].filter(d => d.value > 0);

  const topSituation = situationData[0];

  return (
    <div className="space-y-4">

      {/* 발음 기관 히트맵 — 최상단 */}
      <ArticulationMap frequency={zoneFreq} />

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '총 기록',    value: `${total}회` },
          { label: '편안함 비율', value: `${successRate}%` },
          { label: '회피율',     value: `${avoidRate}%` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-3 text-center">
            <p className="text-xl font-bold text-teal-600">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* 변화 추이 — 주/월 구간별 구성과 기간 비교 */}
      <TrendSection entries={entries} />

      {/* 결과 분포 — 도넛 PieChart */}
      {pieData.length > 0 && (
        <ChartSection
          title="결과 분포"
          insight={`성공 ${pct(success)}% · 우회 ${pct(detour)}% · 회피 ${pct(avoid)}% — 결과를 고른 기록 ${outcomeTotal}개 기준`}
        >
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => [`${v}회`, '']} />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value) => (
                  <span style={{ fontSize: 11, color: '#64748b' }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartSection>
      )}

      {/* 상황별 발생 횟수 */}
      {situationData.length > 0 && (
        <ChartSection
          title="상황별 발생 횟수"
          insight={
            topSituation
              ? `'${topSituation.situation}' 상황이 가장 많음 · 회피율 ${topSituation.avoidRate}%`
              : ''
          }
        >
          <ResponsiveContainer width="100%" height={situationData.length * 32 + 16}>
            <BarChart data={situationData} layout="vertical" margin={{ left: 4, right: 16 }}>
              <XAxis type="number" tick={CHART_STYLE} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="situation" width={72} tick={CHART_STYLE} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="count" name="횟수" fill="#5eead4" radius={[0, 4, 4, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </ChartSection>
      )}

      {/* 심리적 간극 */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">심리적 간극</h3>
        {fearGapStats.sampleSize < 3 ? (
          <p className="text-xs text-gray-400 leading-relaxed">
            데이터가 더 쌓이면 긴장과 실제 경험의 차이를 볼 수 있습니다.
            {fearGapStats.sampleSize > 0 && ` (현재 ${fearGapStats.sampleSize}개)`}
          </p>
        ) : (
          <div className="space-y-3 mt-2">
            <p className="text-xs text-teal-500 mb-3">
              {fearGapStats.averageFear > fearGapStats.averageDifficulty
                ? '실제보다 더 크게 긴장했던 경우가 많아요.'
                : fearGapStats.averageFear < fearGapStats.averageDifficulty
                ? '예상보다 실제 어려움이 더 컸던 경우가 많아요.'
                : '예상과 실제가 비슷하게 기록되었어요.'}
            </p>
            <FearBar label="말하기 전 긴장도" value={fearGapStats.averageFear} color="bg-orange-300" />
            <FearBar label="실제 체감 어려움" value={fearGapStats.averageDifficulty} color="bg-teal-300" />
            <p className="text-xs text-gray-400 mt-1">{fearGapStats.sampleSize}개 기록 기준</p>
          </div>
        )}
      </div>

      {/* 자주 도움된 전략 */}
      {tacticInsights.length > 0 && (
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">자주 도움된 전략</h3>
          <p className="text-xs text-teal-500 mb-3">편안한 흐름과 함께 기록된 전략들이에요.</p>
          <div className="space-y-3">
            {tacticInsights.map(t => {
              const label = getTacticLabel(t.tactic);
              const pct = Math.round(t.comfortableRatio * 100);
              return (
                <div key={t.tactic}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700">{label}</span>
                    <span className="text-xs text-gray-400">{t.usageCount}회 사용</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-400 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {t.comfortableCount > 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      '{label}' 전략은 편안한 흐름과 함께 {t.comfortableCount}번 기록되었습니다.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}

function FearBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round((value / 5) * 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-600">{label}</span>
        <span className="text-xs font-semibold text-gray-700">{value} / 5</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
