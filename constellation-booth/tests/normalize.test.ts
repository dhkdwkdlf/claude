import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAnswerSet, checkAnswer, normalizeAnswer } from "../apps/sky/src/normalize.ts";

const pegasus = buildAnswerSet(["페가수스", "페가수스자리", "페가수스 별자리", "천마자리"]);
const taurus = buildAnswerSet(["황소", "황소자리", "황소 별자리"]);
const aries = buildAnswerSet(["양", "양자리", "양 별자리"]);
const orion = buildAnswerSet(["오리온", "오리온자리"]);

test("짧은 이름·전체 이름·공백 포함 정답은 통과 (S-04)", () => {
  for (const a of ["페가수스", "페가수스자리", "페가수스 자리", " 페가수스  별자리 ", "페가수스!", "페가수스자리."]) {
    assert.equal(checkAnswer(a, pegasus), "correct", a);
  }
  assert.equal(checkAnswer("양", aries), "correct");
  assert.equal(checkAnswer("양자리", aries), "correct");
});

test("다른 이름·부분 문자열은 실패", () => {
  assert.equal(checkAnswer("말", pegasus), "wrong");
  assert.equal(checkAnswer("소", taurus), "wrong");
  assert.equal(checkAnswer("사냥꾼", orion), "wrong");
  assert.equal(checkAnswer("페가", pegasus), "wrong");
  assert.equal(checkAnswer("페가수스자리자리", pegasus), "wrong");
  assert.equal(checkAnswer("안드로메다", pegasus), "wrong");
});

test("빈 입력·공백만은 유효 오답으로 세지 않는다", () => {
  assert.equal(checkAnswer("", pegasus), "empty");
  assert.equal(checkAnswer("   ", pegasus), "empty");
  assert.equal(checkAnswer("!!", pegasus), "empty");
});

test("NFC 정규화: 자모 분리형 입력도 같은 글자로 본다", () => {
  const decomposed = "페가수스".normalize("NFD");
  assert.notEqual(decomposed, "페가수스");
  assert.equal(checkAnswer(decomposed, pegasus), "correct");
});

test("단어 중간의 '자리'는 지우지 않는다", () => {
  assert.equal(normalizeAnswer("자리페가수스"), "자리페가수스");
  assert.equal(normalizeAnswer("페가수스자리"), "페가수스");
  assert.equal(normalizeAnswer("페가수스 별자리"), "페가수스");
});

test("영문은 소문자화한다", () => {
  const s = buildAnswerSet(["Pegasus"]);
  assert.equal(checkAnswer("PEGASUS", s), "correct");
});

test("24자를 넘는 입력은 잘라서 판정한다", () => {
  assert.equal(checkAnswer("페가수스" + "아".repeat(40), pegasus), "wrong");
});
