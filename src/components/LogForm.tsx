import { useState, FormEvent } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
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

interface SyllablePair {
  syllable: string;
  phoneme: string;
}

const INITIAL_DETAIL = {
  anxietyScore: 5,
  physicalState: '',
  emotionalState: '',
  note: '',
};

interface Props {
  onSubmit: (entry: Omit<LogEntry, 'id' | 'createdAt'>) => void | Promise<void>;
  initialValues?: LogEntry;
  onCancel?: () => void;
}

export default function LogForm({ onSubmit, initialValues, onCancel }: Props) {
  const isEditMode = !!initialValues;

  const [word, setWord] = useState(initialValues?.word ?? '');
  const [syllableInput, setSyllableInput] = useState('');
  const [pairs, setPairs] = useState<SyllablePair[]>(() => {
    if (!initialValues) return [];
    const syls = initialValues.blockedSyllables ?? [];
    const phns = initialValues.phonemes ?? [];
    return syls.map((s, i) => ({ syllable: s, phoneme: phns[i] ?? '' }));
  });
  const [pendingPhoneme, setPendingPhoneme] = useState('');
  const [situations, setSituations] = useState<SituationTag[]>(initialValues?.situations ?? []);
  const [outcome, setOutcome] = useState<OutcomeTag | ''>(initialValues?.outcome ?? '');
  const [showDetail, setShowDetail] = useState(initialValues?.isDetailed ?? false);
  const [detail, setDetail] = useState(() =>
    initialValues
      ? {
          anxietyScore:  initialValues.anxietyScore  ?? 5,
          physicalState:  initialValues.physicalState  ?? '',
          emotionalState: initialValues.emotionalState ?? '',
          note:           initialValues.note           ?? '',
        }
      : INITIAL_DETAIL
  );

  const components = decomposeSyllable(syllableInput);

  const isQuickValid = word.trim() !== '';
  const isFullValid =
    isQuickValid &&
    pairs.length > 0 &&
    pairs.every(p => p.phoneme !== '') &&
    situations.length > 0 &&
    outcome !== '';

  function addPair() {
    if (!syllableInput.trim() || !pendingPhoneme) return;
    setPairs(prev => [...prev, { syllable: syllableInput.trim(), phoneme: pendingPhoneme }]);
    setSyllableInput('');
    setPendingPhoneme('');
  }

  function removePair(idx: number) {
    setPairs(prev => prev.filter((_, i) => i !== idx));
  }

  function toggleSituation(tag: SituationTag) {
    setSituations(prev =>
      prev.includes(tag) ? prev.filter(s => s !== tag) : [...prev, tag]
    );
  }

  function buildEntry(isQuick: boolean): Omit<LogEntry, 'id' | 'createdAt'> {
    return {
      word: word.trim(),
      blockedSyllables: pairs.map(p => p.syllable),
      phonemes: pairs.map(p => p.phoneme),
      situations,
      outcome: isQuick ? '' : outcome,
      isDetailed: showDetail && !isQuick,
      anxietyScore:   showDetail && !isQuick ? detail.anxietyScore : undefined,
      physicalState:  showDetail && !isQuick && detail.physicalState.trim() ? detail.physicalState.trim() : undefined,
      emotionalState: showDetail && !isQuick && detail.emotionalState.trim() ? detail.emotionalState.trim() : undefined,
      note:           showDetail && !isQuick && detail.note.trim() ? detail.note.trim() : undefined,
    };
  }

  function reset() {
    setWord('');
    setSyllableInput('');
    setPairs([]);
    setPendingPhoneme('');
    setSituations([]);
    setOutcome('');
    setShowDetail(false);
    setDetail(INITIAL_DETAIL);
  }

  async function handleQuickSave() {
    if (!isQuickValid) return;
    await onSubmit(buildEntry(true));
    if (!isEditMode) reset();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isFullValid) return;
    await onSubmit(buildEntry(false));
    if (!isEditMode) reset();
  }

  const inputCls = 'w-full rounded-xl bg-gray-100 border-0 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-300';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* ── 막힌 단어 ── */}
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1.5">막힌 단어</label>
        <input
          type="text"
          value={word}
          onChange={e => setWord(e.target.value)}
          placeholder="예: 아메리카노"
          className={inputCls}
        />
        {/* 빠른 저장 버튼 — 단어만 입력해도 바로 저장 */}
        {isQuickValid && !isEditMode && (
          <button
            type="button"
            onClick={handleQuickSave}
            className="mt-2 w-full rounded-xl py-2 text-xs font-semibold bg-teal-50 text-teal-600 border border-teal-200 hover:bg-teal-100 transition-colors"
          >
            ⚡ 빠른 저장 (단어만)
          </button>
        )}
      </div>

      {/* ── 막힌 음절 (다중 추가) ── */}
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1.5">
          막힌 음절 <span className="text-gray-400 font-normal">(여러 개 추가 가능)</span>
        </label>

        {/* 추가된 음절 칩 목록 */}
        {pairs.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {pairs.map((pair, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1.5 bg-teal-50 border border-teal-200 rounded-full pl-3 pr-2 py-1"
              >
                <span className="text-sm font-bold text-teal-700">{pair.syllable}</span>
                <span className="text-xs text-teal-500">{pair.phoneme}</span>
                <button
                  type="button"
                  onClick={() => removePair(idx)}
                  className="text-teal-400 hover:text-red-400 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 음절 입력 + 음소 선택 */}
        <div className="flex gap-2">
          <input
            type="text"
            value={syllableInput}
            onChange={e => {
              setSyllableInput(e.target.value);
              setPendingPhoneme('');
            }}
            maxLength={2}
            placeholder="예: 아"
            className={`${inputCls} flex-1`}
          />
          <button
            type="button"
            onClick={addPair}
            disabled={!syllableInput.trim() || !pendingPhoneme}
            className="flex items-center gap-1 px-3 rounded-xl text-sm font-medium bg-teal-500 text-white disabled:bg-gray-200 disabled:text-gray-400 transition-colors shrink-0"
          >
            <Plus size={15} />
            추가
          </button>
        </div>

        {/* 음소 선택 칩 */}
        {components && (
          <div className="mt-2 bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-2">어느 발음에서 막혔나요?</p>
            <div className="flex gap-2 flex-wrap">
              <PhonemeChip
                phoneme={components.chosung}
                label="초성"
                selected={pendingPhoneme === components.chosung}
                onSelect={() => setPendingPhoneme(components.chosung)}
              />
              <PhonemeChip
                phoneme={components.jungseong}
                label="모음"
                selected={pendingPhoneme === components.jungseong}
                onSelect={() => setPendingPhoneme(components.jungseong)}
              />
              {components.jongseong && (
                <PhonemeChip
                  phoneme={components.jongseong}
                  label="받침"
                  selected={pendingPhoneme === components.jongseong}
                  onSelect={() => setPendingPhoneme(components.jongseong!)}
                />
              )}
            </div>
            {pendingPhoneme && (
              <p className="text-xs text-teal-500 mt-2">
                음소 선택됨 — "추가" 버튼을 눌러 추가하세요
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── 상황 ── */}
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-2">
          상황 <span className="text-gray-400 font-normal">(복수 선택)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {SITUATION_OPTIONS.map(opt => {
            const selected = situations.includes(opt.value);
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

      {/* ── 결과 ── */}
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-2">결과</label>
        <div className="space-y-1.5">
          {OUTCOME_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setOutcome(opt.value)}
              className={[
                'w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all duration-150',
                outcome === opt.value ? opt.active : opt.base,
              ].join(' ')}
            >
              <span className={`shrink-0 w-2.5 h-2.5 rounded-full ${opt.dot}`} />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 상세 기록 토글 ── */}
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

      {/* ── 상세 기록 섹션 ── */}
      {showDetail && (
        <div className="space-y-4 border-t border-gray-100 pt-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-gray-600">긴장도</label>
              <span className="text-lg font-bold text-teal-600 w-6 text-center">{detail.anxietyScore}</span>
            </div>
            <input
              type="range" min={1} max={10}
              value={detail.anxietyScore}
              onChange={e => setDetail(prev => ({ ...prev, anxietyScore: Number(e.target.value) }))}
              className="w-full accent-teal-500"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>1 — 여유</span><span>10 — 극도 긴장</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">
              신체 상태 <span className="text-gray-400 font-normal">(선택)</span>
            </label>
            <input type="text" value={detail.physicalState}
              onChange={e => setDetail(prev => ({ ...prev, physicalState: e.target.value }))}
              placeholder="예: 가슴이 답답함, 숨을 멈춤"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">
              감정 상태 <span className="text-gray-400 font-normal">(선택)</span>
            </label>
            <input type="text" value={detail.emotionalState}
              onChange={e => setDetail(prev => ({ ...prev, emotionalState: e.target.value }))}
              placeholder="예: 미리 겁먹음, 조급함"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">
              메모 <span className="text-gray-400 font-normal">(선택)</span>
            </label>
            <textarea value={detail.note}
              onChange={e => setDetail(prev => ({ ...prev, note: e.target.value }))}
              placeholder="상황, 감정, 시도한 것 등 자유롭게..."
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </div>
        </div>
      )}

      {/* ── 저장 / 취소 ── */}
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
          disabled={!isFullValid}
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
