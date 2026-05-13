import { ArticulationZone, ZONES, ZONE_PHONEMES } from '../utils/phonetics';

const ZONE_COLOR: Record<ArticulationZone, string> = {
  입술:   '#818cf8',
  혀끝:   '#34d399',
  입천장: '#c084fc',
  연구개: '#f97316',
  성대:   '#f43f5e',
};

/**
 * 1408×768 해부 이미지 위 정밀 좌표 (%)
 *  입술   ← 양순(bilabial) 접촉면 — 실제 입술 조직 위
 *  혀끝   ← 혀 근육 앞끝 (tongue apex) — 혀 앞 끝부분
 *  입천장 ← 경구개 중앙부
 *  연구개 ← 연구개(velum) 시작점
 *  성대   ← 성문(glottis) 위치
 */
const ZONE_PCT: Record<ArticulationZone, { x: number; y: number }> = {
  입술:   { x: 32.0, y: 55.0 },
  혀끝:   { x: 41.0, y: 57.0 },
  입천장: { x: 47.0, y: 35.0 },
  연구개: { x: 56.0, y: 38.0 },
  성대:   { x: 63.0, y: 85.0 },
};

/** 라벨이 도트 글로우를 가리지 않도록 방향별 오프셋 */
const LABEL_STYLE: Record<ArticulationZone, React.CSSProperties> = {
  입술:   { right: '10px',  top: '-9px'                                     },
  혀끝:   { left: '10px',   top: '-9px'                                     },
  입천장: { bottom: '12px', left: '50%', transform: 'translateX(-50%)'      },
  연구개: { bottom: '12px', left: '2px'                                      },
  성대:   { left: '10px',   top: '-9px'                                     },
};

// hex → rgba 변환 (box-shadow 글로우용)
function rgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// 레이저 포인터 스타일 box-shadow 생성
function laserGlow(color: string, isTop: boolean, isActive: boolean): string {
  if (!isTop && !isActive) return 'none';
  if (isTop) {
    return [
      `0 0 0 1.5px ${rgba(color, 0.6)}`,
      `0 0 5px  2px ${rgba(color, 0.9)}`,
      `0 0 10px 4px ${rgba(color, 0.55)}`,
      `0 0 18px 7px ${rgba(color, 0.22)}`,
    ].join(', ');
  }
  return [
    `0 0 0 1px  ${rgba(color, 0.4)}`,
    `0 0 4px 2px ${rgba(color, 0.7)}`,
    `0 0 9px  4px ${rgba(color, 0.3)}`,
  ].join(', ');
}

interface Props {
  frequency: Record<ArticulationZone, number>;
}

export default function ArticulationMap({ frequency }: Props) {
  const total   = ZONES.reduce((s, z) => s + frequency[z], 0);
  const sorted  = [...ZONES].sort((a, b) => frequency[b] - frequency[a]);
  const topZone = total > 0 ? sorted[0] : null;

  /** 코어 도트 크기 — 작고 정밀하게 (max 13px) */
  const corePx = (z: ArticulationZone): number => {
    if (total === 0 || frequency[z] === 0) return 6;
    if (z === topZone) return 12;
    return 9;
  };

  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">발음 기관 히트맵</h3>
      <p className="text-xs text-teal-500 mb-3">
        {topZone && total > 0
          ? `'${topZone}' 부위에서 가장 많이 막혀요 (${frequency[topZone]}회)`
          : '기록이 쌓이면 취약 부위가 표시됩니다'}
      </p>

      {/* ── 이미지 + 오버레이 ── */}
      <div className="relative w-full overflow-hidden rounded-xl select-none">
        <img
          src="/vocal_tract.jpg"
          alt="발음 기관 해부도"
          className="w-full h-auto block"
          draggable={false}
        />

        <style>{`
          /* 레이저 코어 펄스 — top zone */
          @keyframes laserPulseTop {
            0%,100% { transform: translate(-50%,-50%) scale(1);    }
            50%      { transform: translate(-50%,-50%) scale(1.18); }
          }
          /* 확장 링 — border only, filled X */
          @keyframes laserRing {
            0%   { transform: translate(-50%,-50%) scale(1);   opacity: 0.75; }
            100% { transform: translate(-50%,-50%) scale(3.2); opacity: 0;    }
          }
          @keyframes laserRing2 {
            0%   { transform: translate(-50%,-50%) scale(1);   opacity: 0.5;  }
            100% { transform: translate(-50%,-50%) scale(2.6); opacity: 0;    }
          }
          /* 일반 active 펄스 */
          @keyframes laserPulseActive {
            0%,100% { transform: translate(-50%,-50%) scale(1);    opacity: 0.85; }
            50%      { transform: translate(-50%,-50%) scale(1.12); opacity: 1;    }
          }
        `}</style>

        {ZONES.map(zone => {
          const { x, y } = ZONE_PCT[zone];
          const isTop    = zone === topZone;
          const isActive = !isTop && frequency[zone] > 0;
          const color    = ZONE_COLOR[zone];
          const sz       = corePx(zone);

          return (
            <div
              key={zone}
              className="absolute"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              {/* 확장 링 ×2 — top zone 전용, border-only (채움 없음) */}
              {isTop && (
                <>
                  <div style={{
                    position: 'absolute', left: 0, top: 0,
                    width: `${sz}px`, height: `${sz}px`,
                    borderRadius: '50%',
                    border: `1.5px solid ${color}`,
                    animation: 'laserRing 1.8s ease-out infinite',
                  }}/>
                  <div style={{
                    position: 'absolute', left: 0, top: 0,
                    width: `${sz}px`, height: `${sz}px`,
                    borderRadius: '50%',
                    border: `1px solid ${color}`,
                    animation: 'laserRing2 1.8s ease-out infinite 0.4s',
                  }}/>
                </>
              )}

              {/* 코어 도트 */}
              <div style={{
                position: 'absolute', left: 0, top: 0,
                width:  `${sz}px`,
                height: `${sz}px`,
                borderRadius: '50%',
                backgroundColor: color,
                opacity: total === 0 || frequency[zone] === 0 ? 0.18 : 0.95,
                boxShadow: laserGlow(color, isTop, isActive),
                animation: isTop
                  ? 'laserPulseTop 1.9s ease-in-out infinite'
                  : isActive
                    ? 'laserPulseActive 2.6s ease-in-out infinite'
                    : 'none',
                transform: 'translate(-50%, -50%)',
              }}/>

              {/* 라벨 — active 이상일 때 표시 */}
              {(isTop || isActive) && (
                <span
                  className="absolute text-xs text-slate-600 bg-white/80 px-1 rounded whitespace-nowrap pointer-events-none font-medium"
                  style={LABEL_STYLE[zone]}
                >
                  {zone}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── 빈도 바 ── */}
      {total > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-gray-400 mb-2">부위별 빈도</p>
          {sorted.filter(z => frequency[z] > 0).map(zone => {
            const pct = Math.round((frequency[zone] / total) * 100);
            return (
              <div key={zone} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: ZONE_COLOR[zone] }}/>
                <span className="text-xs font-medium text-gray-600 w-14 shrink-0">
                  {zone}
                </span>
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: ZONE_COLOR[zone] }}/>
                </div>
                <span className="text-xs text-gray-400 w-8 text-right shrink-0">
                  {pct}%
                </span>
                <span className="text-xs text-gray-300 shrink-0 w-20 truncate">
                  {ZONE_PHONEMES[zone].join(' ')}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
