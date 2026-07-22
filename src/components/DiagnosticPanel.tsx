import { Stethoscope, RefreshCw, Map as MapIcon, ChevronRight } from 'lucide-react';
import { useLatestDiagnostic } from '../hooks/useDiagnostics';
import DiagnosticResultView from './DiagnosticResultView';

export default function DiagnosticPanel({
  onStart,
  onStartSoundMap,
}: {
  onStart: () => void;
  onStartSoundMap: () => void;
}) {
  const { latest, loading } = useLatestDiagnostic();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-400 text-sm">불러오는 중...</p>
      </div>
    );
  }

  // 진단 이력이 없으면 안내 + 시작 CTA
  if (!latest) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 text-center">
          <p className="text-3xl mb-3">🩺</p>
          <h2 className="text-base font-bold text-gray-800 mb-2">자가 진단 테스트</h2>
          <p className="text-xs text-gray-500 leading-relaxed mb-5">
            한국어·영어 28개 단어를 소리 내어 읽으며 어디서 막히는지 표시하면,<br />
            당신만의 막힘 유형(공기·후두·조음)과 발음 기관 위치를 분석하고<br />
            맞춤 전략을 추천해 드려요. 약 2~3분 소요됩니다.
          </p>
          <button
            onClick={onStart}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 transition-colors"
          >
            <Stethoscope size={18} />
            진단 시작하기
          </button>
        </div>
        <SoundMapCard onStart={onStartSoundMap} />
      </div>
    );
  }

  // 최근 기준선 결과 표시 + 재진단
  return (
    <div className="space-y-4">
      <SoundMapCard onStart={onStartSoundMap} />
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-gray-600">최근 진단 결과</h2>
        <button
          onClick={onStart}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-teal-50 text-teal-600 border border-teal-200 hover:bg-teal-100 transition-colors"
        >
          <RefreshCw size={13} />
          다시 진단하기
        </button>
      </div>
      <DiagnosticResultView result={latest} />
    </div>
  );
}

// 소리 지도 만들기 유도 카드 (베타)
function SoundMapCard({ onStart }: { onStart: () => void }) {
  return (
    <button
      onClick={onStart}
      className="w-full flex items-center gap-3 rounded-2xl bg-white border border-teal-100 px-4 py-3.5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:border-teal-300 transition-all text-left"
    >
      <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-teal-50 text-teal-600 shrink-0">
        <MapIcon size={20} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-bold text-gray-800">소리 지도 만들기</p>
          <span className="text-[10px] font-medium text-teal-600 bg-teal-50 rounded-full px-1.5 py-0.5">베타</span>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">속삭임 → 목소리 → 녹음, 3단계 압박 테스트</p>
      </div>
      <ChevronRight size={20} className="shrink-0 text-gray-300" />
    </button>
  );
}
