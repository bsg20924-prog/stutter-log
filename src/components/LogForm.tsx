import { useState, FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { LogEntry, SituationTag, OutcomeTag } from '../types';
import { decomposeSyllable } from '../utils/korean';

const SITUATION_OPTIONS: { value: SituationTag; label: string }[] = [
  { value: '전화',           label: '전화' },
  { value: '주문/결제',      label: '주문/결제' },
  { value: '발표/자기소개',  label: '발표/자기소개' },
  { value: '낯선사람',       label: '낯선 사람' },
  { value: '지인/가족',      label: '지인/가족' },
  { value: '군_상황',        label: '군 상황' },
  { value: '피곤함/수면부족', label: '피곤/수면부족' },
  { value: '급함/압박감',    label: '급함/압박' },
  { value: '기타',           label: '기타' },
];

const OUTCOME_OPTIONS: {
  value: OutcomeTag;
  label: string;
  dot: string;
  base: string;
  active: string;
}[] = [
  { value: '그대로_자연스럽게',    label: '그대로 자연스럽게',    dot: 'bg-emerald-400', base: 'bg-gray-50 text-gray-500 border border-gray-200',   active: 'bg-emerald-50 text-emerald-700 border border-emerald-300 font-medium' },
  { value: '막혔지만_끝까지_말함', label: '막혔지만 끝까지 말함', dot: 'bg-yellow-400',  base: 'bg-gray-50 text-gray-500 border border-gray-200',   active: 'bg-yellow-50 text-yellow-700 border border-yellow-300 font-medium' },
  { value: '다른_단어로_바꿈',     label: '다른 단어로 바꿈',     dot: 'bg-orange-400',  base: 'bg-gray-50 text-gray-500 border border-gray-200',   active: 'bg-orange-50 text-orange-700 border border-orange-300 font-medium' },
  { value: '우회해서_말함',        label: '우회해서 말함',        dot: 'bg-orange-400',  base: 'bg-gray-50 text-gray-500 border border-gray-200',   active: 'bg-orange-50 text-orange-700 border border-orange-300 font-medium' },
  { value: '상대가_대신_말함',     label: '상대가 대신 말함',     dot: 'bg-red-400',     base: 'bg-gray-50 text-gray-500 border border-gray-200',   active: 'bg-red-50 text-red-700 border border-red-300 font-medium' },
  { value: '중간에_포기함',        label: '중간에 포기함',        dot: 'bg-red-400',     base: 'bg-gray-50 text-gray-500 border border-gray-200',   active: 'bg-red-50 text-red-700 border border-red-300 font-medium' },
  { value: '아예_회피함',          label: '아예 회피함',          dot: 'bg-red-600',     base: 'bg-gray-50 text-gray-500 border border-gray-200',   active: 'bg-red-100 text-red-800 border border-red-400 font-semibold' },
];

const INITIAL_FORM = {
  word: '',
  blockedSyllable: '',
  phoneme: '',
  situations: [] as SituationTag[],
  outcome: '' as OutcomeTag | '',
};

const INITIAL_DETAIL = {
  anxietyScore: 5,
  physicalState: '',
  emotionalState: '',
  note: '',
};

interface Props {
  onSubmit: (entry: Omit<LogEntry, 'id' | 'createdAt'>) => void;
  initialValues?: LogEntry;
  onCancel?: () => void;
}

export default function LogForm({ onSubmit, initialValues, onCancel }: Props) {
  const isEditMode = initialValues !== undefined;

  const [form, setForm] = useState(() =>
    initialValues
      ? {
          word:            initialValues.word,
          blockedSyllable: initialValues.blockedSyllable,
          phoneme:         initialValues.phoneme,
          situations:      initialValues.situations,
          outcome:         initialValues.outcome as OutcomeTag | '',
        }
      : INITIAL_FORM
  );
  const [detail, setDetail] = useState(() =>
    initialValues
      ? {
          anxietyScore:  initialValues.anxietyScore ?? 5,
          physicalState:  initialValues.physicalState  ?? '',
          emotionalState: initialValues.emotionalState ?? '',
          note:           initialValues.note           ?? '',
        }
      : INITIAL_DETAIL
  );
  const [showDetail, setShowDetail] = useState(initialValues?.isDetailed ?? false);

  // 음절 분해 (파생 상태)
  const components = decomposeSyllable(form.blockedSyllable);

  const isValid =
    form.word.trim() !== '' &&
    form.blockedSyllable.trim() !== '' &&
    form.phoneme !== '' &&
    form.situations.length > 0 &&
    form.outcome !== '';

  function toggleSituation(tag: SituationTag) {
    setForm(prev => ({
      ...prev,
      situations: prev.situations.includes(tag)
        ? prev.situations.filter(s => s !== tag)
        : [...prev.situations, tag],
    }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    onSubmit({
      word:            form.word.trim(),
      blockedSyllable: form.blockedSyllable.trim(),
      phoneme:         form.phoneme,
      situations:      form.situations,
      outcome:         form.outcome as OutcomeTag,
      isDetailed:      showDetail,
      anxietyScore:    showDetail ? detail.anxietyScore : undefined,
      physicalState:   showDetail && detail.physicalState.trim() ? detail.physicalState.trim() : undefined,
      emotionalState:  showDetail && detail.emotionalState.trim() ? detail.emotionalState.trim() : undefined,
      note:            showDetail && detail.note.trim() ? detail.note.trim() : undefined,
    });
    if (!isEditMode) {
      setForm(INITIAL_FORM);
      setDetail(INITIAL_DETAIL);
      setShowDetail(false);
    }
  }

  const inputCls = 'w-full rounded-xl bg-gray-100 border-0 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-300';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* 막힌 단어 */}
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1.5">막힌 단어</label>
        <input
          type="text"
          value={form.word}
          onChange={e => setForm(prev => ({ ...prev, word: e.target.value }))}
          placeholder="예: 아메리카노"
          className={inputCls}
        />
      </div>

      {/* 막힌 음절 + 음소 선택 */}
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1.5">막힌 음절</label>
        <input
          type="text"
          value={form.blockedSyllable}
          onChange={e => setForm(prev => ({
            ...prev,
            blockedSyllable: e.target.value,
            phoneme: '',          // 음절 바뀌면 선택 초기화
          }))}
          maxLength={2}
          placeholder="예: 삼"
          className={inputCls}
        />

        {/* 음소 선택 칩 — 음절이 분해됐을 때만 표시 */}
        {components && (
          <div className="mt-3 bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-2.5">
              어느 발음에서 막혔나요?
            </p>
            <div className="flex gap-2 flex-wrap">
              {/* 초성 */}
              <PhonemeChip
                phoneme={components.chosung}
                label="초성"
                selected={form.phoneme === components.chosung}
                onSelect={() => setForm(prev => ({ ...prev, phoneme: components.chosung }))}
              />
              {/* 중성 */}
              <PhonemeChip
                phoneme={components.jungseong}
                label="모음"
                selected={form.phoneme === components.jungseong}
                onSelect={() => setForm(prev => ({ ...prev, phoneme: components.jungseong }))}
              />
              {/* 종성 (받침 있을 때만) */}
              {components.jongseong && (
                <PhonemeChip
                  phoneme={components.jongseong}
                  label="받침"
                  selected={form.phoneme === components.jongseong}
                  onSelect={() => setForm(prev => ({ ...prev, phoneme: components.jongseong! }))}
                />
              )}
            </div>
            {form.phoneme === '' && (
              <p className="text-xs text-amber-500 mt-2">하나를 선택해 주세요</p>
            )}
          </div>
        )}
      </div>

      {/* 상황 — 칩 다중 선택 */}
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-2">
          상황 <span className="text-gray-400 font-normal">(복수 선택)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {SITUATION_OPTIONS.map(opt => {
            const selected = form.situations.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleSituation(opt.value)}
                className={[
                  'rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-150',
                  selected ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-500',
                ].join(' ')}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 결과 — 세로 리스트 */}
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-2">결과</label>
        <div className="space-y-1.5">
          {OUTCOME_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setForm(prev => ({ ...prev, outcome: opt.value }))}
              className={[
                'w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all duration-150',
                form.outcome === opt.value ? opt.active : opt.base,
              ].join(' ')}
            >
              <span className={`shrink-0 w-2.5 h-2.5 rounded-full ${opt.dot}`} />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 상세 기록 토글 */}
      <button
        type="button"
        onClick={() => setShowDetail(prev => !prev)}
        className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-gray-400 hover:text-teal-500 transition-colors"
      >
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${showDetail ? 'rotate-180' : ''}`}
        />
        {showDetail ? '상세 기록 닫기' : '상세 기록 추가'}
      </button>

      {/* 상세 기록 섹션 */}
      {showDetail && (
        <div className="space-y-4 border-t border-gray-100 pt-4">

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-gray-600">긴장도</label>
              <span className="text-lg font-bold text-teal-600 w-6 text-center">{detail.anxietyScore}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={detail.anxietyScore}
              onChange={e => setDetail(prev => ({ ...prev, anxietyScore: Number(e.target.value) }))}
              className="w-full accent-teal-500"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>1 — 여유</span>
              <span>10 — 극도 긴장</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">
              신체 상태 <span className="text-gray-400 font-normal">(선택)</span>
            </label>
            <input
              type="text"
              value={detail.physicalState}
              onChange={e => setDetail(prev => ({ ...prev, physicalState: e.target.value }))}
              placeholder="예: 가슴이 답답함, 숨을 멈춤"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">
              감정 상태 <span className="text-gray-400 font-normal">(선택)</span>
            </label>
            <input
              type="text"
              value={detail.emotionalState}
              onChange={e => setDetail(prev => ({ ...prev, emotionalState: e.target.value }))}
              placeholder="예: 미리 겁먹음, 조급함"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">
              메모 <span className="text-gray-400 font-normal">(선택)</span>
            </label>
            <textarea
              value={detail.note}
              onChange={e => setDetail(prev => ({ ...prev, note: e.target.value }))}
              placeholder="상황, 감정, 시도한 것 등 자유롭게..."
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </div>

        </div>
      )}

      {/* 저장 / 취소 */}
      <div className={isEditMode ? 'flex gap-2' : ''}>
        {isEditMode && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl py-3 text-sm font-semibold bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
          >
            취소
          </button>
        )}
        <button
          type="submit"
          disabled={!isValid}
          className={[
            'rounded-xl py-3 text-sm font-semibold transition-colors',
            isEditMode ? 'flex-1' : 'w-full',
            'bg-teal-500 text-white hover:bg-teal-600',
            'disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          {isEditMode ? '수정 완료' : '저장하기'}
        </button>
      </div>

    </form>
  );
}

// ── 음소 칩 컴포넌트 ──────────────────────────────────────────
function PhonemeChip({
  phoneme, label, selected, onSelect,
}: {
  phoneme: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition-all duration-150',
        selected
          ? 'bg-teal-500 text-white shadow-sm'
          : 'bg-white text-gray-700 border border-gray-200 hover:border-teal-300 hover:text-teal-600',
      ].join(' ')}
    >
      {phoneme}
      <span className={`text-xs font-normal ${selected ? 'opacity-75' : 'text-gray-400'}`}>
        {label}
      </span>
    </button>
  );
}
