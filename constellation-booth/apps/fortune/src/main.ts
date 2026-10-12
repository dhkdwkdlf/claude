import "@shared/styles/tokens.css";
import "@shared/styles/base.css";
import "./styles.css";

import configJson from "@data/event-config.json";
import zodiacJson from "@data/zodiac.json";
import fortunesJson from "@data/fortunes.json";

import type { EventConfig, Fortune, ZodiacCard } from "@shared/types.ts";
import { $, el, onMultiTap } from "@shared/utils/dom.ts";
import { createStorage } from "@shared/utils/storage.ts";
import { guessLowPerformance, prefersReducedMotion, requestWakeLock } from "@shared/utils/device.ts";
import { mountStarsBackground } from "@shared/utils/stars-bg.ts";
import { registerServiceWorker } from "@shared/pwa/register.ts";
import { createOperatorPanel } from "@shared/utils/operator-panel.ts";

import { Carousel } from "./carousel.ts";
import { createDeckManager } from "./deck.ts";
import { attachGestures } from "./gestures.ts";
import { initialState, reduce, type FortuneEffect, type FortuneEvent, type FortuneState } from "./state.ts";

const config = configJson as unknown as EventConfig;
const cards = (zodiacJson as unknown as { cards: ZodiacCard[] }).cards;
const fortunes = (fortunesJson as unknown as { fortunes: Fortune[]; footerNote: string }).fortunes;
const footerNote = (fortunesJson as unknown as { footerNote: string }).footerNote;
const BASE = import.meta.env.BASE_URL;
const VERSION = __APP_VERSION__;

interface Settings {
  lowPerformance: boolean;
  lastSelectedId: string;
}

const storage = createStorage("booth-fortune:");
const settings: Settings = {
  lowPerformance: config.lowPerformanceMode || guessLowPerformance(),
  lastSelectedId: cards[0].id,
  ...storage.get<Partial<Settings>>("settings", {}),
};
const reducedMotion = prefersReducedMotion();
document.body.classList.toggle("is-low-perf", settings.lowPerformance);
document.body.classList.toggle("is-reduced-motion", reducedMotion);

const fortuneById = new Map(fortunes.map((f) => [f.id, f]));
const fortunesByZodiac: Record<string, string[]> = {};
for (const f of fortunes) (fortunesByZodiac[f.zodiacId] ??= []).push(f.id);
const deck = createDeckManager(fortunesByZodiac, storage);

/* ---------- DOM ---------- */
const stage = $("#stage");
const hintEl = $("#hint");
const returnBtn = $<HTMLButtonElement>("#return-btn");
$("#event-date").textContent = config.eventDateLabel;

const cardEls = cards.map((c) => {
  const art = el("div", { class: "card__art" }, [el("img", { src: `${BASE}${c.illustrationAsset}`, alt: "", draggable: "false", loading: "eager", decoding: "async" })]);
  const front = el("div", { class: "card__face card__front" }, [
    art,
    el("div", { class: "card__text" }, [
      el("h2", { class: "card__name", text: c.nameKo }),
      el("p", { class: "card__range", text: c.birthRangeLabel }),
      el("p", { class: "card__desc" }, [c.shortDescription, el("strong", { text: `한 번 더 누르면 ${config.fortune.titleDateLabel}의 운세를 볼 수 있어요.` })]),
    ]),
  ]);
  const back = el("div", { class: "card__face card__back" }, [
    el("div", {}, [
      el("p", { class: "fortune__title", text: config.fortune.resultTitle }),
      el("h2", { class: "fortune__name", text: c.nameKo }),
      el("div", { class: "fortune__ornament", "aria-hidden": "true" }),
    ]),
    el("div", { class: "fortune__body" }, [el("p", { class: "fortune__message" }), el("p", { class: "fortune__action" })]),
    el("p", { class: "fortune__note", text: footerNote }),
  ]);
  const card = el("article", { class: "card", "data-id": c.id, "aria-label": `${c.nameKo} ${c.birthRangeLabel}` }, [
    el("div", { class: "card__glow", "aria-hidden": "true" }),
    el("div", { class: "card__sparkles", "aria-hidden": "true" }, [el("i"), el("i"), el("i"), el("i"), el("i")]),
    el("div", { class: "card__inner" }, [front, back]),
  ]);
  return card;
});
stage.append(...cardEls);
const cardById = new Map(cards.map((c, i) => [c.id, cardEls[i]]));
const ids = cards.map((c) => c.id);

