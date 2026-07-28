// 소리 지도 탭 — 구 진단 패널을 대체한다.
// 지도가 없으면 안내 + 시작 CTA, 있으면 최근 지도 결과를 보여준다.

import { useState } from 'react';
import { RefreshCw, Map as MapIcon } from 'lucide-react';
import {
  useLatestSoundMap, saveSoundMapResult, clearLocalSoundMaps,
} from '../hooks/useSoundMaps';
import { DEFAULT_CARD_COUNT } from '../data/soundMap';
import SoundMapResultView from './SoundMapResultView';

export default function SoundMapPanel({ onStart }: { onStart: () => void }) {
  const { latest, loading } = useLatestSoundMap();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-400 text-sm">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {import.meta.env.DEV && <DevSeedBar hasMap={!!latest} />}

      {!latest ? (
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 text-center">
          <p className="text-3xl mb-3">🗺️</p>
          <h2 className="text-base font-bold text-gray-800 mb-2">소리 지도 만들기</h2>
          <p className="text-xs text-gray-500 leading-relaxed mb-5">
            {DEFAULT_CARD_COUNT}개의 소리를 <b>속삭임 → 목소리 → 녹음</b> 3단계로 말하면서<br />
            <b>어느 압력에서</b> 걸리는지, 그리고 <b>왜</b> 걸리는지(공기·후두·조음)를<br />
            함께 분석해 맞춤 전략을 처방해 드려요.
          </p>
          <button
            onClick={onStart}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 transition-colors"
          >
            <MapIcon size={18} />
            소리 지도 시작하기
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-gray-600">최근 소리 지도</h2>
            <button
              onClick={onStart}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-teal-50 text-teal-600 border border-teal-200 hover:bg-teal-100 transition-colors"
            >
              <RefreshCw size={13} />
              다시 만들기
            </button>
          </div>
          <SoundMapResultView result={latest} />
        </>
      )}
    </div>
  );
}

// 개발 전용: 전체 카드를 다 돌지 않고 결과 화면을 바로 확인한다.
// 목업 데이터는 동적 import 라 프로덕션 번들에 들어가지 않고, 이 블록 자체도 DEV 에서만 렌더된다.
function DevSeedBar({ hasMap }: { hasMap: boolean }) {
  const [busy, setBusy] = useState(false);

  async function seed() {
    setBusy(true);
    try {
      const { buildMockSoundMap } = await import('../dev/soundMapMock');
      await saveSoundMapResult(buildMockSoundMap());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-purple-300 bg-purple-50/60 px-3 py-2">
      <span className="text-[10px] font-bold text-purple-500 tracking-wider shrink-0">DEV</span>
      <button
        onClick={seed}
        disabled={busy}
        className="rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-purple-500 text-white hover:bg-purple-600 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
      >
        {busy ? '만드는 중…' : '목업 지도 넣기'}
      </button>
      {hasMap && (
        <button
          onClick={clearLocalSoundMaps}
          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-purple-600 hover:bg-purple-100 transition-colors"
        >
          지우기
        </button>
      )}
      <span className="ml-auto text-[10px] text-purple-400 truncate">결과 화면 미리보기</span>
    </div>
  );
}
