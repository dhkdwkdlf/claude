/** 한글 초성 힌트: 음절의 첫 자음만 남긴다. 한글이 아닌 글자는 그대로 둔다. */
const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

export function chosung(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code >= 0 && code < 11172) out += CHO[Math.floor(code / 588)];
    else out += ch;
  }
  return out;
}
