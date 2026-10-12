/**
 * 앱 2 상태 기계 + 참가자 세션 (순수 함수).
 * HOME → EXPLORE(시간·별자리 선택, 학습 기록) → QUIZ(한 문제, 힌트 0→1→2) → SUCCESS → HOME(세션 초기화)
 */
export interface LearnedView {
  constellationId: string;
  slotId: string;
}

export interface Question {
  constellationId: string;
  slotId: string;
}

export type SkyState =
  | { mode: "home" }
  | { mode: "explore"; slotId: string; selectedId: string | null }
  | { mode: "quiz"; question: Question; hintLevel: 0 | 1 | 2 | 3; hasWrongAnswer: boolean; wrongCount: number }
  | { mode: "success"; question: Question };

export interface Session {
  learned: LearnedView[];
  lastQuestionConstellationId: string | null;
}

export type SkyEvent =
  | { type: "start-explore" }
  | { type: "select-slot"; slotId: string }
  | { type: "select-constellation"; constellationId: string }
  | { type: "close-detail" }
  | { type: "start-quiz" }
  | { type: "answer"; result: "correct" | "wrong" | "empty" }
  | { type: "hint" }
  | { type: "home" };

export type SkyEffect = { kind: "no-candidates" } | { kind: "learned"; view: LearnedView } | { kind: "reset-session" };

export const MAX_HINT_LEVEL = 3; // 1=선 잇기, 2=모양 씌우기, 3=초성

export interface SkyTransition {
  state: SkyState;
  session: Session;
  effects: SkyEffect[];
}

export interface SkyContext {
  defaultSlotId: string;
  /** 해당 시각에 선택(설명 보기) 가능한 별자리인지 */
  isSelectable(constellationId: string, slotId: string): boolean;
  /** 해당 시각의 출제 후보(필수 별 모두 15° 이상) */
  candidates(slotId: string): string[];
  rng(): number;
}

export function emptySession(): Session {
  return { learned: [], lastQuestionConstellationId: null };
}

export function addLearned(session: Session, view: LearnedView): Session {
  if (session.learned.some((v) => v.constellationId === view.constellationId && v.slotId === view.slotId)) return session;
  return { ...session, learned: [...session.learned, view] };
}

/**
 * 현재 시각에 보이는 별자리 중에서 무작위로 한 문제를 고른다(학습 여부와 무관).
 * 후보가 2개 이상이면 직전 문제와 다른 별자리를 고른다.
 */
export function pickQuestion(candidateIds: string[], slotId: string, lastConstellationId: string | null, rng: () => number): Question | null {
  const ids = Array.from(new Set(candidateIds));
  if (ids.length === 0) return null;
  const pool = ids.length > 1 && lastConstellationId ? ids.filter((id) => id !== lastConstellationId) : ids;
  const constellationId = pool[Math.floor(rng() * pool.length)];
  return { constellationId, slotId };
}

export function reduceSky(state: SkyState, session: Session, event: SkyEvent, ctx: SkyContext): SkyTransition {
  const keep = (effects: SkyEffect[] = []): SkyTransition => ({ state, session, effects });

  if (event.type === "home") {
    return { state: { mode: "home" }, session: emptySession(), effects: [{ kind: "reset-session" }] };
  }

  switch (state.mode) {
    case "home": {
      if (event.type === "start-explore") return { state: { mode: "explore", slotId: ctx.defaultSlotId, selectedId: null }, session, effects: [] };
      if (event.type === "start-quiz") return startQuiz(session, ctx, ctx.defaultSlotId);
      return keep();
    }
    case "explore": {
      if (event.type === "select-slot") {
        const selectable = state.selectedId && ctx.isSelectable(state.selectedId, event.slotId) ? state.selectedId : null;
        let next = session;
        if (selectable) next = addLearned(session, { constellationId: selectable, slotId: event.slotId });
        return {
          state: { mode: "explore", slotId: event.slotId, selectedId: selectable },
          session: next,
          effects: selectable ? [{ kind: "learned", view: { constellationId: selectable, slotId: event.slotId } }] : [],
        };
      }
      if (event.type === "select-constellation") {
        if (!ctx.isSelectable(event.constellationId, state.slotId)) return keep();
        const view = { constellationId: event.constellationId, slotId: state.slotId };
        return { state: { ...state, selectedId: event.constellationId }, session: addLearned(session, view), effects: [{ kind: "learned", view }] };
      }
      if (event.type === "close-detail") return { state: { ...state, selectedId: null }, session, effects: [] };
      if (event.type === "start-quiz") return startQuiz(session, ctx, state.slotId);
      return keep();
    }
    case "quiz": {
      if (event.type === "answer") {
        if (event.result === "empty") return keep();
        if (event.result === "correct") return { state: { mode: "success", question: state.question }, session, effects: [] };
        return { state: { ...state, hasWrongAnswer: true, wrongCount: state.wrongCount + 1 }, session, effects: [] };
      }
      if (event.type === "hint") {
        if (!state.hasWrongAnswer || state.hintLevel >= MAX_HINT_LEVEL) return keep();
        return { state: { ...state, hintLevel: (state.hintLevel + 1) as 1 | 2 | 3 }, session, effects: [] };
      }
      return keep();
    }
    case "success": {
      return keep(); // '처음으로 돌아가기'(home 이벤트)만 받는다
    }
  }
}

function startQuiz(session: Session, ctx: SkyContext, slotId: string): SkyTransition {
  const question = pickQuestion(ctx.candidates(slotId), slotId, session.lastQuestionConstellationId, ctx.rng);
  if (!question) return { state: { mode: "explore", slotId, selectedId: null }, session, effects: [{ kind: "no-candidates" }] };
  return {
    state: { mode: "quiz", question, hintLevel: 0, hasWrongAnswer: false, wrongCount: 0 },
    session: { ...session, lastQuestionConstellationId: question.constellationId },
    effects: [],
  };
}
