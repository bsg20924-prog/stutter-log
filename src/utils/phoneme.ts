const CHOSEONG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

const JUNGSEONG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];

export function extractPhoneme(syllable: string): string {
  const char = syllable.trim()[0];
  if (!char) return '';
  const code = char.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return char;
  return CHOSEONG[Math.floor((code - 0xAC00) / 588)];
}

// 중성(모음) 추출. 모음 카드('아','오'…)는 초성이 항상 'ㅇ' 이라
// 초성만 보면 조음 위치가 왜곡되므로, 모음 자체를 봐야 한다.
export function extractVowel(syllable: string): string {
  const char = syllable.trim()[0];
  if (!char) return '';
  const code = char.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return '';
  return JUNGSEONG[Math.floor(((code - 0xAC00) % 588) / 28)];
}
