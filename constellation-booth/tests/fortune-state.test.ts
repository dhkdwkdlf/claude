import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState, reduce, type FortuneState } from "../apps/fortune/src/state.ts";

const ctx = { drawFortune: (z: string) => `${z}-draw` };

function run(state: FortuneState, events: Parameters<typeof reduce>[1][]): { state: FortuneState; effects: string[] } {
  const effects: string[] = [];
  let s = state;
  for (const e of events) {
    const t = reduce(s, e, ctx);
    s = t.state;
    effects.push(...t.effects.map((f) => f.kind));
  }
  return { state: s, effects };
}

test("가운데 카드 한 번 탭은 PREVIEW 만, 운세는 열리지 않는다 (F-07)", () => {
  const { state, effects } = run(initialState("aries"), [{ type: "tap", cardId: "aries" }]);
  assert.equal(state.mode, "preview");
  assert.deepEqual(effects, ["enlarge"]);
});

test("확대 전이가 끝나기 전의 연속 탭은 무시된다", () => {
  const { state } = run(initialState("aries"), [
    { type: "tap", cardId: "aries" },
    { type: "tap", cardId: "aries" },
    { type: "tap", cardId: "aries" },
  ]);
  assert.equal(state.mode, "preview");
});

test("확대 완료 후 같은 카드 두 번째 탭에서만 FLIPPING → RESULT (F-08)", () => {
  const { state, effects } = run(initialState("leo"), [
    { type: "tap", cardId: "leo" },
    { type: "preview-ready" },
    { type: "tap", cardId: "leo" },
  ]);
  assert.equal(state.mode, "flipping");
  assert.ok(effects.includes("flip"));
  const done = reduce(state, { type: "flip-done" }, ctx).state;
  assert.equal(done.mode, "result");
  if (done.mode === "result") assert.equal(done.fortuneId, "leo-draw");
});

test("이웃 카드 탭은 중앙 정렬만 하고 운세를 열지 않는다", () => {
  const { state, effects } = run(initialState("aries"), [{ type: "tap", cardId: "taurus" }]);
  assert.equal(state.mode, "browse");
  if (state.mode === "browse") assert.equal(state.selectedId, "taurus");
  assert.deepEqual(effects, ["center"]);
});

test("PREVIEW 에서 드래그하면 BROWSE 로 축소·복귀한다", () => {
  const { state, effects } = run(initialState("aries"), [{ type: "tap", cardId: "aries" }, { type: "drag-start" }]);
  assert.equal(state.mode, "browse");
  assert.deepEqual(effects, ["enlarge", "shrink"]);
});

test("FLIPPING 중 반복 탭·드래그는 무시된다", () => {
  const { state } = run(initialState("virgo"), [
    { type: "tap", cardId: "virgo" },
    { type: "preview-ready" },
    { type: "tap", cardId: "virgo" },
    { type: "tap", cardId: "virgo" },
    { type: "drag-start" },
    { type: "return-slide" },
  ]);
  assert.equal(state.mode, "flipping");
});

test("RESULT 는 탭·대기로 바뀌지 않고, 슬라이드 또는 버튼으로만 RETURNING → BROWSE (F-11, F-12)", () => {
  const base = run(initialState("libra"), [
    { type: "tap", cardId: "libra" },
    { type: "preview-ready" },
    { type: "tap", cardId: "libra" },
    { type: "flip-done" },
  ]).state;
  assert.equal(base.mode, "result");
  const tapped = reduce(base, { type: "tap", cardId: "libra" }, ctx);
  assert.equal(tapped.state.mode, "result");
  assert.deepEqual(tapped.effects, []);
  const slid = reduce(base, { type: "return-slide" }, ctx);
  assert.equal(slid.state.mode, "returning");
  assert.deepEqual(slid.effects.map((f) => f.kind), ["spin-back"]);
  const back = reduce(slid.state, { type: "return-done" }, ctx).state;
  assert.equal(back.mode, "browse");
  if (back.mode === "browse") assert.equal(back.selectedId, "libra", "복귀 후 방금 고른 별자리를 중앙에 남긴다");
  const byButton = reduce(base, { type: "return-button" }, ctx);
  assert.equal(byButton.state.mode, "returning");
});

test("RETURNING 중 입력은 무시되고 같은 제스처로 새 결과가 열리지 않는다", () => {
  const base = run(initialState("pisces"), [
    { type: "tap", cardId: "pisces" },
    { type: "preview-ready" },
    { type: "tap", cardId: "pisces" },
    { type: "flip-done" },
    { type: "return-slide" },
  ]).state;
  const t = reduce(base, { type: "tap", cardId: "pisces" }, ctx);
  assert.equal(t.state.mode, "returning");
  assert.deepEqual(t.effects, []);
});

test("한 번의 탭으로 설명과 운세를 동시에 통과할 수 없다", () => {
  // 어떤 단일 이벤트도 browse 에서 result/flipping 으로 가지 않는다
  const events = [
    { type: "tap", cardId: "aries" },
    { type: "drag-start" },
    { type: "drag-end", centeredId: "aries" },
    { type: "preview-ready" },
    { type: "flip-done" },
    { type: "return-slide" },
    { type: "return-button" },
    { type: "return-done" },
  ] as const;
  for (const e of events) {
    const s = reduce(initialState("aries"), e, ctx).state;
    assert.notEqual(s.mode, "result", `${e.type} 가 결과를 바로 열었음`);
    assert.notEqual(s.mode, "flipping", `${e.type} 가 뒤집기를 바로 시작했음`);
  }
});
