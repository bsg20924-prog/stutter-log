import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, Legend,
  ResponsiveContainer,
} from 'recharts';
import { useLogStore } from '../hooks/useLogStore';
import { OutcomeTag } from '../types';
import { getSituationStats, getOutcomeDistribution } from '../utils/analytics';
import { getZoneFrequency } from '../utils/phonetics';
import ArticulationMap from './ArticulationMap';

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

  const situationData = useMemo(() => getSituationStats(entries), [entries]);
  const outcomeRaw    = useMemo(() => getOutcomeDistribution(entries), [entries]);
  const zoneFreq      = useMemo(
    () => getZoneFrequency(entries.map(e => e.phoneme).filter(Boolean)),
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

  const total   = entries.length;
  const success = outcomeRaw.filter(d => SUCCESS_OUTCOMES.has(d.outcome)).reduce((s, d) => s + d.count, 0);
  const detour  = outcomeRaw.filter(d => DETOUR_OUTCOMES.has(d.outcome)).reduce((s, d) => s + d.count, 0);
  const avoid   = outcomeRaw.filter(d => AVOID_OUTCOMES.has(d.outcome)).reduce((s, d) => s + d.count, 0);

  const avoidRate   = Math.round((avoid   / total) * 100);
  const successRate = Math.round((success / total) * 100);
  const detourRate  = Math.round((detour  / total) * 100);

  const pieData = [
    { name: '성공', value: success, color: '#2dd4bf' },
    { name: '우회', value: detour,  color: '#fb923c' },
    { name: '회피', value: avoid,   color: '#f87171' },
  ].filter(d => d.value > 0);

  const topSituation = situationData[0];

  return (
    <div className="space-y-4">

      {/* 발음 기관 히트맵 — 최상단 */}
      <ArticulationMap frequency={zoneFreq} />

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '총 기록',  value: `${total}회` },
          { label: '성공률',   value: `${successRate}%` },
          { label: '회피율',   value: `${avoidRate}%` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-3 text-center">
            <p className="text-xl font-bold text-teal-600">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* 결과 분포 — 도넛 PieChart */}
      {pieData.length > 0 && (
        <ChartSection
          title="결과 분포"
          insight={`성공 ${successRate}% · 우회 ${detourRate}% · 회피 ${avoidRate}%`}
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

    </div>
  );
}
