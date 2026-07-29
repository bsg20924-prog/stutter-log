// 소리 카드마다 '상황 + 문장'을 배정한다 (4단계용).
//
// 두 경로가 있고, 우선순위가 분명하다:
//   1) Gemini 키가 있으면 한 번의 호출로 전부 생성 — 단어에 맞는 자연스러운 문장
//   2) 없거나 실패하면 템플릿 — 오프라인·키 없음·네트워크 실패 전부 여기로 온다
//
// ⚠️ 템플릿은 '보조'가 아니라 **보장**이다. 이 앱은 오프라인 PWA 라
// 검사 도중 네트워크가 끊겼다고 사다리를 못 올라가면 안 된다.

import { SoundCard, SituationAssignment } from '../data/soundMap';
import { SimScenario, buildScenarios } from '../data/simulation';
import { generateSituationSentences, hasGeminiKey } from './gemini';

/**
 * 템플릿 문장 — 어떤 단어가 와도 문법이 깨지지 않는 틀만 쓴다.
 * 뜻이 어색해질 수는 있다(그건 Gemini 가 해결할 몫이고, 없으면 감수한다).
 * 대신 조사(을/를·이/가)가 필요한 틀은 절대 쓰지 않는다 — 받침 유무로 문법이 깨진다.
 */
const FALLBACK_TEMPLATES: Record<string, string[]> = {
  'order-cafe': ['{word} 주세요.', '{word} 하나 주세요.', '{word} 포장해 주세요.'],
  'introduction': ['제 관심사는 {word}입니다.', '{word} 이야기부터 해볼게요.', '{word} 쪽 일을 하고 있습니다.'],
  'phone-reservation': ['{word} 예약하려고 하는데요.', '{word} 되나요?', '{word} 문의드리려고 전화했습니다.'],
};

function scenarioMeta(scenarios: SimScenario[]) {
  return new Map(scenarios.map(s => [s.id, s]));
}

function templateFor(card: SoundCard, index: number, scenarios: SimScenario[]): SituationAssignment {
  // 상황을 고르게 돌린다 — 한 상황에만 몰리면 그 상황 하나만 재는 셈이 된다.
  const scenario = scenarios[index % scenarios.length];
  const templates = FALLBACK_TEMPLATES[scenario.id] ?? ['{word} 주세요.'];
  const template = templates[Math.floor(index / scenarios.length) % templates.length];
  return {
    scenarioId: scenario.id,
    scenarioLabel: scenario.label,
    ttsPrompt: scenario.ttsPrompt,
    sentence: template.replace('{word}', card.text),
    source: 'template',
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
  // 문장 틀만 필요하므로 도전 단어는 넘기지 않는다(여기서는 카드가 곧 단어다).
  const scenarios = buildScenarios([], []);
  const metaById = scenarioMeta(scenarios);

  // 1) 템플릿으로 먼저 전부 채워 둔다 — 이후 Gemini 결과로 덮어쓴다.
  //    이렇게 해야 Gemini 가 일부만 돌려줘도 빈 카드가 생기지 않는다.
  const assignments: Record<string, SituationAssignment> = {};
  cards.forEach((card, i) => {
    assignments[card.id] = templateFor(card, i, scenarios);
  });

  if (!hasGeminiKey()) {
    return { assignments, generatedCount: 0, geminiFailed: false };
  }

  const generated = await generateSituationSentences(
    cards.map(c => c.text),
    scenarios.map(s => ({ id: s.id, label: s.label, ttsPrompt: s.ttsPrompt })),
    signal,
  );

  if (!generated) {
    return { assignments, generatedCount: 0, geminiFailed: true };
  }

  // 2) 받은 문장으로 덮어쓴다. 같은 단어를 쓰는 카드가 여러 장일 수 있어
  //    단어 기준으로 찾아 붙인다.
  const byWord = new Map(generated.map(g => [g.word.trim().toLowerCase(), g]));
  let generatedCount = 0;

  for (const card of cards) {
    const hit = byWord.get(card.text.trim().toLowerCase());
    if (!hit) continue;
    const scenario = metaById.get(hit.scenarioId);
    if (!scenario) continue;
    assignments[card.id] = {
      scenarioId: scenario.id,
      scenarioLabel: scenario.label,
      ttsPrompt: scenario.ttsPrompt,
      sentence: hit.text,
      source: 'gemini',
    };
    generatedCount += 1;
  }

  return { assignments, generatedCount, geminiFailed: false };
}
