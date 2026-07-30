// 대화 세션 + 사후 기록의 데이터 모양.
//
// 0장의 루프에서 대화는 매일의 주 생산처다. 대화 자체는 연습이지만,
// 끝난 뒤 "어디서 막혔나"를 사용자가 손으로 찍어 주면 그게 데이터가 된다.
//
// ★ 막힘 자동 판정은 하지 않는다. 침묵 길이나 STT 실패로 막힘을 추론하면
//   기계가 내 말을 못 알아들은 것까지 내 막힘으로 세게 된다 — 3.5 가 줄이려는 바로 그 상처다.
//   이 파일의 모든 막힘 정보는 **사용자 손가락에서만** 나온다.
//
// 저장 위치와 구독은 useConversationSessions.ts 에 있다.

/** "힘 줬나요?" 의 답. 몸 감각은 원래 불확실하므로 '모르겠음'이 1급 선택지다 (CLAUDE.md 1.4). */
export type EffortAnswer = 'yes' | 'no' | 'unknown';

/** 상대 턴 — 화면에 뜬 대사 그대로. 사후 기록에서 건드릴 것이 없다. */
export interface ThemTurn {
  who: 'them';
  text: string;
}

/** 이 턴에서 막힌 것으로 사용자가 직접 찍은 단어 하나와, 그 안의 막힌 음절. */
export interface BlockedWord {
  /** 전사문에서 탭한 어절 그대로 */
  word: string;
  /** 그 단어 안에서 고른 음절 (korean.ts 로 분해해 보여준 것 중) */
  syllables: string[];
}

/**
 * 내 턴 — 사후 기록이 붙는 유일한 자리.
 */
export interface MyTurn {
  who: 'me';
  /**
   * STT 전사문.
   *
   * ⚠️ LiveTalk 이 모델에 넘기는 ANSWERED/UNHEARD 는 **자리표시자지 전사문이 아니다.**
   * ("답은 했다"·"못 알아들었다"를 모델에게 알리려고 넣는 문자열이다.)
   * 세션을 만들 때 그 값들은 반드시 빈 문자열로 떨군다 — 그대로 저장하면
   * 사후 기록 화면에서 사용자가 하지도 않은 말을 탭하게 된다.
   */
  text: string;

  /**
   * 막힌 단어들. 빈 배열 = 막힘 없음.
   *
   * 음절만 남기지 않고 단어를 함께 남기는 이유: 도전 단어 순환(challenge.ts)이
   * word 로 묶고, LogEntry.word 도 단어 단위다. 음절만 저장하면 나중에 단어를
   * 복원할 수 없어 이 데이터가 그 고리에 끼지 못한다.
   */
  blockedWords: BlockedWord[];

  /**
   * "힘 줬나요?" — 막힌 단어가 있을 때만 묻는다.
   *
   * ★ **필드 없음 = 묻지 않았다. 'unknown' = 묻고 모르겠다고 답했다.**
   * 둘을 섞으면 안 된다 (CLAUDE.md 1.4): 막힘이 없던 턴까지 'unknown' 으로
   * 채우면 "말은 했는데 판단이 안 됐다"는 진짜 신호가 묻혀,
   * 인식 공백 지표가 통째로 오염된다. 건너뛰기는 아무것도 기록하지 않는다.
   */
  effort?: EffortAnswer;

  /**
   * "전사 틀림" 표시. 잘못 받아적힌 턴은 집계에서 통째로 뺀다 —
   * 내가 하지 않은 말이 내 막힘 통계에 들어가면 안 된다.
   */
  misheard: boolean;
}

export type SessionTurn = ThemTurn | MyTurn;

/**
 * 대화 한 판.
 *
 * ★ **저장된 세션 = 사후 기록을 마친 세션이다.**
 * 사후 기록을 건너뛰거나 STT 를 꺼서 전사문이 없는 세션은 아예 저장하지 않는다.
 * 그래서 "기록을 마쳤는가" 를 나타내는 플래그가 없다 — 저장돼 있다는 사실이 곧 그 답이다.
 * 이렇게 두면 집계 쪽에서 미완성 세션을 걸러내는 코드가 필요 없고,
 * 걸러내는 것을 잊어서 빈 세션이 분모에 섞이는 사고도 생기지 않는다.
 */
export interface ConversationSession {
  id: string;
  /** ISO 문자열 — logs/soundMaps 와 같은 형식이라 같은 방식으로 정렬·구간 분류된다 */
  createdAt: string;

  /** LiveScenario.id */
  scenarioId: string;
  /**
   * 시나리오 표시명을 값으로 박아 둔다.
   * id 로만 두면 나중에 시나리오 목록에서 그 항목이 빠졌을 때
   * 과거 세션의 제목이 화면에서 사라진다 — 기록은 그때의 사실대로 남아야 한다.
   */
  scenarioLabel: string;

  /** 오간 순서 그대로. 상대 턴과 내 턴이 번갈아 들어간다. */
  turns: SessionTurn[];
}

/** 내 턴만 골라낸다 — 집계는 거의 항상 여기서 시작한다. */
export function myTurns(session: ConversationSession): MyTurn[] {
  return session.turns.filter((t): t is MyTurn => t.who === 'me');
}
