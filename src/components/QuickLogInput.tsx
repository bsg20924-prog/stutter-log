import { useState, KeyboardEvent } from 'react';
import { CornerDownLeft } from 'lucide-react';
import { useLogStore } from '../hooks/useLogStore';

export default function QuickLogInput() {
  const [word, setWord] = useState('');
  const [saving, setSaving] = useState(false);
  const { addEntry } = useLogStore();

  async function submit() {
    const trimmed = word.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    await addEntry({
      word: trimmed,
      blockedSyllables: [],
      phonemes: [],
      situations: [],
      outcome: '',
      isDetailed: false,
    });
    setWord('');
    setSaving(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      submit();
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] px-4 py-3">
      <p className="text-xs font-semibold text-teal-500 mb-2">간편 기록</p>
      <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
        <input
          type="text"
          value={word}
          onChange={e => setWord(e.target.value)}
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
    </div>
  );
}
