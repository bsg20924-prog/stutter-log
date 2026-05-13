import { useMemo, useRef, useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Target } from 'lucide-react';
import { useLogStore } from '../hooks/useLogStore';
import { ChallengeWord, getActiveChallengeWords } from '../utils/challenge';

// ── SwipeableChallengeCard ─────────────────────────────────

function SwipeableChallengeCard({
  challenge,
  onSuccess,
}: {
  challenge: ChallengeWord;
  onSuccess: () => void;
}) {
  const [offsetX, setOffsetX] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchCurrentX = useRef(0); // ref로 추적 — handleTouchEnd의 stale closure 방지
  const directionLocked = useRef<'h' | 'v' | null>(null);
  const successFiredRef = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const prevent = (e: TouchEvent) => {
      if (directionLocked.current === 'h') e.preventDefault();
    };
    el.addEventListener('touchmove', prevent, { passive: false });
    return () => el.removeEventListener('touchmove', prevent);
  }, []);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchCurrentX.current = e.touches[0].clientX;
    directionLocked.current = null;
  }

  function handleTouchMove(e: React.TouchEvent) {
    const cx = e.touches[0].clientX;
    const cy = e.touches[0].clientY;
    touchCurrentX.current = cx;

    const dx = cx - touchStartX.current;
    const dy = cy - touchStartY.current;

    if (!directionLocked.current) {
      if (Math.abs(dx) > Math.abs(dy) + 4) directionLocked.current = 'h';
      else if (Math.abs(dy) > Math.abs(dx) + 4) directionLocked.current = 'v';
      else return;
    }

    if (directionLocked.current === 'h' && dx > 0) setOffsetX(dx);
  }

  function handleTouchEnd() {
    // React state(offsetX)가 아닌 ref로 계산 — 렌더 타이밍 무관하게 정확한 값 사용
    const finalDx = touchCurrentX.current - touchStartX.current;
    if (directionLocked.current === 'h' && finalDx > 80 && !successFiredRef.current) {
      successFiredRef.current = true;
      setDismissed(true);
      setTimeout(onSuccess, 300);
    } else {
      setOffsetX(0);
    }
    directionLocked.current = null;
  }

  const progress = Math.min(offsetX / 120, 1);
  const timeStr = format(parseISO(challenge.lastBlockedAt), 'M월 d일', { locale: ko });

  // dismissed일 때 null 반환 대신 CSS transform으로 처리 — 애니메이션 재생 보장
  return (
    <div
      ref={cardRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        transform: dismissed ? 'translateX(110%)' : `translateX(${offsetX}px)`,
        transition: dismissed
          ? 'transform 0.3s ease-in'
          : offsetX === 0
          ? 'transform 0.2s ease-out'
          : 'none',
        touchAction: 'pan-y',
        pointerEvents: dismissed ? 'none' : 'auto',
      }}
      className="relative bg-white rounded-2xl px-4 py-3.5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden select-none"
    >
      <div
        className="absolute inset-0 bg-teal-50 rounded-2xl flex items-center px-5 pointer-events-none"
        style={{ opacity: progress }}
      >
        <span className="text-teal-600 text-sm font-semibold">편안하게 말함 ✓</span>
      </div>

      <div className="relative">
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-gray-800">{challenge.word}</span>
          <span className="text-xs text-gray-400">{timeStr}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-orange-500 bg-orange-50 rounded-full px-2 py-0.5">
            {challenge.totalCount}회 막힘
          </span>
          {challenge.latestEntry.blockedSyllables?.length > 0 && (
            <span className="text-xs text-gray-400">
              막힌 음절: {challenge.latestEntry.blockedSyllables.join(', ')}
            </span>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-300 mt-2.5">→ 오른쪽으로 밀면 성공으로 기록</p>
    </div>
  );
}

// ── ChallengeList ──────────────────────────────────────────

export default function ChallengeList() {
  const { entries, addEntry } = useLogStore();
  const challenges = useMemo(() => getActiveChallengeWords(entries), [entries]);

  async function handleSuccess(challenge: ChallengeWord) {
    await addEntry({
      word: challenge.word,
      blockedSyllables: challenge.latestEntry.blockedSyllables ?? [],
      phonemes: challenge.latestEntry.phonemes ?? [],
      situations: [],
      outcome: '그대로_자연스럽게',
      status: 'overcome',
      isDetailed: false,
    });
  }

  if (challenges.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Target size={40} className="mb-3 opacity-30" />
        <p className="text-sm">도전 단어가 없어요.</p>
        <p className="text-xs mt-1">막힌 단어를 기록하면 여기 나타나요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400 px-1">
        최근에 막힌 단어들이에요. 다시 도전해서 성공하면 오른쪽으로 밀어보세요.
      </p>
      {challenges.map(challenge => (
        <SwipeableChallengeCard
          key={`${challenge.word}-${challenge.lastBlockedAt}`}
          challenge={challenge}
          onSuccess={() => handleSuccess(challenge)}
        />
      ))}
    </div>
  );
}
