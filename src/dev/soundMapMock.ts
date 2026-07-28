// 개발 전용 목업. 15개 카드를 전부 돌지 않고 결과 화면을 바로 보기 위한 데이터다.
// DiagnosticPanel 에서 동적 import 로만 불러오므로 프로덕션 번들에는 포함되지 않는다.

import { buildDefaultCards, makeCustomCard, SoundResponse } from '../data/soundMap';
import { computeSoundMapResult } from '../utils/soundMapResult';

// 임계점 5종(안전·압박 반응·목소리부터·소리 자체·모르겠음)과
// 과대예측·수동 압박 케이스가 전부 한 번씩 나오도록 짰다.
const MOCK: Record<string, SoundResponse> = {
  // 모음
  'vowel-1': { fear: 2, whisper: 'smooth', normal: 'smooth', recording: 'blocked', recordingMode: 'mic' },
  'vowel-2': { fear: 1, whisper: 'smooth', normal: 'smooth', recording: 'smooth', recordingMode: 'mic' },
  'vowel-3': { fear: 2, whisper: 'smooth', normal: 'smooth', recording: 'smooth', recordingMode: 'mic' },
  'vowel-4': { fear: 4, whisper: 'smooth', normal: 'partial', recording: 'blocked', recordingMode: 'mic' },
  'vowel-5': { fear: 2, whisper: 'smooth', normal: 'smooth', recording: 'smooth', recordingMode: 'mic' },
  'vowel-6': { fear: 3, whisper: 'smooth', normal: 'smooth', recording: 'unknown', recordingMode: 'mic' },
  // 자음
  'consonant-1': { fear: 5, whisper: 'blocked', normal: 'blocked', recording: 'blocked', recordingMode: 'mic' },
  'consonant-2': { fear: 4, whisper: 'smooth', normal: 'smooth', recording: 'blocked', recordingMode: 'mic' },
  'consonant-3': { fear: 4, whisper: 'smooth', normal: 'smooth', recording: 'partial', recordingMode: 'mic' },
  'consonant-4': { fear: 4, whisper: 'smooth', normal: 'smooth', recording: 'smooth', recordingMode: 'mic' },  // 과대예측
  'consonant-5': { fear: 3, whisper: 'smooth', normal: 'blocked', recording: 'blocked', recordingMode: 'mic' },
  'consonant-6': { fear: 2, whisper: 'smooth', normal: 'smooth', recording: 'smooth', recordingMode: 'mic' },
  'consonant-7': { fear: 1, whisper: 'smooth', normal: 'smooth', recording: 'smooth', recordingMode: 'mic' },
  'consonant-8': { fear: 3, whisper: 'unknown', normal: 'smooth', recording: 'smooth', recordingMode: 'manual' },
};

// 긴 사용자 단어 — 지도 칩 그리드에서 줄바꿈/넘침을 확인하는 용도도 겸한다.
const MOCK_CUSTOM_WORD = '아메리카노';

export function buildMockSoundMap() {
  const custom = makeCustomCard(MOCK_CUSTOM_WORD, 1);
  const cards = [...buildDefaultCards(), custom];

  const responses: Record<string, SoundResponse> = { ...MOCK };
  responses[custom.id] = {
    fear: 5, whisper: 'smooth', normal: 'smooth', recording: 'smooth', recordingMode: 'mic',
  };

  return computeSoundMapResult(cards, responses);
}
