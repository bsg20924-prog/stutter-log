export type SituationTag =
  | '전화'
  | '주문/결제'
  | '발표/자기소개'
  | '낯선사람'
  | '지인/가족'
  | '군_상황'
  | '피곤함/수면부족'
  | '급함/압박감'
  | '기타';

export type OutcomeTag =
  | '그대로_자연스럽게'
  | '막혔지만_끝까지_말함'
  | '다른_단어로_바꿈'
  | '우회해서_말함'
  | '상대가_대신_말함'
  | '중간에_포기함'
  | '아예_회피함';

export interface LogEntry {
  id: string;
  createdAt: string;

  // 1단계 필수
  word: string;
  blockedSyllable: string;
  phoneme: string;
  situations: SituationTag[];
  outcome: OutcomeTag;

  // 2단계 선택
  isDetailed: boolean;
  anxietyScore?: number;
  physicalState?: string;
  emotionalState?: string;
  note?: string;
}
