// 대화 세션 저장/구독.
//
// 저장 방식은 useSoundMaps.ts 를 그대로 따른다 (Firestore 문서 + dev localStorage 폴백).
// 새 패턴을 만들지 않는 이유: 저장 경로가 갈라지면 dev 에서만 되는 코드,
// 프로덕션에서만 되는 코드가 생기고 그 차이는 배포 뒤에야 드러난다.
//
// ⚠️ 새 컬렉션이므로 firestore.rules 에 conversations 블록이 함께 나가야 한다.
//    규칙은 번들과 따로 배포되고, 마지막 catch-all 이 모든 경로를 막고 있어서
//    빠뜨리면 프로덕션에서만 permission-denied 가 난다.

import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  collection, doc, setDoc, onSnapshot, query, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  ConversationSession, SessionTurn, MyTurn, EffortAnswer, BlockedWord,
} from '../utils/conversationSession';

const COLLECTION = 'conversations';

// 개발 서버(npm run dev)에서는 로그인을 건너뛰어 Firestore 규칙에 막히므로
// localStorage 에 저장한다. 프로덕션 빌드에서는 Firestore 사용.
const USE_LOCAL = import.meta.env.DEV;
const LOCAL_KEY = 'stutter_conversations';
const LOCAL_EVENT = 'stutter-conversation-saved';

const VALID_EFFORT = new Set<EffortAnswer>(['yes', 'no', 'unknown']);

function toStringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map(v => String(v)).filter(Boolean) : [];
}

function migrateBlockedWords(raw: unknown): BlockedWord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(item => {
      const o = (item ?? {}) as Record<string, unknown>;
      return { word: String(o.word ?? ''), syllables: toStringArray(o.syllables) };
    })
    .filter(w => w.word !== '');
}

function migrateTurn(raw: unknown): SessionTurn | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const text = String(o.text ?? '');

  if (o.who === 'them') return { who: 'them', text };
  if (o.who !== 'me') return null;   // 모르는 화자는 통째로 버린다

  const turn: MyTurn = {
    who: 'me',
    text,
    blockedWords: migrateBlockedWords(o.blockedWords),
    misheard: Boolean(o.misheard ?? false),
  };
  // ★ effort 는 '없음'과 'unknown' 이 다른 뜻이라 (conversationSession.ts 참고)
  //   값이 유효할 때만 넣는다. 기본값을 채우면 두 상태가 합쳐져 버린다.
  if (VALID_EFFORT.has(o.effort as EffortAnswer)) turn.effort = o.effort as EffortAnswer;
  return turn;
}

/**
 * 저장된 문서를 타입에 맞게 정규화한다.
 * useLogStore.migrate 와 같은 자리 — 나중에 필드를 늘릴 때 기본값을 채울 곳이
 * 처음부터 여기 하나로 정해져 있어야 한다.
 */
function migrateSession(data: Record<string, unknown>): ConversationSession {
  return {
    id:            String(data.id ?? ''),
    createdAt:     String(data.createdAt ?? ''),
    scenarioId:    String(data.scenarioId ?? ''),
    scenarioLabel: String(data.scenarioLabel ?? ''),
    turns: Array.isArray(data.turns)
      ? data.turns.map(migrateTurn).filter((t): t is SessionTurn => t !== null)
      : [],
  };
}

function readLocal(): ConversationSession[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>[]) : [];
    return parsed
      .map(migrateSession)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));   // Firestore 와 같은 정렬
  } catch {
    return [];
  }
}

/**
 * 사후 기록을 마친 세션을 저장하고, id/createdAt 이 채워진 전체 세션을 반환.
 *
 * ★ 건너뛴 세션은 여기 오지 않는다 — 저장된 세션 = 기록을 마친 세션이다.
 */
export async function saveConversationSession(
  session: Omit<ConversationSession, 'id' | 'createdAt'>,
): Promise<ConversationSession> {
  const full: ConversationSession = {
    ...session,
    id: uuidv4(),
    createdAt: new Date().toISOString(),
  };

  if (USE_LOCAL) {
    const list = [full, ...readLocal()];
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(LOCAL_EVENT));
    return full;
  }

  await setDoc(doc(db, COLLECTION, full.id), full);
  return full;
}

// 개발 전용: 로컬에 쌓인 세션을 비운다. 프로덕션(Firestore)에서는 아무것도 하지 않는다.
export function clearLocalConversations(): void {
  if (!USE_LOCAL) return;
  localStorage.removeItem(LOCAL_KEY);
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

/** 세션 전체를 최신순으로 구독. */
export function useConversationSessions(): {
  sessions: ConversationSession[];
  loading: boolean;
} {
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (USE_LOCAL) {
      const refresh = () => {
        setSessions(readLocal());
        setLoading(false);
      };
      refresh();
      // 같은 탭 저장(LOCAL_EVENT) + 다른 탭 저장(storage) 모두 반영
      window.addEventListener(LOCAL_EVENT, refresh);
      window.addEventListener('storage', refresh);
      return () => {
        window.removeEventListener(LOCAL_EVENT, refresh);
        window.removeEventListener('storage', refresh);
      };
    }

    const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      snapshot => {
        setSessions(snapshot.docs.map(d => migrateSession({ ...d.data(), id: d.id })));
        setLoading(false);
      },
      // 오류가 나도 로딩은 풀어 준다 — 빈 목록으로 화면은 정상 동작한다.
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  return { sessions, loading };
}
