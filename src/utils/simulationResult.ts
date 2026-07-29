// 상황 시뮬레이션(Stage 4) 결과 집계.
//
// Stage 1~3 은 "소리"를, Stage 4 는 "문장"을 평가한다. 두 단위를 잇는 다리가
// SimSentence.sourceWords 다: 문장이 걸리면 그 문장을 만든 도전 단어가 걸린 것으로 본다.
//
// 승격 규칙은 의도적으로 엄격하다 — Stage 1~3 에서 이미 걸린 단어는 절대 덮어쓰지 않는다.
// "임계점 = 가장 낮은 압력에서 처음 걸린 지점"이라는 기존 불변식을 깨면
// 과거 지도와의 비교가 성립하지 않는다.

import { Assessment } from '../data/soundMap';
import { SimScenario, SentenceOrigin } from '../data/simulation';
import { SpeechOutcome } from './speech';

export interface SimSentenceResponse {
  assessment: Assessment;
  /** 이 문장의 프롬프트가 실제 음성으로 나왔는지, 말풍선+차임 폴백이었는지 */
  ttsOutcome?: SpeechOutcome;
}

export interface SimSentenceResult {
  sentenceId: string;
  scenarioId: string;
  scenarioLabel: string;
  text: string;
  sourceWords: string[];
  origin: SentenceOrigin;
  assessment: Assessment;
  ttsOutcome?: SpeechOutcome;
}

export interface SimScenarioStat {
  scenarioId: string;
  label: string;
  answered: number;   // '모르겠음' 제외
  smooth: number;
  caught: number;     // 걸림 + 막힘
  unknown: number;
  total: number;      // 응답한 문장 수 (모르겠음 포함)
}

export interface SimulationResult {
  scenarios: SimScenarioStat[];
  sentences: SimSentenceResult[];
  /** 걸린 문장에서 뽑아낸 단어 (중복 제거, 원문 표기 유지) */
  caughtWords: string[];
  /** 한국어 음성 없이 말풍선+차임으로 진행한 문장 수 — 근거의 무게를 낮춰 표시할 때 쓴다 */
  fallbackCount: number;
  /** 모든 문장에 응답했는지 */
  completed: boolean;
}

const CAUGHT: Assessment[] = ['partial', 'blocked'];

function isCaught(a: Assessment): boolean {
  return CAUGHT.includes(a);
}

/** 카드 텍스트와 도전 단어를 맞대 보기 위한 정규화 (대소문자·공백 무시) */
export function normalizeWord(w: string): string {
  return w.trim().toLowerCase();
}

export function buildSimulationResult(
  scenarios: SimScenario[],
  responses: Record<string, SimSentenceResponse>,
): SimulationResult {
  const sentences: SimSentenceResult[] = [];
  const scenarioStats: SimScenarioStat[] = [];
  // 원문 표기를 살리기 위해 정규화 키 → 표시용 단어로 담는다.
  const caught = new Map<string, string>();
  let fallbackCount = 0;
  let expected = 0;

  for (const scenario of scenarios) {
    let answered = 0, smooth = 0, caughtCount = 0, unknown = 0, total = 0;

    for (const sentence of scenario.responseSentences) {
      expected += 1;
      const r = responses[sentence.id];
      if (!r) continue;   // 중간에 그만둔 문장은 집계에서 빠진다

      total += 1;
      if (r.ttsOutcome === 'fallback') fallbackCount += 1;

      if (r.assessment === 'unknown') {
        unknown += 1;
      } else {
        answered += 1;
        if (r.assessment === 'smooth') smooth += 1;
        if (isCaught(r.assessment)) {
          caughtCount += 1;
          for (const w of sentence.sourceWords) {
            const key = normalizeWord(w);
            if (key) caught.set(key, w);
          }
        }
      }

      sentences.push({
        sentenceId: sentence.id,
        scenarioId: scenario.id,
        scenarioLabel: scenario.label,
        text: sentence.text,
        sourceWords: sentence.sourceWords,
        origin: sentence.origin,
        assessment: r.assessment,
        ttsOutcome: r.ttsOutcome,
      });
    }

    scenarioStats.push({
      scenarioId: scenario.id,
      label: scenario.label,
      answered, smooth, caught: caughtCount, unknown, total,
    });
  }

  return {
    scenarios: scenarioStats,
    sentences,
    caughtWords: [...caught.values()],
    fallbackCount,
    completed: sentences.length === expected && expected > 0,
  };
}

/**
 * 상황에서 걸린 단어들의 정규화 집합.
 * 저장된(과거) 결과에도 안전하게 동작하도록 방어적으로 읽는다.
 */
export function caughtWordSet(sim: SimulationResult | undefined): Set<string> {
  const set = new Set<string>();
  for (const w of sim?.caughtWords ?? []) {
    const key = normalizeWord(w);
    if (key) set.add(key);
  }
  return set;
}

/** 어떤 단어가 어느 시나리오에서 걸렸는지 — 처방에 상황 맥락을 붙일 때 쓴다. */
export function scenariosOfWord(
  sim: SimulationResult | undefined,
  word: string,
): string[] {
  const key = normalizeWord(word);
  const labels = new Set<string>();
  for (const s of sim?.sentences ?? []) {
    if (!isCaught(s.assessment)) continue;
    if (s.sourceWords.some(w => normalizeWord(w) === key)) labels.add(s.scenarioLabel);
  }
  return [...labels];
}

/** 시뮬레이션 한 줄 요약 */
export function summarizeSimulation(sim: SimulationResult): string {
  const totalCaught = sim.scenarios.reduce((n, s) => n + s.caught, 0);
  const totalAnswered = sim.scenarios.reduce((n, s) => n + s.answered, 0);

  if (totalAnswered === 0) return '평가한 문장이 없어요.';
  if (totalCaught === 0) return `문장 ${totalAnswered}개를 상황 속에서 모두 무사히 말했어요. 👏`;

  const worst = [...sim.scenarios]
    .filter(s => s.answered > 0)
    .sort((a, b) => b.caught - a.caught)[0];

  return worst && worst.caught > 0
    ? `문장 ${totalCaught}개에서 걸렸고, '${worst.label}' 상황이 가장 어려웠어요.`
    : `문장 ${totalCaught}개에서 걸렸어요.`;
}
