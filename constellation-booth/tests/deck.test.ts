import { test } from "node:test";
import assert from "node:assert/strict";
import { createDeckManager, shuffle, type DeckStore } from "../apps/fortune/src/deck.ts";

function memoryStore(failing = false): DeckStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get<T>(key: string, fallback: T): T {
      const raw = data.get(key);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    },
    set(key: string, value: unknown) {
      if (failing) return false;
      data.set(key, JSON.stringify(value));
      return true;
    },
    remove(key: string) {
      data.delete(key);
    },
  };
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const twelve = Array.from({ length: 12 }, (_, i) => `leo-${String(i + 1).padStart(2, "0")}`);

test("덱을 다 쓰기 전에는 같은 문안이 반복되지 않는다 (F-09)", () => {
  const deck = createDeckManager({ leo: twelve }, memoryStore(), seeded(1));
  const drawn = Array.from({ length: 12 }, () => deck.draw("leo"));
  assert.equal(new Set(drawn).size, 12);
  assert.deepEqual([...drawn].sort(), [...twelve].sort());
});

test("13회째(재셔플 후 첫 문안)는 직전 문안과 다르다", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const deck = createDeckManager({ leo: twelve }, memoryStore(), seeded(seed));
    let last = "";
    for (let i = 0; i < 12; i++) last = deck.draw("leo");
    const next = deck.draw("leo");
    assert.notEqual(next, last, `seed ${seed}`);
  }
});

test("shuffle 은 원본을 바꾸지 않고 같은 원소를 가진다", () => {
  const src = [1, 2, 3, 4, 5];
  const out = shuffle(src, seeded(7));
  assert.deepEqual(src, [1, 2, 3, 4, 5]);
  assert.deepEqual([...out].sort(), src);
});

test("진행 상태가 저장소에 보존되어 재시작 후 이어진다", () => {
  const store = memoryStore();
  const d1 = createDeckManager({ leo: twelve }, store, seeded(3));
  const first = [d1.draw("leo"), d1.draw("leo"), d1.draw("leo")];
  const d2 = createDeckManager({ leo: twelve }, store, seeded(99));
  const rest = Array.from({ length: 9 }, () => d2.draw("leo"));
  assert.equal(new Set([...first, ...rest]).size, 12, "재시작 후에도 덱이 이어져 12개가 모두 다르다");
});

test("저장소가 실패해도 메모리 덱으로 정상 동작한다", () => {
  const deck = createDeckManager({ leo: twelve }, memoryStore(true), seeded(5));
  const drawn = Array.from({ length: 12 }, () => deck.draw("leo"));
  assert.equal(new Set(drawn).size, 12);
});

test("저장된 덱이 데이터와 맞지 않으면(문안 변경) 새 덱을 만든다", () => {
  const store = memoryStore();
  store.set("fortune-decks", { leo: { order: ["old-1", "old-2"], index: 1, last: "old-1" } });
  const deck = createDeckManager({ leo: twelve }, store, seeded(11));
  const id = deck.draw("leo");
  assert.ok(twelve.includes(id));
});

test("문안이 없는 별자리는 오류를 던진다", () => {
  const deck = createDeckManager({ leo: twelve }, memoryStore(), seeded(1));
  assert.throws(() => deck.draw("nope"));
});
