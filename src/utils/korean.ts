// 한국어 음절 → 초성·중성·종성 분해
// 유니코드: 음절 = 0xAC00 + (초성 × 21 + 중성) × 28 + 종성

const CHOSEONG: string[] = [
  'ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ',
  'ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ',
];

const JUNGSEONG: string[] = [
  'ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ',
  'ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ',
];

// 인덱스 0 = 받침 없음
const JONGSEONG: string[] = [
  '','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ',
  'ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ',
  'ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ',
];

export interface SyllableComponents {
  chosung:   string;   // 초성 자음
  jungseong: string;   // 중성 모음
  jongseong: string | null;  // 종성 자음 (없으면 null)
}

// 완성 음절에서 종성 반환 (없으면 null)
export function getJongseong(syllable: string): string | null {
  const c = decomposeSyllable(syllable);
  return c?.jongseong ?? null;
}

// 완성 음절 또는 단독 자음 입력에서 초성 반환
const COMPAT_CONSONANTS = new Set(['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']);

export function getChosungFromInput(input: string): string | null {
  const char = input?.trim()[0];
  if (!char) return null;
  const code = char.charCodeAt(0);
  if (code >= 0xAC00 && code <= 0xD7A3) {
    return decomposeSyllable(char)?.chosung ?? null;
  }
  return COMPAT_CONSONANTS.has(char) ? char : null;
}

export function decomposeSyllable(input: string): SyllableComponents | null {
  const char = input.trim()[0];
  if (!char) return null;
  const code = char.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return null;

  const offset       = code - 0xAC00;
  const jongseongIdx = offset % 28;
  const jungseongIdx = Math.floor((offset % 588) / 28);
  const chosungIdx   = Math.floor(offset / 588);

  return {
    chosung:   CHOSEONG[chosungIdx],
    jungseong: JUNGSEONG[jungseongIdx],
    jongseong: jongseongIdx === 0 ? null : JONGSEONG[jongseongIdx],
  };
}
