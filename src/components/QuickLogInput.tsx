import { useState, KeyboardEvent, useMemo } from 'react';
import { CornerDownLeft } from 'lucide-react';
import { useLogStore } from '../hooks/useLogStore';
import { decomposeSyllable } from '../utils/korean';
import { LogStatus } from '../types';

const STATUS_OPTS: { value: LogStatus; label: string; cls: string }[] = [
  { value: 'avoided',  label: '회피함', cls: 'bg-slate-500 text-white' },
  { value: 'blocked',  label: '막힘',   cls: 'bg-orange-400 text-white' },
  { value: 'overcome', label: '편안함', cls: 'bg-teal-500 text-white' },
];

function extractSyllables(word: string): string[] {
  const result: string[] = [];
  for (const ch of word) {
    const code = ch.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) result.push(ch);
  }
  return result;
}

export default function QuickLogInput() {
  const [word, setWord] = useState('');
  const [status, setStatus] = useState<LogStatus>('blocked');
  const [selectedSyllable, setSelectedSyllable] = useState<string | null>(null);
  const [selectedPhoneme, setSelectedPhoneme] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addEntry } = useLogStore();

  const syllables = useMemo(() => extractSyllables(word), [word]);
  const components = useMemo(
    () => selectedSyllable ? decomposeSyllable(selectedSyllable) : null,
    [selectedSyllable]
  );

  function handleWordChange(val: string) {
    setWord(val);
    setSelectedSyllable(null);
    setSelectedPhoneme('');
  }

  function handleSyllableTap(syl: string) {
    if (selectedSyllable === syl) {
      setSelectedSyllable(null);
      setSelectedPhoneme('');
    } else {
      setSelectedSyllable(syl);
      setSelectedPhoneme('');
    }
  }

  function handlePhonemeTap(ph: string) {
    setSelectedPhoneme(prev => prev === ph ? '' : ph);
  }

  async function submit() {
    const trimmed = word.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      await addEntry({
        word: trimmed,
        blockedSyllables: selectedSyllable ? [selectedSyllable] : [],
        phonemes: selectedPhoneme ? [selectedPhoneme] : [],
        situations: [],
        outcome: '',
        status,
        isDetailed: false,
      });
      setWord('');
      setSelectedSyllable(null);
      setSelectedPhoneme('');
    } catch {
      // 저장 실패(예: 오프라인) — 입력값은 유지하고 다시 시도할 수 있게 안내
      setError('저장에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
  }

  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] px-4 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-teal-500 shrink-0">간편 기록</p>
        <div className="flex gap-1.5">
          {STATUS_OPTS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatus(opt.value)}
              className={[
                'rounded-full px-2.5 py-0.5 text-xs font-medium transition-all duration-150',
                status === opt.value ? opt.cls : 'bg-gray-100 text-gray-400',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 단어 입력 */}
      <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
        <input
          type="text"
          value={word}
          onChange={e => handleWordChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="막힌 단어만 빠르게 기록 (예: 삼겹살)"
          className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
          disabled={saving}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!word.trim() || saving}
          className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-teal-500 text-white disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
          aria-label="간편 저장"
        >
          <CornerDownLeft size={13} />
        </button>
      </div>

      {error && <p className="text-xs text-red-500 px-1">{error}</p>}

      {/* 음절 칩 */}
      {syllables.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 mb-1.5">막힌 음절 <span className="text-gray-300">(선택)</span></p>
          <div className="flex flex-wrap gap-2">
            {syllables.map((syl, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSyllableTap(syl)}
                className={[
                  'rounded-full px-3 py-1.5 text-sm font-bold transition-all duration-150',
                  selectedSyllable === syl
                    ? 'bg-teal-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                ].join(' ')}
              >
                {syl}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 음소 칩 */}
      {components && (
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-xs text-gray-500 mb-2">어느 발음에서 막혔나요?</p>
          <div className="flex gap-2 flex-wrap">
            <PhonemeChip
              phoneme={components.chosung}
              label="초성"
              selected={selectedPhoneme === components.chosung}
              onSelect={() => handlePhonemeTap(components.chosung)}
            />
            <PhonemeChip
              phoneme={components.jungseong}
              label="중성"
              selected={selectedPhoneme === components.jungseong}
              onSelect={() => handlePhonemeTap(components.jungseong)}
            />
            {components.jongseong && (
              <PhonemeChip
                phoneme={components.jongseong}
                label="받침"
                selected={selectedPhoneme === components.jongseong}
                onSelect={() => handlePhonemeTap(components.jongseong!)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PhonemeChip({ phoneme, label, selected, onSelect }: {
  phoneme: string; label: string; selected: boolean; onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition-all duration-150',
        selected
          ? 'bg-teal-500 text-white shadow-sm'
          : 'bg-white text-gray-700 border border-gray-200 hover:border-teal-300',
      ].join(' ')}
    >
      {phoneme}
      <span className={`text-xs font-normal ${selected ? 'opacity-75' : 'text-gray-400'}`}>
        {label}
      </span>
    </button>
  );
}
