import { StrategyId } from '../types';
import { mechanismOfStrategy } from './diagnostic';
import { unifiedDiagnosticWords } from '../data/diagnosticWords';

// 전략별 10초 미니 연습 단계. word 를 넣어 구체적인 안내 문장을 만든다.
const PRACTICE_STEPS: Record<StrategyId, (word: string) => string[]> = {
  'easy-onset': w => [
    `가볍게 "후—" 하고 숨을 조금 내쉬며 어깨 힘을 빼세요.`,
    `그 날숨 위에서 '${w}'의 첫소리를 10% 볼륨으로 아주 작게 시작하세요.`,
    `소리를 서서히 키우며 '${w}'를 끝까지 부드럽게 말해보세요.`,
  ],
  'passive-exhale': w => [
    `숨을 편하게 들이마신 뒤 절반쯤 "후—" 하고 내쉬세요.`,
    `남은 날숨에 얹어서 '${w}'를 시작하세요.`,
    `밀어붙이지 말고 흐르는 숨에 소리를 태우세요.`,
  ],
  'h-breath-starter': w => [
    `단어 앞에 소리 없는 'ㅎ' 숨을 살짝 내보내세요.`,
    `성대를 연 채로 'ㅎ—${w}' 처럼 '${w}'로 이어가세요.`,
    `목이 잠기지 않고 열려 있는 느낌을 확인하세요.`,
  ],
  'carrier-phrase': w => [
    `편안한 '어—' 소리를 먼저 살짝 내보세요.`,
    `공기 흐름이 트이면 '어.. ${w}' 처럼 '${w}'로 넘어가세요.`,
    `'${w}'의 첫소리에 힘을 주지 마세요.`,
  ],
  'continuous-phonation': w => [
    `'${w}'를 음절마다 끊지 말고 노래하듯 이어보세요.`,
    `자음에서 멈추지 말고 소리를 하나의 선으로 연결하세요.`,
    `'${w}'가 끊김 없이 흐르는지 느껴보세요.`,
  ],
  'gentle-humming': w => [
    `입을 다물고 아주 작은 '음~' 소리로 가슴을 울리세요.`,
    `그 울림을 유지한 채 '음~${w}' 로 '${w}'에 진입하세요.`,
    `침묵에서 갑자기 시작하지 않도록 하세요.`,
  ],
  'pitch-elevation': w => [
    `평소보다 한 톤 높은, 밝은 목소리를 떠올리세요.`,
    `노래하듯 살짝 높은 음으로 '${w}'를 시작하세요.`,
    `낮게 누르지 말고 가볍게 띄우세요.`,
  ],
  'light-contact': w => [
    `'${w}'의 첫 자음에서 입술·혀 힘을 최대한 빼세요.`,
    `깃털처럼 살짝 스치듯 대었다가 바로 모음으로 넘어가세요.`,
    `'${w}'를 가볍게 툭 시작해보세요.`,
  ],
  'jaw-shoulder-drop': w => [
    `말하기 직전 어깨를 툭 떨어뜨리고 턱 힘을 푸세요.`,
    `입안 공간을 살짝 넓힌 채 '${w}'를 시작하세요.`,
    `긴장 없이 '${w}'를 끝까지 말해보세요.`,
  ],
  'core-release': w => [
    `배에 힘을 주어 밀어붙이지 말고 복부를 편하게 푸세요.`,
    `힘을 뺀 상태에서 '${w}'를 시작하세요.`,
    `막히면 더 밀지 말고 힘을 더 빼세요.`,
  ],
  'yawn-sigh': w => [
    `하품하듯 목구멍 안쪽을 넓게 여세요.`,
    `그 열린 느낌을 유지한 채 '${w}'를 시작하세요.`,
    `목이 조이지 않고 시원하게 열려 있는지 확인하세요.`,
  ],
  'intentional-pause': w => [
    `말하기 전 마음속으로 "1초" 세며 멈추세요.`,
    `턱·어깨 긴장을 스캔해 풀고 '${w}'를 시작하세요.`,
    `서두르지 말고 준비된 뒤 출발하세요.`,
  ],
  'pause-and-release': w => [
    `'${w}'를 말하다 막히면 즉시 멈추세요.`,
    `숨을 완전히 내쉬고 힘을 푼 뒤 '${w}'를 다시 부드럽게 시작하세요.`,
    `억지로 뚫지 말고 리셋하는 연습이에요.`,
  ],
  'reduced-rate': w => [
    `평소보다 30% 느린 템포를 떠올리세요.`,
    `모음을 여유 있게 늘리며 '${w}'를 천천히 말하세요.`,
    `단어 사이 간격도 넉넉히 두세요.`,
  ],
};

// 전략과 잘 맞는 연습 단어 선택: 같은 메커니즘의 막힌 단어 우선 → 아무 막힌 단어 → 기본 예시
const DEFAULT_WORDS: Record<string, string> = {
  'airflow-glottal': '아침',
  'laryngeal-tension': '가방',
  'articulatory-forcing': '바다',
  'core-breathing': '아침',
};

export function pickPracticeWord(strategyId: StrategyId, blockedWords: string[]): string {
  const mech = mechanismOfStrategy(strategyId);
  if (blockedWords.length > 0) {
    if (mech) {
      const matched = blockedWords.find(w => {
        const dw = unifiedDiagnosticWords.find(x => x.word === w);
        return dw && dw.mechanism === mech;
      });
      if (matched) return matched;
    }
    return blockedWords[0];
  }
  return (mech && DEFAULT_WORDS[mech]) || '아침';
}

export function getPracticeSteps(strategyId: StrategyId, word: string): string[] {
  return PRACTICE_STEPS[strategyId]?.(word) ?? [
    `'${word}'로 이 전략을 10초 동안 천천히 연습해보세요.`,
  ];
}
