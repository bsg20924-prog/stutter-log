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

  word: string;

  // 다중 음절 지원 (빠른 저장 시 빈 배열 가능)
  blockedSyllables: string[];
  phonemes: string[];

  situations: SituationTag[];
  outcome: OutcomeTag | '';   // 빠른 저장 시 빈 문자열

  isDetailed: boolean;
  physicalState?: string;
  emotionalState?: string;
  note?: string;
}
