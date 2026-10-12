/**
 * 답안 정규화: NFC → 공백 제거 → 영문 소문자 → 문장부호 제거 → 끝의 '별자리'/'자리' 제거 → 별칭과 정확 비교.
 * 단어 중간의 '자리'는 지우지 않고, 부분 문자열 포함만으로 정답 처리하지 않는다.
 */
export const MAX_ANSWER_LENGTH = 24;

export function normalizeAnswer(raw: string): string {
  let s = raw.normalize("NFC");
  s = s.replace(/\s+/g, "");
  s = s.toLowerCase();
  s = s.replace(/[\p{P}\p{S}]/gu, "");
  if (s.endsWith("별자리")) s = s.slice(0, -3);
  else if (s.endsWith("자리")) s = s.slice(0, -2);
  return s;
}

export function buildAnswerSet(aliases: string[]): Set<string> {
  return new Set(aliases.map(normalizeAnswer).filter((a) => a.length > 0));
}

export type AnswerCheck = "correct" | "wrong" | "empty";

export function checkAnswer(raw: string, answerSet: Set<string>): AnswerCheck {
  const n = normalizeAnswer(raw.slice(0, MAX_ANSWER_LENGTH));
  if (n.length === 0) return "empty";
  return answerSet.has(n) ? "correct" : "wrong";
}
