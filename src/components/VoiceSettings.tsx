// 상대 목소리 고르기.
//
// 기기마다 한국어 음성이 여러 개 있고 품질 차이가 크다.
// 자동으로는 '신경망 > 고품질 로컬 > 기본' 순으로 고르지만, 어느 게 사람처럼
// 들리는지는 결국 들어봐야 안다 — 그래서 직접 고르고 미리 들을 수 있게 한다.

import { useState, useEffect } from 'react';
import { Volume2, Check, Sparkles, Loader2 } from 'lucide-react';
import {
  listKoreanVoices, getPreferredVoiceName, setPreferredVoiceName,
  currentVoiceName, warmUpVoices, speakPrompt,
} from '../utils/speech';
import {
  GEMINI_VOICES, isGeminiTtsOn, setGeminiTtsOn,
  getFixedVoice, setFixedVoice, generateTts, clearTtsCache,
} from '../utils/geminiTts';
import { hasGeminiKey, getGeminiKey } from '../utils/gemini';

const SAMPLE = '주문 도와드릴까요?';

export default function VoiceSettings() {
  const [voices, setVoices] = useState(listKoreanVoices());
  const [selected, setSelected] = useState(getPreferredVoiceName());
  const [auto, setAuto] = useState(currentVoiceName());
  const [aiOn, setAiOn] = useState(isGeminiTtsOn());
  const [aiVoice, setAiVoice] = useState(getFixedVoice());   // '' = 상황별 자동
  const [previewing, setPreviewing] = useState('');
  const canUseAi = hasGeminiKey();

  // 음성 목록은 비동기로 채워진다 — 준비되면 다시 읽는다.
  useEffect(() => warmUpVoices(() => {
    setVoices(listKoreanVoices());
    setAuto(currentVoiceName());
  }), []);

  function choose(name: string) {
    setPreferredVoiceName(name);
    setSelected(name);
    setAuto(currentVoiceName());
    // ⚠️ 버튼 핸들러 안에서 바로 재생해야 iOS 가 허용한다.
    speakPrompt(SAMPLE, () => {});
  }

  async function chooseAiVoice(id: string, scenarioId?: string) {
    if (id !== aiVoice) {
      clearTtsCache();          // 목소리가 바뀌면 이전 캐시는 쓸모없다
      setFixedVoice(id);
      setAiVoice(id);
    }
    setPreviewing(id || 'auto');
    const url = await generateTts(SAMPLE, getGeminiKey(), scenarioId);
    setPreviewing('');
    if (url) void new Audio(url).play().catch(() => {});
  }

  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1">
        <Volume2 size={15} className="text-teal-500" />
        상대 목소리 <span className="text-gray-400 font-normal">(선택)</span>
      </p>
      <p className="text-xs text-gray-400 leading-relaxed mb-3">
        누르면 <b className="text-gray-500">“{SAMPLE}”</b> 로 미리 들려드려요.
        <br />
        ✨ 표시는 더 자연스러운 음성이에요.
      </p>

      {/* AI 음성 — 키가 있을 때만 */}
      {canUseAi && (
        <div className="mb-3 pb-3 border-b border-gray-100">
          <label className="flex items-center gap-2 mb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={aiOn}
              onChange={e => { setGeminiTtsOn(e.target.checked); setAiOn(e.target.checked); }}
              className="w-4 h-4 accent-teal-500"
            />
            <span className="flex items-center gap-1 text-xs font-semibold text-gray-700">
              <Sparkles size={12} className="text-teal-500" /> AI 음성 쓰기
            </span>
          </label>
          <p className="text-[11px] text-gray-400 leading-relaxed mb-2">
            <b className="text-gray-500">상황별 자동</b>이면 점원·면접관·친구가 각각 다른
            목소리와 말투로 말해요. 무료 한도의 분당 호출 제한이 낮아 카드에 도달할 때
            하나씩 만들고, 준비가 안 됐으면 브라우저 음성으로 자동 대체해요.
          </p>
          {aiOn && (
            <div className="flex flex-wrap gap-1.5">
              {/* 기본값 — 상황마다 다른 사람이 말한다 */}
              <button
                onClick={() => chooseAiVoice('', 'order-cafe')}
                disabled={previewing !== ''}
                className={[
                  'flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-medium border transition-colors disabled:opacity-50',
                  aiVoice === ''
                    ? 'bg-teal-500 text-white border-teal-500'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-teal-300',
                ].join(' ')}
              >
                {previewing === 'auto' && <Loader2 size={10} className="animate-spin" />}
                상황별 자동
              </button>
              {GEMINI_VOICES.map(v => (
                <button
                  key={v.id}
                  onClick={() => chooseAiVoice(v.id)}
                  disabled={previewing !== ''}
                  className={[
                    'flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-medium border transition-colors disabled:opacity-50',
                    aiVoice === v.id
                      ? 'bg-teal-500 text-white border-teal-500'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-teal-300',
                  ].join(' ')}
                >
                  {previewing === v.id && <Loader2 size={10} className="animate-spin" />}
                  {v.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {voices.length <= 1 ? null : (
      <div className="space-y-1.5">
        <button
          onClick={() => choose('')}
          className={[
            'w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors',
            selected === '' ? 'bg-teal-50 border border-teal-200' : 'bg-gray-50 hover:bg-gray-100 border border-transparent',
          ].join(' ')}
        >
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-semibold text-gray-800">자동 선택</span>
            <span className="block text-[11px] text-gray-400 truncate">
              지금은 {auto || '없음'}
            </span>
          </span>
          {selected === '' && <Check size={14} className="shrink-0 text-teal-600" />}
        </button>

        {voices.map(v => (
          <button
            key={v.name}
            onClick={() => choose(v.name)}
            className={[
              'w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors',
              selected === v.name ? 'bg-teal-50 border border-teal-200' : 'bg-gray-50 hover:bg-gray-100 border border-transparent',
            ].join(' ')}
          >
            <span className="flex-1 min-w-0 flex items-center gap-1.5">
              <span className="text-xs font-medium text-gray-700 truncate">{v.name}</span>
              {v.natural && <Sparkles size={11} className="shrink-0 text-teal-500" />}
            </span>
            {selected === v.name && <Check size={14} className="shrink-0 text-teal-600" />}
          </button>
        ))}
      </div>
      )}

      <p className="text-[11px] text-gray-400 mt-3 leading-relaxed border-t border-gray-100 pt-3">
        아래는 AI 음성을 못 쓸 때 대체로 쓰이는 브라우저 내장 음성이에요.
      </p>
    </div>
  );
}
