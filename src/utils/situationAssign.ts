// 소리 카드마다 '상황 + 문장'을 배정한다 (4단계용).
//
// 두 경로가 있고, 우선순위가 분명하다:
//   1) Gemini 키가 있으면 한 번의 호출로 전부 생성 — 단어에 맞는 자연스러운 문장
//   2) 없거나 실패하면 템플릿 — 오프라인·키 없음·네트워크 실패 전부 여기로 온다
//
// ⚠️ 템플릿은 '보조'가 아니라 **보장**이다. 이 앱은 오프라인 PWA 라
// 검사 도중 네트워크가 끊겼다고 사다리를 못 올라가면 안 된다.

import { SoundCard, SituationAssignment } from '../data/soundMap';
import { SCENARIO_LIST, getScenarioSeed, pickPrompt } from '../data/simulation';
import { generateSituationSentences, hasGeminiKey } from './gemini';

// 소리 지도는 카드가 28장이라 상황 전체를 고르게 돌린다 —
// 한 상황에만 몰리면 그 상황 하나만 재는 셈이 된다.
const ALL_IDS = SCENARIO_LIST.map(s => s.id);

/**
 * 템플릿 배정 — 네트워크 없이 즉시 만들 수 있다.
 * 호출부가 4단계를 절대 비워 두지 않도록 시작 시점에 바로 채우는 데도 쓴다.
 */
export function templateAssignment(card: SoundCard, index: number): SituationAssignment {
  const meta = SCENARIO_LIST[index % SCENARIO_LIST.length];
  const seed = getScenarioSeed(meta.id)!;
  // 같은 상황이 다시 돌아올 때마다 다른 틀·다른 멘트를 쓴다.
  const round = Math.floor(index / SCENARIO_LIST.length);
  const template = seed.templates[round % seed.templates.length];
  return {
    scenarioId: seed.id,
    scenarioLabel: seed.label,
    ttsPrompt: pickPrompt(seed.ttsPrompts, round),
    sentence: template.replace('{word}', card.text),
    source: 'template',
    ambientKey: seed.ambientKey,
  };
}

export interface AssignResult {
  /** cardId → 배정된 상황/문장 */
  assignments: Record<string, SituationAssignment>;
  /** Gemini 로 만든 문장 수 (0 이면 전부 템플릿) */
  generatedCount: number;
  /** Gemini 를 시도했지만 실패했는지 — 화면에 조용히 안내한다 */
  geminiFailed: boolean;
}

/**
 * 카드 전체에 상황 문장을 배정한다.
 * 절대 예외를 던지지 않는다 — 최악의 경우에도 템플릿으로 채운 결과가 나온다.
 */
export async function assignSituations(
  cards: SoundCard[],
  signal?: AbortSignal,
): Promise<AssignResult> {
  // 1) 템플릿으로 먼저 전부 채워 둔다 — 이후 Gemini 결과로 덮어쓴다.
  //    이렇게 해야 Gemini 가 일부만 돌려줘도 빈 카드가 생기지 않는다.
  const assignments: Record<string, SituationAssignment> = {};
  cards.forEach((card, i) => {
    assignments[card.id] = templateAssignment(card, i);
  });

  if (!hasGeminiKey()) {
    return { assignments, generatedCount: 0, geminiFailed: false };
  }

  const generated = await generateSituationSentences(
    cards.map(c => c.text),
    ALL_IDS.map(id => {
      const s = getScenarioSeed(id)!;
      return { id: s.id, label: s.label, hint: s.hint, role: s.role, samplePrompt: s.ttsPrompts[0] };
    }),
    signal,
  );

  if (!generated) {
    return { assignments, generatedCount: 0, geminiFailed: true };
  }

  // 2) 받은 문장으로 덮어쓴다. 같은 단어를 쓰는 카드가 여러 장일 수 있어
  //    단어 기준으로 찾아 붙인다.
  const byWord = new Map(generated.map(g => [g.word.trim().toLowerCase(), g]));
  // Gemini 가 멘트를 못 준 경우를 대비해 시나리오별 폴백 멘트를 돌려 쓴다.
  const promptRound = new Map<string, number>();
  let generatedCount = 0;

  for (const card of cards) {
    const hit = byWord.get(card.text.trim().toLowerCase());
    if (!hit) continue;
    const seed = getScenarioSeed(hit.scenarioId);
    if (!seed) continue;
    const round = promptRound.get(seed.id) ?? 0;
    promptRound.set(seed.id, round + 1);
    assignments[card.id] = {
      scenarioId: seed.id,
      scenarioLabel: seed.label,
      // 상대의 말도 Gemini 가 만든다. 못 만들었으면 고정 멘트를 돌려 쓴다.
      ttsPrompt: hit.prompt || pickPrompt(seed.ttsPrompts, round),
      sentence: hit.text,
      source: 'gemini',
      ambientKey: seed.ambientKey,
    };
    generatedCount += 1;
  }

  return { assignments, generatedCount, geminiFailed: false };
}
