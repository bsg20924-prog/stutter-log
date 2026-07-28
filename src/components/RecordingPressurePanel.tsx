// 3단계 "녹음 압박" 패널 — 실제 마이크 상태에 따라 압박 UI를 보여준다.
// 오디오는 저장하지 않는다(useMicPressure 참고). 이 컴포넌트는 표시만 담당.

import { useEffect, useRef } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { MicState } from '../hooks/useMicPressure';

const BAR_COUNT = 9;

export default function RecordingPressurePanel({
  state, elapsedSec, countdownValue, analyserRef, onStart,
}: {
  state: MicState;
  elapsedSec: number;
  countdownValue: number;
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  onStart: () => void;
}) {
  const manual = state === 'denied' || state === 'unsupported';

  return (
    <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-5 flex flex-col items-center">
      {/* ── 시작 전: 사용자가 직접 눌러야 권한 창이 제스처 안에서 뜬다 ── */}
      {state === 'idle' && (
        <>
          <div className="flex items-center justify-center w-11 h-11 rounded-full bg-red-500 text-white mb-2">
            <Mic size={20} />
          </div>
          <p className="text-xs font-semibold text-red-600 mb-0.5">녹음 압박 모드</p>
          <p className="text-[11px] text-gray-400 mb-3 text-center leading-relaxed">
            실제로 녹음이 돌아갑니다.<br />
            소리는 저장되지 않고 바로 사라져요.
          </p>
          <button
            onClick={onStart}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors"
          >
            녹음 시작하기
          </button>
        </>
      )}

      {/* ── 권한 요청 중 ── */}
      {state === 'requesting' && (
        <>
          <div className="flex items-center justify-center w-11 h-11 rounded-full bg-red-100 text-red-500 mb-2">
            <Loader2 size={20} className="animate-spin" />
          </div>
          <p className="text-xs font-semibold text-red-600">마이크 준비 중…</p>
          <p className="text-[11px] text-gray-400 mt-0.5">권한을 허용해 주세요.</p>
        </>
      )}

      {/* ── 3-2-1 카운트다운 ── */}
      {state === 'countdown' && (
        <>
          <p
            key={countdownValue}
            className="text-5xl font-bold text-red-500 leading-none animate-[ping_0.8s_ease-out_1] mb-1"
            style={{ animationFillMode: 'both' }}
          >
            {countdownValue}
          </p>
          <p className="text-xs font-semibold text-red-600 mt-2">곧 녹음이 시작돼요</p>
        </>
      )}

      {/* ── 실제 녹음 중 ── */}
      {state === 'recording' && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="relative flex items-center justify-center w-3 h-3">
              <span className="absolute w-3 h-3 rounded-full bg-red-400 animate-ping opacity-75" />
              <span className="relative w-2.5 h-2.5 rounded-full bg-red-500" />
            </span>
            <span className="text-xs font-bold text-red-600 tracking-wider">REC</span>
            <span className="text-xs font-mono font-semibold text-red-500 tabular-nums">
              {formatTime(elapsedSec)}
            </span>
          </div>
          <LiveWave analyserRef={analyserRef} />
          <p className="text-[11px] text-gray-400 mt-3">녹음 내용은 저장되지 않아요.</p>
        </>
      )}

      {/* ── 마이크 없이 진행 (권한 거부 / 미지원) ── */}
      {manual && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-500">
              <MicOff size={13} />
            </span>
            <span className="text-xs font-bold text-red-600 tracking-wider">수동 압박</span>
          </div>
          <SimulatedWave />
          <p className="text-xs text-gray-500 mt-3 text-center leading-relaxed">
            마이크 접근 없이 수동 압박 모드로 진행합니다
          </p>
          <p className="text-[11px] text-gray-400 mt-1 text-center">
            {state === 'denied'
              ? '녹음이 켜져 있다고 상상하며 그대로 말해보세요.'
              : '이 브라우저에서는 녹음을 쓸 수 없어요. 그대로 진행해도 괜찮아요.'}
          </p>
        </>
      )}
    </div>
  );
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 실제 마이크 입력으로 움직이는 파형.
// 60fps 리렌더를 피하려고 상태 대신 ref 로 transform 을 직접 쓴다.
function LiveWave({ analyserRef }: { analyserRef: React.MutableRefObject<AnalyserNode | null> }) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    let raf = 0;
    // ArrayBuffer 를 직접 넘겨야 getByteTimeDomainData 의 타입(SharedArrayBuffer 불가)과 맞는다.
    let data = new Uint8Array(new ArrayBuffer(0));

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const analyser = analyserRef.current;
      if (!analyser) return;
      if (data.length !== analyser.fftSize) data = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      analyser.getByteTimeDomainData(data);

      const chunk = Math.floor(data.length / BAR_COUNT);
      for (let i = 0; i < BAR_COUNT; i++) {
        let peak = 0;
        for (let j = i * chunk; j < (i + 1) * chunk; j++) {
          const v = Math.abs(data[j] - 128) / 128;
          if (v > peak) peak = v;
        }
        const bar = barsRef.current[i];
        if (bar) bar.style.transform = `scaleY(${Math.max(0.12, Math.min(1, peak * 2.6))})`;
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [analyserRef]);

  return (
    <div className="flex items-center justify-center gap-1.5 h-10">
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <span
          key={i}
          ref={el => { barsRef.current[i] = el; }}
          className="w-1.5 h-10 rounded-full bg-red-400 origin-center"
          style={{ transform: 'scaleY(0.12)', transition: 'transform 60ms linear' }}
        />
      ))}
    </div>
  );
}

// 마이크가 없을 때의 대체 파형 — 압박감만 유지하는 CSS 애니메이션.
function SimulatedWave() {
  return (
    <div className="flex items-center justify-center gap-1.5 h-10">
      <style>{`
        @keyframes soundmap-sim-wave {
          0%, 100% { transform: scaleY(0.2); }
          50%      { transform: scaleY(1); }
        }
      `}</style>
      {[0.9, 0.5, 1.1, 0.7, 1.3, 0.6, 1.0, 0.8, 1.2].map((dur, i) => (
        <span
          key={i}
          className="w-1.5 h-10 rounded-full bg-red-300 origin-center"
          style={{
            animation: `soundmap-sim-wave ${dur}s ease-in-out infinite`,
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
}
