// 소리 지도 결과 화면 — 압력 임계점 지도 + 단계별 하강 + 조음 히트맵 + 예상 vs 실제.
//
// 색은 심각도(안전 → 압박 반응 → 목소리부터 → 소리 자체)를 나타내는 순서형 팔레트이고,
// 검증 스크립트를 통과한 hex 를 THRESHOLD_META 에서 그대로 쓴다.
// 글자는 항상 먹색(gray-*)을 쓰고, 색은 칩의 배경/테두리와 범례만 담당한다.

import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { MicOff, HelpCircle } from 'lucide-react';
import {
  SoundMapResult, SoundMapCardResult, PressureThreshold,
  THRESHOLD_META, THRESHOLD_ORDER, summarizeSoundMap,
} from '../utils/soundMapResult';
import { SoundKind, KIND_LABEL } from '../data/soundMap';
import ArticulationMap from './ArticulationMap';

const KIND_ORDER: SoundKind[] = ['vowel', 'consonant', 'custom'];

export default function SoundMapResultView({ result }: { result: SoundMapResult }) {
  const t = result.thresholdCounts;
  const broken = t.recording + t.normal + t.whisper;
  const present = THRESHOLD_ORDER.filter(k => t[k] > 0);

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
          소리 {result.totalCards}개 · 무너짐 {broken}개 · 안전 {t.none}개
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
        <p className="text-xs text-gray-400 mb-3">각 소리가 어느 압력에서 처음 무너졌는지예요.</p>

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

      {/* ── 압력 단계별 하강 ── */}
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

      {/* ── 조음 기관 히트맵 (진단 결과와 동일한 지도 재사용) ── */}
      {broken > 0 && (
        <ArticulationMap frequency={result.zoneBlockage} heat />
      )}

      {/* ── 압박 반응형 소리 ── */}
      {result.pressureSensitiveWords.length > 0 && (
        <InsightCard
          threshold="recording"
          title="압박에만 반응한 소리"
          words={result.pressureSensitiveWords}
        />
      )}

      {/* ── 소리 자체가 어려운 소리 ── */}
      {result.hardSoundWords.length > 0 && (
        <InsightCard
          threshold="whisper"
          title="속삭임에서도 걸린 소리"
          words={result.hardSoundWords}
        />
      )}

      {/* ── 예상 vs 실제 ── */}
      {result.overpredictedWords.length > 0 && (
        <div className="bg-teal-50 border border-teal-100 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-teal-800 mb-1">💚 생각보다 잘 나온 소리</h3>
          <p className="text-xs text-teal-700 leading-relaxed mb-3">
            어렵다고 예상했지만 3단계를 모두 통과했어요. 두려움이 실제보다 컸던 소리예요.
          </p>
          <WordChips words={result.overpredictedWords} color={THRESHOLD_META.none.color} />
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
  threshold, title, words,
}: {
  threshold: PressureThreshold;
  title: string;
  words: string[];
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
    </div>
  );
}
