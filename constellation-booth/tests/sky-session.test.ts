import { test } from "node:test";
import assert from "node:assert/strict";
import { emptySession, pickQuestion, reduceSky, type Session, type SkyState } from "../apps/sky/src/session.ts";

const ctx = {
  defaultSlotId: "t20",
  isSelectable: (cid: string, sid: string) => !(cid === "orion" && sid !== "t00"),
  rng: () => 0.3,
};

function play(events: Parameters<typeof reduceSky>[2][], start: { state: SkyState; session: Session } = { state: { mode: "home" }, session: emptySession() }) {
  let { state, session } = start;
  const effects: string[] = [];
  for (const e of events) {
    const t = reduceSky(state, session, e, ctx);
    state = t.state;
    session = t.session;
    effects.push(...t.effects.map((f) => f.kind));
  }
  return { state, session, effects };
}

test("HOME 에서 학습 없이 퀴즈를 누르면 학습으로 연결하고 안내한다 (S-03)", () => {
  const r = play([{ type: "start-quiz" }]);
  assert.equal(r.state.mode, "explore");
  assert.ok(r.effects.includes("need-learning"));
});

test("설명을 본 별자리만 출제 후보가 된다", () => {
  const r = play([
    { type: "start-explore" },
    { type: "select-constellation", constellationId: "pegasus" },
    { type: "close-detail" },
    { type: "select-constellation", constellationId: "cygnus" },
    { type: "start-quiz" },
  ]);
  assert.equal(r.state.mode, "quiz");
  if (r.state.mode === "quiz") {
    assert.ok(["pegasus", "cygnus"].includes(r.state.question.constellationId));
    assert.equal(r.state.question.slotId, "t20");
    assert.equal(r.state.hintLevel, 0);
    assert.equal(r.state.hasWrongAnswer, false);
  }
});

test("보이지 않는 시각의 별자리는 선택되지 않는다", () => {
  const r = play([{ type: "start-explore" }, { type: "select-constellation", constellationId: "orion" }]);
  assert.equal(r.state.mode, "explore");
  if (r.state.mode === "explore") assert.equal(r.state.selectedId, null);
  assert.equal(r.session.learned.length, 0);
});

test("시간을 바꾸면 같은 별자리의 다른 시각 그림도 학습 기록에 남는다", () => {
  const r = play([
    { type: "start-explore" },
    { type: "select-constellation", constellationId: "pegasus" },
    { type: "select-slot", slotId: "t22" },
  ]);
  assert.deepEqual(r.session.learned, [
    { constellationId: "pegasus", slotId: "t20" },
    { constellationId: "pegasus", slotId: "t22" },
  ]);
});

test("오답은 힌트 버튼을 열고(S-05), 오답만으로 힌트 단계가 올라가지 않는다", () => {
  const base = play([{ type: "start-explore" }, { type: "select-constellation", constellationId: "lyra" }, { type: "start-quiz" }]);
  const hintBefore = play([{ type: "hint" }], base);
  assert.equal(hintBefore.state.mode === "quiz" && hintBefore.state.hintLevel, 0, "오답 전 힌트는 무시");
  const wrong = play([{ type: "answer", result: "wrong" }, { type: "answer", result: "wrong" }], base);
  assert.equal(wrong.state.mode === "quiz" && wrong.state.hasWrongAnswer, true);
  assert.equal(wrong.state.mode === "quiz" && wrong.state.hintLevel, 0);
  assert.equal(wrong.state.mode === "quiz" && wrong.state.wrongCount, 2);
});

test("힌트는 1회=선, 2회=모양, 3회째는 증가하지 않는다 (S-07)", () => {
  const base = play([{ type: "start-explore" }, { type: "select-constellation", constellationId: "lyra" }, { type: "start-quiz" }, { type: "answer", result: "wrong" }]);
  const h1 = play([{ type: "hint" }], base);
  assert.equal(h1.state.mode === "quiz" && h1.state.hintLevel, 1);
  const h2 = play([{ type: "hint" }], h1);
  assert.equal(h2.state.mode === "quiz" && h2.state.hintLevel, 2);
  const h3 = play([{ type: "hint" }], h2);
  assert.equal(h3.state.mode === "quiz" && h3.state.hintLevel, 2);
  assert.equal(h3.state.mode, "quiz", "세 번째 힌트로 정답이 공개되거나 문제가 바뀌지 않는다");
  // 힌트 뒤 오답도 단계를 유지
  const again = play([{ type: "answer", result: "wrong" }], h2);
  assert.equal(again.state.mode === "quiz" && again.state.hintLevel, 2);
});

test("빈 입력은 상태를 바꾸지 않는다", () => {
  const base = play([{ type: "start-explore" }, { type: "select-constellation", constellationId: "lyra" }, { type: "start-quiz" }]);
  const r = play([{ type: "answer", result: "empty" }], base);
  assert.deepEqual(r.state, base.state);
});

test("정답 → SUCCESS, 문제는 바뀌지 않고 '처음으로'만 HOME 으로 (S-08, S-09)", () => {
  const base = play([{ type: "start-explore" }, { type: "select-constellation", constellationId: "lyra" }, { type: "start-quiz" }]);
  const q = base.state.mode === "quiz" ? base.state.question : null;
  const ok = play([{ type: "answer", result: "correct" }], base);
  assert.equal(ok.state.mode, "success");
  if (ok.state.mode === "success") assert.deepEqual(ok.state.question, q);
  const stay = play([{ type: "answer", result: "correct" }, { type: "hint" }, { type: "start-quiz" }], ok);
  assert.equal(stay.state.mode, "success");
  const home = play([{ type: "home" }], ok);
  assert.equal(home.state.mode, "home");
  assert.deepEqual(home.session, emptySession(), "복귀 시 학습 목록·문제가 초기화된다 (S-10)");
});

test("후보가 2개 이상이면 직전 문제와 다른 별자리를 고른다", () => {
  const learned = [
    { constellationId: "a", slotId: "t20" },
    { constellationId: "b", slotId: "t20" },
    { constellationId: "c", slotId: "t20" },
  ];
  for (let i = 0; i < 50; i++) {
    const q = pickQuestion(learned, "b", Math.random);
    assert.notEqual(q?.constellationId, "b");
  }
  const only = pickQuestion([{ constellationId: "b", slotId: "t20" }], "b", Math.random);
  assert.equal(only?.constellationId, "b", "후보가 1개뿐이면 그 별자리를 출제할 수 있다");
  assert.equal(pickQuestion([], null, Math.random), null);
});
