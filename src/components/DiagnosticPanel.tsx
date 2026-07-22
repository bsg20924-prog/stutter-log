import { Stethoscope, RefreshCw } from 'lucide-react';
import { useLatestDiagnostic } from '../hooks/useDiagnostics';
import DiagnosticResultView from './DiagnosticResultView';

export default function DiagnosticPanel({ onStart }: { onStart: () => void }) {
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
      </div>
    );
  }

  // 최근 기준선 결과 표시 + 재진단
  return (
    <div className="space-y-4">
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
