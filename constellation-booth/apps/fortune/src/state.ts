/**
 * 앱 1 상태 기계 (순수 함수). UI 표시 여부를 boolean 으로 흩뜨리지 않고 여기서만 전이한다.
 *
 * BROWSE → (가운데 카드 탭) PREVIEW → (확대 완료 후 같은 카드 탭) FLIPPING → RESULT
 * RESULT → (좌우 슬라이드 / 처음으로) RETURNING → BROWSE (같은 카드 중앙 유지)
 */
export type FortuneState =
  | { mode: "browse"; selectedId: string }
  | { mode: "preview"; selectedId: string; ready: boolean }
  | { mode: "flipping"; selectedId: string; fortuneId: string }
  | { mode: "result"; selectedId: string; fortuneId: string }
  | { mode: "returning"; selectedId: string };

export type FortuneEvent =
  | { type: "tap"; cardId: string }
  | { type: "drag-start" }
  | { type: "drag-end"; centeredId: string }
  | { type: "preview-ready" }
  | { type: "flip-done" }
  | { type: "return-slide" }
  | { type: "return-button" }
  | { type: "return-done" }
  | { type: "reset"; selectedId?: string };

export type FortuneEffect =
  | { kind: "center"; cardId: string }
  | { kind: "enlarge"; cardId: string }
  | { kind: "shrink"; cardId: string }
  | { kind: "flip"; cardId: string; fortuneId: string }
  | { kind: "spin-back"; cardId: string };

export interface FortuneContext {
  drawFortune(zodiacId: string): string;
}

export interface Transition {
  state: FortuneState;
  effects: FortuneEffect[];
}

export function reduce(state: FortuneState, event: FortuneEvent, ctx: FortuneContext): Transition {
  const same = (effects: FortuneEffect[] = []): Transition => ({ state, effects });

  if (event.type === "reset") {
    return { state: { mode: "browse", selectedId: event.selectedId ?? state.selectedId }, effects: [] };
  }

  switch (state.mode) {
    case "browse": {
      if (event.type === "tap") {
        if (event.cardId === state.selectedId) {
          return { state: { mode: "preview", selectedId: state.selectedId, ready: false }, effects: [{ kind: "enlarge", cardId: state.selectedId }] };
        }
        // 이웃 카드 탭: 중앙 정렬만. 운세는 열리지 않는다.
        return { state: { mode: "browse", selectedId: event.cardId }, effects: [{ kind: "center", cardId: event.cardId }] };
      }
      if (event.type === "drag-end") return { state: { mode: "browse", selectedId: event.centeredId }, effects: [] };
      return same();
    }
    case "preview": {
      if (event.type === "preview-ready") return { state: { ...state, ready: true }, effects: [] };
      if (event.type === "tap") {
        if (event.cardId !== state.selectedId) {
          return { state: { mode: "browse", selectedId: event.cardId }, effects: [{ kind: "shrink", cardId: state.selectedId }, { kind: "center", cardId: event.cardId }] };
        }
        if (!state.ready) return same(); // 확대 전이 중 연속 탭은 무시
        const fortuneId = ctx.drawFortune(state.selectedId);
        return { state: { mode: "flipping", selectedId: state.selectedId, fortuneId }, effects: [{ kind: "flip", cardId: state.selectedId, fortuneId }] };
      }
      if (event.type === "drag-start") {
        return { state: { mode: "browse", selectedId: state.selectedId }, effects: [{ kind: "shrink", cardId: state.selectedId }] };
      }
      if (event.type === "drag-end") return { state: { mode: "browse", selectedId: event.centeredId }, effects: [{ kind: "shrink", cardId: state.selectedId }] };
      return same();
    }
    case "flipping": {
      if (event.type === "flip-done") return { state: { mode: "result", selectedId: state.selectedId, fortuneId: state.fortuneId }, effects: [] };
      return same(); // 뒤집는 동안 모든 입력 무시
    }
    case "result": {
      if (event.type === "return-slide" || event.type === "return-button") {
        return { state: { mode: "returning", selectedId: state.selectedId }, effects: [{ kind: "spin-back", cardId: state.selectedId }] };
      }
      return same(); // 탭·대기: 그대로 유지. 자동 닫기·재추첨 없음
    }
    case "returning": {
      if (event.type === "return-done") return { state: { mode: "browse", selectedId: state.selectedId }, effects: [] };
      return same();
    }
  }
}

export function initialState(selectedId: string): FortuneState {
  return { mode: "browse", selectedId };
}
