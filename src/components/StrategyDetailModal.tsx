import { X } from 'lucide-react';
import {
  Strategy,
  STRATEGY_CATEGORIES,
  TEMPORARY_STARTER_TAG,
  TEMPORARY_STARTER_WARNING,
} from '../data/strategies';

// 전략 상세 모달 — 설명 / 바로 실행 가이드 / 예시 / 임시 시동용 경고
export default function StrategyDetailModal({
  strategy, onClose,
}: {
  strategy: Strategy;
  onClose: () => void;
}) {
  const category = STRATEGY_CATEGORIES.find(c => c.id === strategy.category);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl max-h-[85dvh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="sticky top-0 bg-white flex items-start gap-2 px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            {category && (
              <p className="text-xs text-gray-400 mb-0.5">
                {category.emoji} {category.name}
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-gray-800">{strategy.name}</h3>
              {strategy.isTemporaryStarter && (
                <span className="text-[10px] font-medium text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5">
                  {TEMPORARY_STARTER_TAG}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* 설명 */}
          <p className="text-sm text-gray-600 leading-relaxed">{strategy.description}</p>

          {/* 바로 실행 */}
          <div className="bg-teal-50 rounded-2xl px-4 py-3">
            <p className="text-xs font-semibold text-teal-600 mb-1">👉 바로 실행</p>
            <p className="text-sm text-teal-800 leading-relaxed">{strategy.actionGuide}</p>
          </div>

          {/* 예시 */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">예시</p>
            <ul className="space-y-1.5">
              {strategy.examples.map((ex, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-600 leading-relaxed">
                  <span className="text-teal-400 shrink-0">·</span>
                  <span>{ex}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 임시 시동용 경고 */}
          {strategy.isTemporaryStarter && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
              <p className="text-xs text-amber-700 leading-relaxed">
                ⚠️ {TEMPORARY_STARTER_WARNING}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
