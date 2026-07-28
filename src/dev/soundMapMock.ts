// 개발 전용 목업. 전체 카드를 다 돌지 않고 결과 화면을 바로 보기 위한 데이터다.
// SoundMapPanel 에서 동적 import 로만 불러오므로 프로덕션 번들에는 포함되지 않는다.

import { buildDefaultCards, makeCustomCard, SoundResponse, Assessment } from '../data/soundMap';
import { computeSoundMapResult } from '../utils/soundMapResult';

// 카드 id → [예상 긴장, 속삭임, 목소리, 녹음] 응답.
// 임계점 5종(안전·압박 반응·목소리부터·소리 자체·모르겠음)과 막힘 유형 3종,
// 그리고 과대예측·수동 압박 케이스가 모두 한 번씩 나오도록 짰다.
type Row = [fear: number, whisper: Assessment, normal: Assessment, recording: Assessment];

const S: Assessment = 'smooth';

const MOCK: Record<string, Row> = {
  // 공기 흐름(airway) — 모음/마찰음
  'monophthong-1': [2, S, S, 'blocked'],        // 아침 · 압박 반응
  'monophthong-2': [1, S, S, S],                // 오리 · 안전
  'monophthong-3': [4, S, S, S],                // Apple · 과대예측
  'diphthong-1':   [3, S, S, 'unknown'],        // 야구 · 모르겠음
  'diphthong-2':   [3, 'blocked', 'blocked', 'blocked'],  // 의사 · 소리 자체
  'diphthong-3':   [2, S, S, S],                // Ice
  'fricative-affricate-1': [3, S, 'partial', 'blocked'],  // 사과 · 목소리부터
  'fricative-affricate-2': [2, S, S, S],        // 치마
  'fricative-affricate-3': [2, S, S, S],        // Sun
  'fricative-affricate-4': [5, S, S, S],        // Fish · 과대예측
  'fricative-affricate-5': [3, S, S, 'partial'],// Street · 압박 반응 (조음)

  // 조음(articulation) — 입술/혀끝 파열음
  'plain-plosive-1': [4, S, 'blocked', 'blocked'],  // 바다 · 목소리부터
  'plain-plosive-2': [2, S, S, S],                  // 다리
  'plain-plosive-4': [2, S, S, S],                  // Door
  'tense-plosive-1': [3, 'partial', 'blocked', 'blocked'], // 뿌리 · 소리 자체
  'aspirated-plosive-1': [3, S, S, S],              // 파도
  'aspirated-plosive-2': [2, S, S, S],              // 태양
  'aspirated-plosive-4': [3, S, S, 'blocked'],      // Paper · 압박 반응
  'aspirated-plosive-5': [2, S, S, S],              // Table
  'aspirated-plosive-9': [3, S, S, S],              // Play
  'nasal-liquid-1': [1, S, S, S],                   // 나무
  'nasal-liquid-2': [1, S, S, S],                   // 모자

  // 후두(laryngeal) — 연구개음
  'plain-plosive-3': [5, 'blocked', 'blocked', 'blocked'], // 가방 · 소리 자체
  'tense-plosive-2': [4, S, S, 'blocked'],                 // 코끼리 · 압박 반응
  'aspirated-plosive-3': [3, S, 'blocked', 'blocked'],     // 기차 · 목소리부터
  'aspirated-plosive-6': [3, S, S, S],                     // Coffee
  'aspirated-plosive-7': [2, S, S, S],                     // King
  'aspirated-plosive-10': [3, S, S, 'unknown'],            // Clock · 모르겠음
};

// 마이크 없이 진행한 것으로 표시할 카드 (수동 압박 안내가 뜨는지 확인용)
const MANUAL_CARDS = new Set(['diphthong-1', 'nasal-liquid-2']);

// 긴 사용자 단어 — 지도 칩 그리드에서 줄바꿈/넘침을 확인하는 용도도 겸한다.
const MOCK_CUSTOM_WORD = '아메리카노';

export function buildMockSoundMap() {
  const custom = makeCustomCard(MOCK_CUSTOM_WORD, 1);
  const cards = [...buildDefaultCards(), custom];

  const responses: Record<string, SoundResponse> = {};
  for (const card of cards) {
    const row = MOCK[card.id];
    const [fear, whisper, normal, recording]: Row = row ?? [2, S, S, S];
    responses[card.id] = {
      fear,
      whisper,
      normal,
      recording,
      recordingMode: MANUAL_CARDS.has(card.id) ? 'manual' : 'mic',
    };
  }
  // 사용자 단어는 무섭다고 했지만 다 통과 — 과대예측 카드에 잡힌다.
  responses[custom.id] = { fear: 5, whisper: S, normal: S, recording: S, recordingMode: 'mic' };

  return computeSoundMapResult(cards, responses);
}
