import { StrategyId, StrategyCategoryId, TacticTag, LegacyTacticTag } from '../types';

export interface Strategy {
  id: StrategyId;
  name: string;                 // 한글 표시명
  category: StrategyCategoryId;
  description: string;          // 기법 설명 (한글)
  actionGuide: string;          // 바로 실행 가이드 (한글)
  examples: string[];           // 실제 예시 (한글)
  isTemporaryStarter?: boolean; // 임시 시동용 여부
}

export interface StrategyCategory {
  id: StrategyCategoryId;
  name: string;      // 한글 이름
  subtitle: string;  // 짧은 부제
  emoji: string;
}

// 임시 시동용 전략에 붙는 뱃지/경고 문구
export const TEMPORARY_STARTER_TAG = '🔧 임시 시동용';
export const TEMPORARY_STARTER_WARNING =
  '과도한 의존을 피하고 익숙해지면 차츰 사용을 줄여가세요.';

export const STRATEGY_CATEGORIES: StrategyCategory[] = [
  { id: 'airflow',    name: '공기 먼저',      subtitle: '호흡·기류로 말문 열기', emoji: '💨' },
  { id: 'phonation',  name: '진동/음성 조절', subtitle: '성대 진동과 음조 다루기', emoji: '🎵' },
  { id: 'relaxation', name: '신체 이완',      subtitle: '근육 긴장 풀기',        emoji: '🧘' },
  { id: 'timing',     name: '타이밍 및 인지', subtitle: '속도와 마음가짐 조절',   emoji: '⏱️' },
];

export const STRATEGIES: Strategy[] = [
  // ── Category 1: 공기 먼저 (Airflow-First) ──────────────────
  {
    id: 'easy-onset',
    name: '부드러운 시작',
    category: 'airflow',
    description:
      '소리를 강하게 터뜨리지 않고, 미세한 숨을 내쉬며 10%의 아주 작은 음량으로 모음을 시작하는 기법',
    actionGuide: '말하기 직전 한숨을 가볍게 내쉬며 소리를 부드럽게 올리세요.',
    examples: [
      "'아' 대신 숨을 섞어 '하아-' 하듯 시작",
      '소리 크기를 10%에서 100%로 천천히 올리기',
    ],
  },
  {
    id: 'passive-exhale',
    name: '날숨 후 시작',
    category: 'airflow',
    description:
      '숨을 참거나 가득 채운 상태에서 소리를 내지 않고, 마신 숨의 절반을 먼저 빼낸 뒤 편안한 날숨 위에서 발성하는 기법',
    actionGuide: '숨을 마신 뒤, 반쯤 내쉬고 남은 날숨에 말을 얹으세요.',
    examples: ["숨 마시고 -> '후-' 하고 반쯤 내뱉기 -> 바로 모음 발성"],
  },
  {
    id: 'h-breath-starter',
    name: 'H-숨 기법',
    category: 'airflow',
    isTemporaryStarter: true,
    description:
      "모음 시작 전에 소리 없는 'H' 호흡을 먼저 내보내 성문이 꽉 잠기는 것을 물리적으로 방지하는 기법",
    actionGuide: "단어 앞에 살짝 'H' 숨 소리를 붙여 성대를 열어주세요.",
    examples: ["'Apple'을 'H-apple'로 시작", "'아침'을 '하-아침'으로 시작"],
  },
  {
    id: 'carrier-phrase',
    name: "'어' 소리 붙이기",
    category: 'airflow',
    isTemporaryStarter: true,
    description:
      "정적 상태에서 모음을 바로 내기 힘들 때, 편안한 '어…' 소리를 먼저 내어 공기 흐름을 튼 뒤 목표 단어로 넘어가는 기법",
    actionGuide: "단어 바로 앞에 가벼운 '어' 소리를 덧붙여 발성을 워밍업하세요.",
    examples: ["'아메리카노 주세요' -> '어.. 아메리카노 주세요'"],
  },

  // ── Category 2: 진동/음성 조절 (Phonation & Pitch) ─────────
  {
    id: 'continuous-phonation',
    name: '연속 발성',
    category: 'phonation',
    description:
      '단어와 단어 사이에서 소리를 완전히 끊지 않고, 노래하듯 성대 진동을 하나로 연결하여 말하는 기법',
    actionGuide: '자음에서 멈추지 말고 문장 전체를 하나의 끊어지지 않는 음성 선으로 연결하세요.',
    examples: ["'밥 먹었어?'를 '밥-먹-었-어?'처럼 소리를 끊지 않고 부드럽게 이어 붙이기"],
  },
  {
    id: 'gentle-humming',
    name: '미세 허밍',
    category: 'phonation',
    isTemporaryStarter: true,
    description:
      "완전한 침묵 속에서 목구멍이 잠기는 것을 막기 위해 가슴속에서 아주 작은 '음~' 소리로 성대를 먼저 진동시키는 기법",
    actionGuide: "들리지 않을 정도의 작은 '음~' 소리로 가슴 울림을 먼저 느끼고 단어로 진입하세요.",
    examples: ["'음~아메리카노'", "'음~이거 주세요'"],
  },
  {
    id: 'pitch-elevation',
    name: '피치 살짝 올리기',
    category: 'phonation',
    description:
      '낮고 눌린 톤에서 성대 경련이 잘 일어나므로, 의도적으로 음조(Pitch)를 살짝 올려 뇌의 막힘 신호를 우회하는 기법',
    actionGuide: '평소보다 한 톤 높은, 노래하듯 밝은 톤으로 소리를 내보세요.',
    examples: ['솔(Sol) 톤에 가깝게 음조를 살짝 높여 첫 모음 내기'],
  },

  // ── Category 3: 신체 이완 (Physical Relaxation) ────────────
  {
    id: 'light-contact',
    name: '경조음 / 가벼운 접촉',
    category: 'relaxation',
    description:
      '첫 자음을 낼 때 입술이나 혀에 들어가는 힘을 극도로 줄여 깃털처럼 가볍게 대어 후두가 조이는 반사를 차단하는 기법',
    actionGuide: '입술이나 혀가 스치듯 아주 가볍게 대었다가 바로 모음으로 넘어가세요.',
    examples: ["'ㅂ'을 낼 때 입술을 꽉 다물지 않고 닿을 듯 말 듯 가볍게 부딪히기"],
  },
  {
    id: 'jaw-shoulder-drop',
    name: '턱/어깨 이완',
    category: 'relaxation',
    description:
      '말하기 직전 의도적으로 어깨 힘을 빼고 턱을 아래로 떨어뜨려 후두 주변의 근육 압력을 낮추는 기법',
    actionGuide: '소리를 내기 0.5초 전, 어깨를 툭 떨어뜨리고 턱의 긴장을 풀어주세요.',
    examples: ['턱을 몇 mm 늘어뜨려 입안 공간 확보하기', '어깨의 힘을 툭 빼며 호흡 내쉬기'],
  },
  {
    id: 'core-release',
    name: '복부 힘 빼기',
    category: 'relaxation',
    description:
      '막혔을 때 복부 코어 근육으로 공기를 억지로 밀어붙이는 행위(발살바 메커니즘)를 중단하고 배의 힘을 완전 이완하는 기법',
    actionGuide: '막히는 느낌이 들 때 배에 힘을 주어 밀어붙이지 말고, 복부 힘을 완전히 풀어주세요.',
    examples: ['배를 들숨 때처럼 편안하게 내밀고 밀어붙이기 중단'],
  },
  {
    id: 'yawn-sigh',
    name: '하품-한숨 자세',
    category: 'relaxation',
    description:
      '하품할 때처럼 혀뿌리를 낮추고 후두를 자연스럽게 아래로 내려 목구멍(기도)을 넓게 확보하는 기법',
    actionGuide: '하품을 시작할 때처럼 목구멍 내부를 넓게 열어둔 상태에서 소리를 내세요.',
    examples: ['하품할 때의 시원하게 열린 목구멍 감각 재현하기'],
  },

  // ── Category 4: 타이밍 및 인지 (Timing & Mindset) ──────────
  {
    id: 'intentional-pause',
    name: '1초 정적',
    category: 'timing',
    description:
      '말하기 전 불안감으로 급하게 내뱉지 않고, 1초간 의도적으로 멈추어 상체 힘을 빼고 발성을 준비하는 기법',
    actionGuide: "말하기 전 마음속으로 '1초'를 세며 몸의 긴장을 먼저 스캔하세요.",
    examples: ['말을 내뱉기 전 1초 멈추고 턱/어깨 이완 확인 후 출발'],
  },
  {
    id: 'pause-and-release',
    name: '막히면 멈추고 재시작',
    category: 'timing',
    description:
      '막힘이 시작되었을 때 억지로 뚫으려 하지 않고 즉시 소리를 멈춘 뒤, 완전히 이완하고 부드럽게 다시 시작하는 기법',
    actionGuide: '막히는 즉시 멈추세요! 숨을 완전히 내쉬고 힘을 푼 뒤 부드럽게 재시도하세요.',
    examples: ['막히면 붉어질 때까지 밀지 말고 0초 만에 바로 스톱 -> 리셋 -> 재시도'],
  },
  {
    id: 'reduced-rate',
    name: '속도 30% 감속',
    category: 'timing',
    description:
      '전체적인 말하기 페이스를 30% 정도 낮추어 후두 근육이 패닉에 빠지지 않고 이완할 수 있는 시간을 벌어주는 기법',
    actionGuide: '평소보다 30% 느린 템포로 여유 있게 소리를 이어가세요.',
    examples: ['단어 사이의 간격을 늘리고 모음 길이를 여유 있게 끌어주기'],
  },
];

