import { useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { LogEntry } from '../types';
import {
  getTrendBuckets, getTrendComparison, countActiveBuckets,
  MIN_COMPARE_SAMPLE, TrendBucket, TrendGranularity,
} from '../utils/trends';

// dataviz 검증 통과 팔레트 (light, surface #ffffff, --pairs all):
// 명도대·채도·CVD 분리·정상시야 분리·대비 6개 체크 전부 PASS.
// 색을 바꿀 때는 scripts/validate_palette.js 를 다시 돌릴 것.
const OVERCOME = '#0d9488';  // 편안함
const BLOCKED  = '#d97706';  // 막힘
const AVOIDED  = '#e11d48';  // 회피

const AXIS_STYLE = { fontSize: 11, fill: '#64748b' };
const SURFACE = '#ffffff';

interface GranularityOption {
  value: TrendGranularity;
  label: string;    // 토글 버튼
  span: string;     // 기간 길이 단위 — "최근 4주" / "최근 3개월"
  bucket: string;   // 구간 이름 — "주별" / "월별"
  next: string;     // 안내 문구 — "다음 주에도" / "다음 달에도"
}

const GRANULARITY_OPTS: GranularityOption[] = [
  { value: 'week',  label: '주간', span: '주',   bucket: '주', next: '다음 주' },
  { value: 'month', label: '월간', span: '개월', bucket: '월', next: '다음 달' },
];

export default function TrendSection({ entries }: { entries: LogEntry[] }) {
  const [granularity, setGranularity] = useState<TrendGranularity>('week');
  const opt = GRANULARITY_OPTS.find(o => o.value === granularity)!;

  const buckets    = useMemo(() => getTrendBuckets(entries, granularity), [entries, granularity]);
  const comparison = useMemo(() => getTrendComparison(entries, granularity), [entries, granularity]);
  const activeBuckets = useMemo(() => countActiveBuckets(entries, granularity), [entries, granularity]);

  // 기록이 한 구간에만 몰려 있으면 아직 "추세"가 아니다.
  const hasTrend = activeBuckets >= 2;

  // 상세 기록에만 있는 값이라 비어 있을 수 있다 — 두 구간 이상 있어야 선으로 읽힌다.
  const fearBuckets = buckets.filter(b => b.avgFear !== null && b.avgDifficulty !== null);
  const showFearTrend = fearBuckets.length >= 2;

  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-700">변화 추이</h3>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {GRANULARITY_OPTS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setGranularity(opt.value)}
              className={[
                'rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-150',
                granularity === opt.value
                  ? 'bg-white text-teal-600 shadow-sm'
                  : 'text-gray-400 hover:text-gray-600',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {!hasTrend ? (
        <p className="text-xs text-gray-400 leading-relaxed mt-2">
          아직 한 {opt.bucket}치 기록만 있어요.
          {' '}{opt.next}에도 기록하면 변화가 보이기 시작합니다.
        </p>
      ) : (
        <>
          <ComparisonRow comparison={comparison} unit={opt.span} />

          <p className="text-xs text-gray-400 mb-2 mt-4">{opt.bucket}별 기록 구성</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={buckets} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
              <YAxis
                tick={AXIS_STYLE}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={40}
              />
              <Tooltip
                cursor={{ fill: '#f1f5f9' }}
                content={<BucketTooltip />}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={value => (
                  <span style={{ fontSize: 11, color: '#64748b' }}>{value}</span>
                )}
              />
              {/* 아래에서 위로 편안함 → 막힘 → 회피. 조각 사이 2px 흰 간격으로 경계를 만든다. */}
              <Bar dataKey="overcome" name="편안함" stackId="s" fill={OVERCOME} stroke={SURFACE} strokeWidth={2} barSize={18} />
              <Bar dataKey="blocked"  name="막힘"   stackId="s" fill={BLOCKED}  stroke={SURFACE} strokeWidth={2} barSize={18} />
              <Bar dataKey="avoided"  name="회피"   stackId="s" fill={AVOIDED}  stroke={SURFACE} strokeWidth={2} barSize={18} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          {showFearTrend && (
            <>
              <p className="text-xs text-gray-400 mb-2 mt-4">긴장과 실제의 간극</p>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={buckets} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                  <YAxis
                    domain={[1, 5]}
                    ticks={[1, 2, 3, 4, 5]}
                    interval={0}          // 없으면 recharts 가 중간 눈금을 임의로 숨긴다
                    tick={AXIS_STYLE}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip content={<FearTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={value => (
                      <span style={{ fontSize: 11, color: '#64748b' }}>{value}</span>
                    )}
                  />
                  {/* 기록 없는 구간은 이어 붙이지 않는다 — 없는 데이터를 있는 것처럼 그리게 된다. */}
                  <Line
                    type="monotone" dataKey="avgFear" name="말하기 전 긴장도"
                    stroke={BLOCKED} strokeWidth={2}
                    dot={{ r: 4, fill: BLOCKED, stroke: SURFACE, strokeWidth: 2 }}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone" dataKey="avgDifficulty" name="실제 체감 어려움"
                    stroke={OVERCOME} strokeWidth={2}
                    dot={{ r: 4, fill: OVERCOME, stroke: SURFACE, strokeWidth: 2 }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-xs text-gray-400 mt-1">
                두 선이 가까워질수록 예상과 실제가 맞아떨어지고 있다는 뜻이에요.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── 최근 구간 vs 직전 구간 비교 ──────────────────────────────
function ComparisonRow({
  comparison, unit,
}: {
  comparison: ReturnType<typeof getTrendComparison>; unit: string;
}) {
  const { span, recent, previous, reliable } = comparison;

  if (!previous) {
    return (
      <p className="text-xs text-gray-400 leading-relaxed mt-1">
        최근 {span}{unit} 동안 {recent.entryCount}개를 기록했어요.
        직전 {span}{unit}치가 쌓이면 두 기간을 비교해 드릴게요.
      </p>
    );
  }

  if (!reliable) {
    return (
      <p className="text-xs text-gray-400 leading-relaxed mt-1">
        두 기간을 비교하려면 각각 {MIN_COMPARE_SAMPLE}개 이상의 기록이 필요해요.
        (최근 {span}{unit} {recent.entryCount}개 · 직전 {span}{unit} {previous.entryCount}개)
      </p>
    );
  }

  return (
    <div className="mt-2">
      <p className="text-xs text-teal-500 mb-2">
        최근 {span}{unit} vs 직전 {span}{unit}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <DeltaCard
          label="회피율"
          from={previous.avoidRate}
          to={recent.avoidRate}
          lowerIsBetter
        />
        <DeltaCard
          label="편안하게 말한 비율"
          from={previous.overcomeRate}
          to={recent.overcomeRate}
        />
      </div>
    </div>
  );
}

function DeltaCard({
  label, from, to, lowerIsBetter = false,
}: {
  label: string; from: number; to: number; lowerIsBetter?: boolean;
}) {
  const delta = to - from;
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  const tone = delta === 0
    ? 'text-gray-400'
    : improved ? 'text-teal-600' : 'text-rose-600';
  const Icon = delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2.5">
      <p className="text-xs text-gray-500">{label}</p>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="text-xs text-gray-400">{from}%</span>
        <span className="text-xs text-gray-300">→</span>
        <span className="text-base font-bold text-gray-800">{to}%</span>
      </div>
      <div className={`flex items-center gap-0.5 mt-0.5 ${tone}`}>
        <Icon size={12} />
        <span className="text-xs font-medium">
          {delta === 0 ? '변화 없음' : `${Math.abs(delta)}%p`}
        </span>
      </div>
    </div>
  );
}

// ── 툴팁 ─────────────────────────────────────────────────
interface TooltipProps {
  active?: boolean;
  payload?: { payload: TrendBucket }[];
}

function TooltipShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 px-3 py-2">
      {children}
    </div>
  );
}

function BucketTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  if (b.total === 0) {
    return <TooltipShell><p className="text-xs text-gray-400">{b.label} · 기록 없음</p></TooltipShell>;
  }
  return (
    <TooltipShell>
      <p className="text-xs font-semibold text-gray-700 mb-1">{b.label} · 총 {b.total}회</p>
      <TooltipRow color={OVERCOME} label="편안함" value={b.overcome} />
      <TooltipRow color={BLOCKED}  label="막힘"   value={b.blocked} />
      <TooltipRow color={AVOIDED}  label="회피"   value={b.avoided} />
      {b.avoidRate !== null && (
        <p className="text-xs text-gray-400 mt-1 pt-1 border-t border-gray-100">
          회피율 {b.avoidRate}%
        </p>
      )}
    </TooltipShell>
  );
}

function FearTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  if (b.avgFear === null && b.avgDifficulty === null) return null;
  return (
    <TooltipShell>
      <p className="text-xs font-semibold text-gray-700 mb-1">{b.label}</p>
      {b.avgFear !== null && (
        <TooltipRow color={BLOCKED} label="긴장도" value={b.avgFear} suffix=" / 5" />
      )}
      {b.avgDifficulty !== null && (
        <TooltipRow color={OVERCOME} label="실제 어려움" value={b.avgDifficulty} suffix=" / 5" />
      )}
    </TooltipShell>
  );
}

function TooltipRow({
  color, label, value, suffix = '회',
}: {
  color: string; label: string; value: number; suffix?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-xs text-gray-500 flex-1">{label}</span>
      <span className="text-xs font-medium text-gray-700">{value}{suffix}</span>
    </div>
  );
}
