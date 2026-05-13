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

// "A-B" 형식의 연결 발음 여부
export function isTransitionPhoneme(p: string): boolean {
  if (!p || typeof p !== 'string') return false;
  const parts = p.split('-');
  if (parts.length !== 2) return false;
  const [a, b] = parts.map(s => s.trim());
  return a.length > 0 && b.length > 0;
}

// "A-B" → [A, B] 파싱. 잘못된 형식이면 null
export function parseTransition(p: string): [string, string] | null {
  if (!p || typeof p !== 'string') return null;
  const parts = p.split('-');
  if (parts.length !== 2) return null;
  const [a, b] = parts.map(s => s.trim());
  if (!a || !b) return null;
  return [a, b];
}

// 연결 발음 표시 레이블 (예: "ㄱ → ㅂ (연결)")
export function formatTransitionLabel(p: string): string {
  const parsed = parseTransition(p);
  if (!parsed) return p;
  return `${parsed[0]} → ${parsed[1]} (연결)`;
}

// 단일 음소 또는 전이 음소에서 해당 조음 기관 배열 반환 (중복 제거)
export function phonemeToZones(p: string): ArticulationZone[] {
  if (!p) return [];
  const trans = parseTransition(p);
  if (trans) {
    const zones = trans
      .map(ph => PHONEME_ZONE[ph])
      .filter((z): z is ArticulationZone => !!z);
    return [...new Set(zones)];
  }
  const zone = PHONEME_ZONE[p];
  return zone ? [zone] : [];
}

export function getZoneFrequency(phonemes: string[]): Record<ArticulationZone, number> {
  const freq: Record<ArticulationZone, number> = {
    입술: 0, 혀끝: 0, 입천장: 0, 연구개: 0, 성대: 0,
  };
  for (const p of phonemes) {
    if (!p) continue;
    for (const zone of phonemeToZones(p)) {
      freq[zone]++;
    }
  }
  return freq;
}