// 빠른 조회용 인덱스
const STRATEGY_BY_ID = new Map<string, Strategy>(STRATEGIES.map(s => [s.id, s]));

// 과거 태그 → 사람이 읽는 표시명 (기존 기록 호환)
const LEGACY_TACTIC_LABELS: Record<LegacyTacticTag, string> = {
  '호흡_조절':          '호흡 조절',
  '천천히_시작':        '천천히 시작',
  '첫_음절_늘리기':     '첫 음절 늘리기',
  '리듬_타기':          '리듬 타기',
  '성공_기억_떠올리기': '성공 기억 떠올리기',
  '다른_단어_우회':     '다른 단어 우회',
};

// 저장/마이그레이션 시 유효한 전략으로 인정할 ID 집합 (신규 + 과거)
export const VALID_TACTIC_IDS: Set<TacticTag> = new Set<TacticTag>([
  ...STRATEGIES.map(s => s.id),
  ...(Object.keys(LEGACY_TACTIC_LABELS) as LegacyTacticTag[]),
]);

export function getStrategy(id: string): Strategy | undefined {
  return STRATEGY_BY_ID.get(id);
}

export function getStrategiesByCategory(category: StrategyCategoryId): Strategy[] {
  return STRATEGIES.filter(s => s.category === category);
}

// 전략/과거 태그 ID를 표시명으로 변환 — 알 수 없는 값은 밑줄만 공백 처리
export function getTacticLabel(id: string): string {
  const strategy = STRATEGY_BY_ID.get(id);
  if (strategy) return strategy.name;
  if (id in LEGACY_TACTIC_LABELS) return LEGACY_TACTIC_LABELS[id as LegacyTacticTag];
  return id.replace(/_/g, ' ');
}
