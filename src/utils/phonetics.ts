export type ArticulationZone = '입술' | '혀끝' | '입천장' | '연구개' | '성대';

export const ZONES: ArticulationZone[] = ['입술', '혀끝', '입천장', '연구개', '성대'];

export const ZONE_PHONEMES: Record<ArticulationZone, string[]> = {
  입술:   ['ㅂ', 'ㅃ', 'ㅍ', 'ㅁ'],
  혀끝:   ['ㄴ', 'ㄷ', 'ㄸ', 'ㅌ', 'ㄹ', 'ㅅ', 'ㅆ'],
  입천장: ['ㅈ', 'ㅉ', 'ㅊ'],
  연구개: ['ㄱ', 'ㄲ', 'ㅋ', 'ㅇ'],
  성대:   ['ㅎ'],
};

export const PHONEME_ZONE: Record<string, ArticulationZone> = Object.fromEntries(
  Object.entries(ZONE_PHONEMES).flatMap(([zone, ps]) =>
    ps.map(p => [p, zone as ArticulationZone])
  )
);

export function getZoneFrequency(phonemes: string[]): Record<ArticulationZone, number> {
  const freq: Record<ArticulationZone, number> = {
    입술: 0, 혀끝: 0, 입천장: 0, 연구개: 0, 성대: 0,
  };
  for (const p of phonemes) {
    const zone = PHONEME_ZONE[p];
    if (zone) freq[zone]++;
  }
  return freq;
}