/* ---------- 크기 ---------- */
function layout(): void {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  const cardW = Math.min(w * 0.66, 380, (h * 0.86) / 1.5);
  const cardH = cardW * 1.5;
  stage.style.setProperty("--card-w", `${cardW.toFixed(1)}px`);
  stage.style.setProperty("--card-h", `${cardH.toFixed(1)}px`);
  stage.style.setProperty("--spacing", `${(cardW * 0.78).toFixed(1)}px`);
  carousel.setSpacing(cardW * 0.78);
}

/* ---------- 상태 ---------- */
const startId = ids.includes(settings.lastSelectedId) ? settings.lastSelectedId : ids[0];
let state: FortuneState = initialState(startId);
let dragMode: "none" | "carousel" | "return" | "ignore" = "none";

const carousel = new Carousel(
  cardEls,
  {
    count: cardEls.length,
    snapMs: reducedMotion ? 160 : 320,
    onSettled(index) {
      const id = ids[index];
      if (state.mode === "browse" && state.selectedId !== id) dispatch({ type: "drag-end", centeredId: id });
      else if (state.mode === "browse") persistSelected(id);
    },
  },
  ids.indexOf(startId),
);
layout();
window.addEventListener("resize", layout);

function persistSelected(id: string): void {
  settings.lastSelectedId = id;
  storage.set("settings", settings);
}

function durationMs(name: string, fallback: number): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (v.endsWith("ms")) return parseFloat(v);
  if (v.endsWith("s")) return parseFloat(v) * 1000;
  return fallback;
}

function dispatch(event: FortuneEvent): void {
  const { state: next, effects } = reduce(state, event, { drawFortune: (zid) => deck.draw(zid) });
  state = next;
  for (const fx of effects) runEffect(fx);
  renderChrome();
}

function runEffect(fx: FortuneEffect): void {
  const card = cardById.get(fx.cardId);
  if (!card) return;
  const inner = card.querySelector<HTMLElement>(".card__inner")!;
  switch (fx.kind) {
    case "center":
      carousel.centerOn(ids.indexOf(fx.cardId));
      break;
    case "enlarge": {
      card.classList.add("is-preview");
      once(inner, "transitionend", durationMs("--dur-preview", 260) + 40, () => {
        if (state.mode === "preview" && state.selectedId === fx.cardId) dispatch({ type: "preview-ready" });
      });
      break;
    }
    case "shrink":
      card.classList.remove("is-preview");
      break;
    case "flip": {
      const f = fortuneById.get(fx.fortuneId);
      if (f) {
        card.querySelector(".fortune__message")!.textContent = f.message;
        card.querySelector(".fortune__action")!.textContent = f.smallAction;
      }
      card.classList.remove("is-preview");
      card.classList.add("is-flipping");
      once(inner, "transitionend", durationMs("--dur-flip", 560) + 60, () => {
        card.classList.remove("is-flipping");
        card.classList.add("is-result");
        dispatch({ type: "flip-done" });
      });
      break;
    }
    case "spin-back": {
      card.classList.remove("is-result");
      card.classList.add("is-returning");
      once(inner, "transitionend", durationMs("--dur-flip", 560) + 60, () => {
        card.classList.add("no-transition");
        card.classList.remove("is-returning", "is-preview");
        void card.offsetWidth; // reflow: 360° → 0° 를 전이 없이 되돌림
        card.classList.remove("no-transition");
        dispatch({ type: "return-done" });
      });
      break;
    }
  }
}

/** transitionend 또는 시간 초과 중 먼저 오는 것으로 한 번만 콜백 */
function once(target: HTMLElement, type: string, timeoutMs: number, cb: () => void): void {
  let done = false;
  const fire = () => {
    if (done) return;
    done = true;
    target.removeEventListener(type, handler);
    cb();
  };
  const handler = (e: Event) => {
    if (e.target === target) fire();
  };
  target.addEventListener(type, handler);
  window.setTimeout(fire, timeoutMs);
}

function renderChrome(): void {
  const resultLike = state.mode === "result" || state.mode === "flipping";
  returnBtn.hidden = state.mode !== "result";
  switch (state.mode) {
    case "browse":
      hintEl.textContent = "옆으로 밀어 찾고, 가운데 카드를 두 번 눌러 보세요.";
      break;
    case "preview":
      hintEl.textContent = `한 번 더 누르면 ${config.fortune.titleDateLabel}의 운세를 볼 수 있어요.`;
      break;
    case "flipping":
    case "result":
      hintEl.textContent = "옆으로 밀면 다시 별자리를 고를 수 있어요.";
      break;
    case "returning":
      hintEl.textContent = "처음 화면으로 돌아가요.";
      break;
  }
  stage.classList.toggle("is-result", resultLike);
}

