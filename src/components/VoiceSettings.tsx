// 상대 목소리 고르기.
//
// 기기마다 한국어 음성이 여러 개 있고 품질 차이가 크다.
// 자동으로는 '신경망 > 고품질 로컬 > 기본' 순으로 고르지만, 어느 게 사람처럼
// 들리는지는 결국 들어봐야 안다 — 그래서 직접 고르고 미리 들을 수 있게 한다.

import { useState, useEffect } from 'react';
import { Volume2, Check, Sparkles } from 'lucide-react';
import {
  listKoreanVoices, getPreferredVoiceName, setPreferredVoiceName,
  currentVoiceName, warmUpVoices, speakPrompt,
} from '../utils/speech';

const SAMPLE = '주문 도와드릴까요?';

export default function VoiceSettings() {
  const [voices, setVoices] = useState(listKoreanVoices());
  const [selected, setSelected] = useState(getPreferredVoiceName());
  const [auto, setAuto] = useState(currentVoiceName());

  // 음성 목록은 비동기로 채워진다 — 준비되면 다시 읽는다.
  useEffect(() => warmUpVoices(() => {
    setVoices(listKoreanVoices());
    setAuto(currentVoiceName());
  }), []);

  if (voices.length <= 1) return null;   // 고를 게 없으면 화면을 어지럽히지 않는다

  function choose(name: string) {
    setPreferredVoiceName(name);
    setSelected(name);
    setAuto(currentVoiceName());
    // ⚠️ 버튼 핸들러 안에서 바로 재생해야 iOS 가 허용한다.
    speakPrompt(SAMPLE, () => {});
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

      <p className="text-[11px] text-gray-400 mt-3 leading-relaxed border-t border-gray-100 pt-3">
        상황에 따라 말하는 속도와 높이가 자동으로 달라져요 —
        면접관은 천천히, 친구는 빠르게 말합니다.
      </p>
    </div>
  );
}
