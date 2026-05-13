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
  const directionLocked = useRef<'h' | 'v' | null>(null);
  const successFiredRef = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Non-passive touchmove to prevent scroll when swiping horizontally
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    function handleTouchMove(e: TouchEvent) {
      if (directionLocked.current === 'h') e.preventDefault();
    }

    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', handleTouchMove);
  }, []);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    directionLocked.current = null;
  }

  function handleTouchMoveReact(e: React.TouchEvent) {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    if (!directionLocked.current) {
      if (Math.abs(dx) > Math.abs(dy) + 4) directionLocked.current = 'h';
      else if (Math.abs(dy) > Math.abs(dx) + 4) directionLocked.current = 'v';
      else return;
    }

    if (directionLocked.current === 'h' && dx > 0) {
      setOffsetX(dx);
    }
  }

  function handleTouchEnd() {
    if (directionLocked.current === 'h' && offsetX > 80 && !successFiredRef.current) {
      successFiredRef.current = true;
      setDismissed(true);
      setTimeout(onSuccess, 320);
    } else {
      setOffsetX(0);
    }
    directionLocked.current = null;
  }

  if (dismissed) return null;

  const progress = Math.min(offsetX / 120, 1);
  const timeStr = format(parseISO(challenge.lastBlockedAt), 'M월 d일', { locale: ko });

  return (
    <div
      ref={cardRef}
      style={{
        transform: dismissed
          ? 'translateX(110%)'
          : `translateX(${offsetX}px)`,
        transition: dismissed
          ? 'transform 0.3s ease-in'
          : offsetX === 0
          ? 'transform 0.25s ease-out'
          : 'none',
        touchAction: 'pan-y',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMoveReact}
      onTouchEnd={handleTouchEnd}
      className="relative bg-white rounded-2xl px-4 py-3.5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden select-none"
    >
      {/* Swipe hint overlay */}
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

      {/* Swipe instruction */}
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
