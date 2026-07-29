// Gemini API 키 설정 — 상황 문장을 더 자연스럽게 만드는 선택 기능.
//
// ⚠️ 왜 사용자가 직접 입력하게 하는가:
// 이 앱은 백엔드가 없어서 환경변수(VITE_*)는 빌드 시 번들에 그대로 박힌다 = 공개된다.
// Firebase 키는 공개돼도 되지만(보안은 firestore.rules 담당) Gemini 키는 과금
// 자격증명이라 공개되면 남이 쓴 요금이 청구된다.
// 여기서 입력한 키는 이 기기의 localStorage 에만 남고 서버·git·번들 어디에도 안 들어간다.

import { useState } from 'react';
import { Sparkles, Check, X, ExternalLink, Loader2, Eye, EyeOff } from 'lucide-react';
import { getGeminiKey, setGeminiKey, maskKey, testGeminiKey } from '../utils/gemini';

export default function GeminiKeySettings() {
  const [saved, setSaved] = useState(getGeminiKey());
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState(!getGeminiKey());
  const [reveal, setReveal] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function save() {
    const key = input.trim();
    if (!key) return;
    setGeminiKey(key);
    setSaved(key);
    setInput('');
    setEditing(false);
    setResult(null);
  }

  function remove() {
    setGeminiKey('');
    setSaved('');
    setEditing(true);
    setResult(null);
  }

  async function test() {
    setTesting(true);
    setResult(await testGeminiKey());
    setTesting(false);
  }

  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1">
        <Sparkles size={15} className="text-teal-500" />
        AI 문장 만들기 <span className="text-gray-400 font-normal">(선택)</span>
      </p>
      <p className="text-xs text-gray-400 leading-relaxed mb-3">
        4단계 상황 문장을 단어에 맞게 자연스럽게 만들어 줘요.
        <br />
        없어도 괜찮아요 — 기본 문장으로 그대로 진행됩니다.
      </p>

      {!editing && saved ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
            <span className="flex-1 min-w-0 text-xs font-mono text-gray-600 truncate">
              {reveal ? saved : maskKey(saved)}
            </span>
            <button
              onClick={() => setReveal(v => !v)}
              className="shrink-0 text-gray-400 hover:text-gray-600 p-1"
              aria-label={reveal ? '키 숨기기' : '키 보기'}
            >
              {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={test}
              disabled={testing}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 disabled:opacity-50 transition-colors"
            >
              {testing ? <><Loader2 size={13} className="animate-spin" /> 확인 중</> : '연결 확인'}
            </button>
            <button
              onClick={() => { setEditing(true); setReveal(false); }}
              className="rounded-xl px-3 py-2.5 text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              변경
            </button>
            <button
              onClick={remove}
              className="rounded-xl px-3 py-2.5 text-xs font-medium text-gray-400 hover:text-red-500 transition-colors"
            >
              삭제
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
            <input
              type="password"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="AIza... 로 시작하는 키를 붙여넣기"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={!input.trim()}
              className="flex-1 rounded-xl py-2.5 text-xs font-semibold bg-teal-500 text-white disabled:bg-gray-200 disabled:text-gray-400 hover:bg-teal-600 transition-colors"
            >
              저장
            </button>
            {saved && (
              <button
                onClick={() => { setEditing(false); setInput(''); }}
                className="rounded-xl px-3 py-2.5 text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
            )}
          </div>
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-teal-600 hover:underline"
          >
            Google AI Studio 에서 키 만들기 <ExternalLink size={11} />
          </a>
        </div>
      )}

      {result && (
        <p className={[
          'flex items-start gap-1.5 text-[11px] mt-2 leading-relaxed',
          result.ok ? 'text-teal-600' : 'text-red-500',
        ].join(' ')}>
          {result.ok ? <Check size={13} className="shrink-0 mt-0.5" /> : <X size={13} className="shrink-0 mt-0.5" />}
          {result.message}
        </p>
      )}

      <p className="text-[11px] text-gray-400 mt-3 leading-relaxed border-t border-gray-100 pt-3">
        키는 <b className="text-gray-500">이 기기에만</b> 저장돼요. 서버에 올라가지 않습니다.
        {' '}호출 요금은 사용자 본인 계정에 청구되며, 문장 몇 개 수준이면 무료 한도 안에서 끝납니다.
      </p>
    </div>
  );
}