/* ---------- 입력 ---------- */
attachGestures(stage, {
  onTap(target) {
    if (state.mode === "result" || state.mode === "flipping" || state.mode === "returning") return;
    if (!carousel.isSettled()) return; // 정렬이 끝난 뒤의 탭만 인정
    const card = (target as Element | null)?.closest<HTMLElement>(".card");
    if (!card) return;
    dispatch({ type: "tap", cardId: card.dataset.id! });
  },
  onDragStart() {
    if (state.mode === "flipping" || state.mode === "returning") {
      dragMode = "ignore";
      return;
    }
    if (state.mode === "result") {
      dragMode = "return";
      return;
    }
    if (state.mode === "preview") dispatch({ type: "drag-start" });
    dragMode = "carousel";
    carousel.beginDrag();
  },
  onDragMove(dx) {
    if (dragMode === "carousel") carousel.dragTo(dx);
    else if (dragMode === "return") {
      const threshold = Math.min(50, stage.clientWidth * 0.12);
      if (Math.abs(dx) >= threshold) {
        dragMode = "ignore"; // 같은 제스처로 새 운세가 열리지 않도록 한 번만 처리
        dispatch({ type: "return-slide" });
      }
    }
  },
  onDragEnd(dx, velocity) {
    if (dragMode === "carousel") carousel.endDrag(dx, velocity, Math.min(50, stage.clientWidth * 0.12));
    dragMode = "none";
  },
  onDragCancel() {
    if (dragMode === "carousel") carousel.cancelDrag();
    dragMode = "none";
  },
});
returnBtn.addEventListener("click", () => dispatch({ type: "return-button" }));
renderChrome();

/* ---------- 배경·기기 ---------- */
const bg = mountStarsBackground($<HTMLCanvasElement>(".bg-stars"), { reducedMotion, lowPerformance: settings.lowPerformance });
void requestWakeLock();
void registerServiceWorker(BASE);

/* ---------- 운영자 ---------- */
const operator = createOperatorPanel({
  appName: "별자리 운세",
  version: VERSION,
  base: BASE,
  buildSections() {
    const lowPerf = el("input", { type: "checkbox" }) as HTMLInputElement;
    lowPerf.checked = settings.lowPerformance;
    lowPerf.addEventListener("change", () => {
      settings.lowPerformance = lowPerf.checked;
      storage.set("settings", settings);
      document.body.classList.toggle("is-low-perf", settings.lowPerformance);
      bg.setLowPerformance(settings.lowPerformance);
    });
    const progress = cards
      .map((c) => {
        const p = deck.peekProgress(c.id);
        return `${c.nameKo} ${p ? `${p.index}/${p.order.length}` : "0/" + (fortunesByZodiac[c.id]?.length ?? 0)}`;
      })
      .join(" · ");
    return [
      {
        title: "행사 설정 (데이터에 고정)",
        statusText: `행사일 ${config.eventDateLabel} · 운세 제목 "${config.fortune.resultTitle}" · 문안 ${fortunes.length}개 (별자리당 ${Math.min(...Object.values(fortunesByZodiac).map((v) => v.length))}개 이상). 날짜 변경은 data/event-config.json 수정 후 재빌드.`,
        statusKind: "plain",
      },
      {
        title: "효과",
        rows: [{ label: "저사양 효과 모드", control: lowPerf, note: "배경 별·반짝임을 줄입니다. 기능은 같습니다." }],
      },
      {
        title: "운세 덱 진행",
        statusText: progress,
        statusKind: "plain",
      },
      {
        title: "저장소",
        statusText: storage.available ? "로컬 저장소 사용 가능 (덱 진행·설정만 저장, 개인정보 없음)" : `로컬 저장소를 쓸 수 없어 메모리로 동작 중: ${storage.lastError ?? ""}`,
        statusKind: storage.available ? "ok" : "warn",
      },
    ];
  },
  actions: [
    {
      label: "운세 덱 초기화",
      onClick: () => {
        deck.reset();
        operator.open();
      },
    },
    {
      label: "참가자 화면 초기화",
      onClick: () => {
        resetParticipant();
        operator.close();
      },
    },
  ],
});
function resetParticipant(): void {
  for (const c of cardEls) c.classList.remove("is-preview", "is-flipping", "is-result", "is-returning");
  dispatch({ type: "reset" });
  carousel.centerOn(ids.indexOf(state.selectedId));
}
onMultiTap($("#event-date"), 5, 2500, () => operator.open());
if (location.hash === "#operator") operator.open();
window.addEventListener("hashchange", () => {
  if (location.hash === "#operator") operator.open();
});
