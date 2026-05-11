const CHOSEONG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

export function extractPhoneme(syllable: string): string {
  const char = syllable.trim()[0];
  if (!char) return '';
  const code = char.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return char;
  return CHOSEONG[Math.floor((code - 0xAC00) / 588)];
}
