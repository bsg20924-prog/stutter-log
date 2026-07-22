import { useState } from 'react';
import { ChevronDown, Info, X, Check } from 'lucide-react';
import { StrategyId, TacticTag, StrategyCategoryId } from '../types';
import {
  STRATEGIES,
  STRATEGY_CATEGORIES,
  Strategy,
  getStrategy,
  getTacticLabel,
  TEMPORARY_STARTER_TAG,
  TEMPORARY_STARTER_WARNING,
} from '../data/strategies';
import StrategyDetailModal from './StrategyDetailModal';

const KNOWN_IDS = new Set<string>(STRATEGIES.map(s => s.id));

interface Props {
  selected: TacticTag[];
  onToggle: (id: StrategyId) => void;
}

export default function StrategyPicker({ selected, onToggle }: Props) {
  const [openCategory, setOpenCategory] = useState<StrategyCategoryId | null>(
    STRATEGY_CATEGORIES[0].id
  );
  const [detail, setDetail] = useState<Strategy | null>(null);

  const selectedSet = new Set(selected);
  // 신규 전략 목록에 없는(과거 버전) 선택값 — 편집 시에도 잃지 않도록 별도 표시
  const legacySelected = selected.filter(id => !KNOWN_IDS.has(id));

  return (
    <div className="space-y-2">
      {STRATEGY_CATEGORIES.map(cat => {
        const items = STRATEGIES.filter(s => s.category === cat.id);
        const isOpen = openCategory === cat.id;
        const selectedCount = items.filter(s => selectedSet.has(s.id)).length;

        return (
          <div key={cat.id} className="rounded-xl border border-gray-100 overflow-hidden">
            {/* 카테고리 헤더 */}
            <button
              type="button"
              onClick={() => setOpenCategory(prev => (prev === cat.id ? null : cat.id))}
              className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <span className="text-base">{cat.emoji}</span>
              <span className="text-sm font-semibold text-gray-700">{cat.name}</span>
              <span className="text-xs text-gray-400">{cat.subtitle}</span>
              {selectedCount > 0 && (
                <span className="text-xs font-medium text-teal-600 bg-teal-50 rounded-full px-1.5 py-0.5">
                  {selectedCount}
                </span>
              )}
              <ChevronDown
                size={16}
                className={`ml-auto text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {/* 전략 목록 */}
            {isOpen && (
              <div className="p-2 space-y-1.5 bg-white">
                {items.map(s => {
                  const active = selectedSet.has(s.id);
                  return (
                    <div
                      key={s.id}
                      className={[
                        'flex items-center gap-2 rounded-xl px-3 py-2 transition-all duration-150 border',
                        active
                          ? 'bg-teal-50 border-teal-300'
                          : 'bg-gray-50 border-transparent hover:bg-gray-100',
                      ].join(' ')}
                    >
                      {/* 선택 토글 (행 대부분) */}
                      <button
                        type="button"
                        onClick={() => onToggle(s.id)}
                        className="flex items-center gap-2 flex-1 text-left min-w-0"
                      >
                        <span
                          className={[
                            'shrink-0 w-4 h-4 rounded-md border flex items-center justify-center',
                            active ? 'bg-teal-500 border-teal-500' : 'border-gray-300 bg-white',
                          ].join(' ')}
                        >
                          {active && <Check size={12} className="text-white" />}
                        </span>
                        <span
                          className={`text-sm font-medium truncate ${active ? 'text-teal-700' : 'text-gray-700'}`}
                        >
                          {s.name}
                        </span>
                        {s.isTemporaryStarter && (
                          <span
                            title={TEMPORARY_STARTER_WARNING}
                            className="shrink-0 text-[10px] font-medium text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5"
                          >
                            {TEMPORARY_STARTER_TAG}
                          </span>
                        )}
                      </button>

                      {/* 정보 버튼 */}
                      <button
                        type="button"
                        onClick={() => setDetail(s)}
                        className="shrink-0 text-gray-300 hover:text-teal-500 transition-colors"
                        aria-label={`${s.name} 설명 보기`}
                      >
                        <Info size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* 과거 버전에서 기록된 전략 (편집 시 보존) */}
      {legacySelected.length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
          <p className="text-xs text-gray-400 mb-1.5">이전에 기록된 전략</p>
          <div className="flex flex-wrap gap-1.5">
            {legacySelected.map(id => (
              <span
                key={id}
                className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-full pl-2.5 pr-1.5 py-1"
              >
                {getTacticLabel(id)}
                <button
                  type="button"
                  onClick={() => onToggle(id as StrategyId)}
                  className="text-gray-300 hover:text-red-400 transition-colors"
                  aria-label={`${getTacticLabel(id)} 제거`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {detail && <StrategyDetailModal strategy={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

// 다른 컴포넌트에서 라벨 조회 시 재사용
export { getStrategy, getTacticLabel };
