/**
 * 운세 덱: 별자리마다 섞은 덱에서 순서대로 꺼낸다.
 * - 덱을 다 쓰기 전에는 같은 문안을 반복하지 않는다.
 * - 덱이 끝나면 재셔플하되 새 덱의 첫 문안이 직전 문안과 같지 않게 한다.
 * - 진행 상태만 저장한다(개인정보 없음). 저장 실패 시 메모리로 동작한다.
 */
export interface DeckProgress {
  order: string[];
  index: number;
  last: string | null;
}

export interface DeckStore {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): boolean;
  remove(key: string): void;
}

export interface DeckManager {
  draw(zodiacId: string): string;
  peekProgress(zodiacId: string): DeckProgress | null;
  reset(): void;
}

const KEY = "fortune-decks";

export function shuffle<T>(items: T[], rng: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createDeckManager(fortunesByZodiac: Record<string, string[]>, store: DeckStore, rng: () => number = Math.random): DeckManager {
  let decks: Record<string, DeckProgress> = store.get<Record<string, DeckProgress>>(KEY, {});

  const valid = (zodiacId: string, d: DeckProgress | undefined): d is DeckProgress => {
    if (!d || !Array.isArray(d.order)) return false;
    const ids = fortunesByZodiac[zodiacId] ?? [];
    return d.order.length === ids.length && d.order.every((id) => ids.includes(id)) && d.index >= 0 && d.index <= d.order.length;
  };

  const newDeck = (zodiacId: string, last: string | null): DeckProgress => {
    const ids = fortunesByZodiac[zodiacId] ?? [];
    let order = shuffle(ids, rng);
    if (order.length > 1 && last !== null && order[0] === last) {
      const j = 1 + Math.floor(rng() * (order.length - 1));
      [order[0], order[j]] = [order[j], order[0]];
    }
    return { order, index: 0, last };
  };

  return {
    draw(zodiacId: string): string {
      const ids = fortunesByZodiac[zodiacId];
      if (!ids || ids.length === 0) throw new Error(`운세 문안이 없는 별자리: ${zodiacId}`);
      const stored: DeckProgress | undefined = decks[zodiacId];
      const prevLast: string | null = stored && typeof stored.last === "string" ? stored.last : null;
      let deck: DeckProgress = valid(zodiacId, stored) ? stored : newDeck(zodiacId, prevLast);
      if (deck.index >= deck.order.length) deck = newDeck(zodiacId, deck.last);
      const id = deck.order[deck.index];
      deck = { ...deck, index: deck.index + 1, last: id };
      decks = { ...decks, [zodiacId]: deck };
      store.set(KEY, decks);
      return id;
    },
    peekProgress(zodiacId: string): DeckProgress | null {
      return decks[zodiacId] ?? null;
    },
    reset(): void {
      decks = {};
      store.remove(KEY);
    },
  };
}
