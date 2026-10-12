import { test } from "node:test";
import assert from "node:assert/strict";
import { emptySession, pickQuestion, reduceSky, type Session, type SkyState } from "../apps/sky/src/session.ts";

const POOL: Record<string, string[]> = {
  t18: ["pegasus", "cygnus", "lyra"],
  t20: ["pegasus", "cygnus", "lyra", "perseus"],
  t22: ["pegasus", "perseus", "taurus"],
  t00: ["pegasus", "orion", "taurus"],
};
const ctx = {
  defaultSlotId: "t20",
  isSelectable: (cid: string, sid: string) => !(cid === "orion" && sid !== "t00"),
  candidates: (sid: string) => POOL[sid] ?? [],
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

test("HOME 에서 학습 없이도 바로 퀴즈가 시작된다 (기본 시각의 보이는 별자리 중 랜덤)", () => {
  const r = play([{ type: "start-quiz" }]);
  assert.equal(r.state.mode, "quiz");
  if (r.state.mode === "quiz") {
    assert.ok(POOL.t20.includes(r.state.question.constellationId));
    assert.equal(r.state.question.slotId, "t20");
    assert.equal(r.state.hintLevel, 0);
    assert.equal(r.state.hasWrongAnswer, false);
  }
});

test("탐색 중 퀴즈는 현재 시각에 보이는 별자리 중에서 출제된다 (방금 본 별자리 고정 아님)", () => {
  const r = play([
    { type: "start-explore" },
    { type: "select-slot", slotId: "t22" },
    { type: "select-constellation", constellationId: "pegasus" },
    { type: "start-quiz" },
  ]);
  assert.equal(r.state.mode, "quiz");
  if (r.state.mode === "quiz") {
    assert.ok(POOL.t22.includes(r.state.question.constellationId));
    assert.equal(r.state.question.slotId, "t22");
  }
  // 같은 흐름을 여러 난수로 돌리면 본 별자리 외의 것도 출제된다
  const seen = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const c = { ...ctx, rng: () => (i + 0.5) / 20 };
    const t = reduceSky({ mode: "explore", slotId: "t22", selectedId: "pegasus" }, emptySession(), { type: "start-quiz" }, c);
    if (t.state.mode === "quiz") seen.add(t.state.question.constellationId);
  }
  assert.ok(seen.size > 1, [...seen].join(","));
});

test("출제할 별자리가 없는 시각이면 탐색 화면에서 안내한다", () => {
  const c = { ...ctx, candidates: () => [] };
  const t = reduceSky({ mode: "home" }, emptySession(), { type: "start-quiz" }, c);
  assert.equal(t.state.mode, "explore");
  assert.ok(t.effects.some((f) => f.kind === "no-candidates"));
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

test("힌트는 1회=선, 2회=모양, 3회=초성, 4회째는 증가하지 않는다 (S-07)", () => {
  const base = play([{ type: "start-explore" }, { type: "select-constellation", constellationId: "lyra" }, { type: "start-quiz" }, { type: "answer", result: "wrong" }]);
  const h1 = play([{ type: "hint" }], base);
  assert.equal(h1.state.mode === "quiz" && h1.state.hintLevel, 1);
  const h2 = play([{ type: "hint" }], h1);
  assert.equal(h2.state.mode === "quiz" && h2.state.hintLevel, 2);
  const h3 = play([{ type: "hint" }], h2);
  assert.equal(h3.state.mode === "quiz" && h3.state.hintLevel, 3);
  const h4 = play([{ type: "hint" }], h3);
  assert.equal(h4.state.mode === "quiz" && h4.state.hintLevel, 3);
  assert.equal(h4.state.mode, "quiz", "네 번째 힌트로 정답이 공개되거나 문제가 바뀌지 않는다");
  // 힌트 뒤 오답도 단계를 유지
  const again = play([{ type: "answer", result: "wrong" }], h3);
  assert.equal(again.state.mode === "quiz" && again.state.hintLevel, 3);
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
  for (let i = 0; i < 50; i++) {
    const q = pickQuestion(["a", "b", "c"], "t20", "b", Math.random);
    assert.notEqual(q?.constellationId, "b");
    assert.equal(q?.slotId, "t20");
  }
  const only = pickQuestion(["b"], "t20", "b", Math.random);
  assert.equal(only?.constellationId, "b", "후보가 1개뿐이면 그 별자리를 출제할 수 있다");
  assert.equal(pickQuestion([], "t20", null, Math.random), null);
});

test("초성 힌트", async () => {
  const { chosung } = await import("../apps/sky/src/chosung.ts");
  assert.equal(chosung("페가수스"), "ㅍㄱㅅㅅ");
  assert.equal(chosung("카시오페이아"), "ㅋㅅㅇㅍㅇㅇ");
  assert.equal(chosung("양"), "ㅇ");
  assert.equal(chosung("Pegasus 1"), "Pegasus 1");
});
