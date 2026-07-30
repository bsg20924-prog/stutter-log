// 이번 주 이야기 — 통계 화면 맨 위에서 숫자 대신 문장으로 한 주를 읽힌다.
//
// 렌더 순서가 중요하다: 템플릿 문장을 **먼저 즉시** 보여주고,
// Gemini 문장이 도착하면 그 자리에서 갈아 끼운다.
// 스피너를 두면 오프라인·키 없음일 때 영원히 도는 것처럼 보이고,
// 무엇보다 "Gemini 는 덧붙이는 층"이라는 규칙이 화면에서도 그대로여야 한다.

import { useEffect, useMemo, useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { LogEntry } from '../types';
import {
  computeWeeklyFacts, buildTemplateNarrative, getWeeklyNarrative,
  MIN_WEEKLY_ENTRIES, WeeklyNarrativeResult,
} from '../utils/weeklyNarrative';

export default function WeeklyNarrative({ entries }: { entries: LogEntry[] }) {
  const facts = useMemo(() => computeWeeklyFacts(entries), [entries]);
  const [result, setResult] = useState<WeeklyNarrativeResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    getWeeklyNarrative(entries, new Date(), controller.signal).then(r => {
      if (alive) setResult(r);
    });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [entries]);

  // 이번 주 기록이 아예 없으면 카드 자체를 띄우지 않는다 — 빈 카드는 자리만 차지한다.
  if (facts.total === 0) return null;

  // 기록 2~3건으로 "패턴"을 서술하면 그건 거짓말이다. 건수만 담백하게 알린다.
  if (facts.total < MIN_WEEKLY_ENTRIES) {
    return (
      <Card weekLabel={facts.weekLabel}>
        <p className="text-xs text-gray-400 leading-relaxed">
          이번 주 기록이 아직 적어요. {MIN_WEEKLY_ENTRIES}건부터 한 주를 문장으로 정리해 드릴게요.
          {' '}(현재 {facts.total}건)
        </p>
      </Card>
    );
  }

  // 도착 전에는 템플릿 — 같은 사실에서 나온 문장이라 내용이 뒤집히지 않는다.
  const shown = result?.enough ? result : null;
  const text = shown?.text ?? buildTemplateNarrative(facts);

  // 캐시된 문장을 쓴 뒤 기록이 더 쌓인 경우.
  // 한 주에 한 번만 생성한다는 규칙 때문에 문장은 그대로 두되,
  // 숫자가 언제 기준인지는 밝힌다 — 데이터에 없는 것을 말하지 않기 위해서다.
  const writtenWith = shown?.writtenWithTotal ?? null;
  const stale = writtenWith !== null && writtenWith !== facts.total;

  return (
    <Card weekLabel={facts.weekLabel}>
      <p className="text-xs text-gray-600 leading-relaxed">{text}</p>
      {stale && (
        <p className="text-[11px] text-gray-400 mt-2">
          기록 {writtenWith}건까지로 쓴 문장이에요. 지금은 {facts.total}건이에요.
        </p>
      )}
    </Card>
  );
}

function Card({ weekLabel, children }: { weekLabel: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <NotebookPen size={14} className="shrink-0 text-teal-500" />
        <h3 className="text-sm font-semibold text-gray-700">이번 주 이야기</h3>
        <span className="ml-auto text-[11px] text-gray-400">{weekLabel}</span>
      </div>
      {children}
    </div>
  );
}
