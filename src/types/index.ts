export type LogStatus = 'avoided' | 'blocked' | 'overcome';

// 말하기 전략 카테고리 (4분류)
export type StrategyCategoryId =
  | 'airflow'      // 공기 먼저
  | 'phonation'    // 진동/음성 조절
  | 'relaxation'   // 신체 이완
  | 'timing';      // 타이밍 및 인지

// 현재 사용하는 전략 ID (안정적인 머신 키 — 표시명과 분리)
export type StrategyId =
  | 'easy-onset'
  | 'passive-exhale'
  | 'h-breath-starter'
  | 'carrier-phrase'
  | 'continuous-phonation'
  | 'gentle-humming'
  | 'pitch-elevation'
  | 'light-contact'
  | 'jaw-shoulder-drop'
  | 'core-release'
  | 'yawn-sigh'
  | 'intentional-pause'
  | 'pause-and-release'
  | 'reduced-rate';

// 과거 버전에서 저장된 전략 태그 — 기존 기록 호환용으로 계속 인식
export type LegacyTacticTag =
  | '호흡_조절'
  | '천천히_시작'
  | '첫_음절_늘리기'
  | '리듬_타기'
  | '성공_기억_떠올리기'
  | '다른_단어_우회';

// LogEntry.tactics 에 저장되는 값 — 신규 전략 + 과거 태그 모두 허용
export type TacticTag = StrategyId | LegacyTacticTag;

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

/**
 * 이 기록이 어디서 나왔나.
 *
 * 'real'       — 실전(QuickLog·상세 기록). 직면율·상대 반응 등
 *                공포 학습 지표는 이 기록으로만 계산한다 (CLAUDE.md 0장).
 *                시뮬레이션 성과로 실전 지표를 채우면 이 앱은
 *                "AI 와 잘 말하는 능력"을 재는 물건이 된다.
 * 'simulation' — 연습(대화 세션 사후 기록).
 *
 * ⚠️ liveConversation.ts 의 `source: 'ai'|'ladder'`(대사를 누가 골랐나),
 *    weeklyNarrative.ts 의 `source: 'gemini'|'template'`(문장을 누가 썼나)와는
 *    이름만 같고 뜻이 전혀 다른 별개 필드다.
 */
export type LogSource = 'simulation' | 'real';

export interface LogEntry {
  id: string;
  createdAt: string;

  word: string;

  // 다중 음절 지원 (빠른 저장 시 빈 배열 가능)
  blockedSyllables: string[];
  phonemes: string[];

  situations: SituationTag[];
  outcome: OutcomeTag | '';   // 빠른 저장 시 빈 문자열

  status: LogStatus;
  /**
   * optional 이지만 **읽는 쪽에서는 항상 채워져 있다** —
   * useLogStore.migrate 가 status 와 똑같이 모든 기록에 넣어 준다.
   * optional 인 것은 저장하는 쪽 편의일 뿐이니, 집계에서 없는 경우를 방어하지 않아도 된다.
   */
  source?: LogSource;
  isDetailed: boolean;
  physicalState?: string;
  emotionalState?: string;
  note?: string;
  expectedFear?: number;
  actualDifficulty?: number;
  tactics?: TacticTag[];
}
