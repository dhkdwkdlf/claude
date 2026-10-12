import "@shared/styles/tokens.css";
import "@shared/styles/base.css";
import "./styles.css";

import configJson from "@data/event-config.json";
import constellationsJson from "@data/constellations.json";
import slotsJson from "@data/sky-slots.json";
import framesJson from "@data/constellation-frames.json";
import metaJson from "@data/sky-data-metadata.json";
import placementsJson from "@data/shape-placements.json";

import type { Constellation, ConstellationFrame, EventConfig, SkyDataMetadata, SkySlot } from "@shared/types.ts";
import { $, el, onMultiTap, switchScreen } from "@shared/utils/dom.ts";
import { createStorage } from "@shared/utils/storage.ts";
import { guessLowPerformance, prefersReducedMotion, requestWakeLock } from "@shared/utils/device.ts";
import { mountStarsBackground } from "@shared/utils/stars-bg.ts";
import { registerServiceWorker } from "@shared/pwa/register.ts";
import { createOperatorPanel } from "@shared/utils/operator-panel.ts";

import { bindSkyMapSelection, renderSkyMap } from "./render-sky.ts";
import { renderDetail, type DetailRender, type ShapePlacement } from "./render-detail.ts";
import { assetUrl } from "@shared/utils/assets.ts";
import { buildAnswerSet, checkAnswer } from "./normalize.ts";
import { emptySession, MAX_HINT_LEVEL, reduceSky, type Session, type SkyEvent, type SkyState } from "./session.ts";
import { chosung } from "./chosung.ts";
import { burstStardust } from "./effects.ts";

const BASE = import.meta.env.BASE_URL;
const config = configJson as unknown as EventConfig;
const constellations = (constellationsJson as unknown as { constellations: Constellation[] }).constellations;
const slots = (slotsJson as unknown as { slots: SkySlot[] }).slots;
const frames = (framesJson as unknown as { frames: Record<string, ConstellationFrame> }).frames;
const meta = metaJson as unknown as SkyDataMetadata;
const placements = (placementsJson as unknown as { placements: Record<string, ShapePlacement> }).placements;
const shapeImageFor = (id: string) => {
  const pl = placements[id];
  return pl ? { placement: pl, href: assetUrl(BASE, pl.asset) } : undefined;
};
const VERSION = __APP_VERSION__;

const conById = new Map(constellations.map((c) => [c.id, c]));
const slotById = new Map(slots.map((s) => [s.id, s]));
const answerSets = new Map(constellations.map((c) => [c.id, buildAnswerSet([...c.aliases, c.nameKo, c.shortAnswer])]));

/* ---------- 설정 ---------- */
interface Settings {
  lowPerformance: boolean;
  defaultSlotId: string;
  override: null | { eventDate: string; label: string; latitude: number; longitude: number; elevationM: number };
}
const storage = createStorage("booth-sky:");
const settings: Settings = {
  lowPerformance: config.lowPerformanceMode || guessLowPerformance(),
  defaultSlotId: config.defaultSlotId,
  override: null,
  ...storage.get<Partial<Settings>>("settings", {}),
};
if (!slotById.has(settings.defaultSlotId)) settings.defaultSlotId = config.defaultSlotId;
const reducedMotion = prefersReducedMotion();
document.body.classList.toggle("is-low-perf", settings.lowPerformance);
document.body.classList.toggle("is-reduced-motion", reducedMotion);

/** 설정과 생성 데이터가 같은 행사일·장소·시각으로 만들어졌는지 확인 */
function dataMismatch(): string | null {
  const problems: string[] = [];
  const eff = settings.override ?? { ...config.location, eventDate: config.eventDate };
  if (meta.eventDate !== eff.eventDate) problems.push(`행사일 (데이터 ${meta.eventDate} ≠ 설정 ${eff.eventDate})`);
  if (Math.abs(meta.location.latitude - eff.latitude) > 1e-6 || Math.abs(meta.location.longitude - eff.longitude) > 1e-6 || Math.abs(meta.location.elevationM - eff.elevationM) > 0.5) {
    problems.push(`관측 지점 (데이터 ${meta.location.latitude}, ${meta.location.longitude}, ${meta.location.elevationM}m ≠ 설정 ${eff.latitude}, ${eff.longitude}, ${eff.elevationM}m)`);
  }
  if (meta.timeZone !== config.timeZone) problems.push("시간대");
  const sign = config.utcOffsetMinutes >= 0 ? "+" : "-";
  const off = `${sign}${String(Math.floor(Math.abs(config.utcOffsetMinutes) / 60)).padStart(2, "0")}:${String(Math.abs(config.utcOffsetMinutes) % 60).padStart(2, "0")}`;
  for (const s of config.slots) {
    const m = meta.slots.find((x) => x.id === s.id);
    const expect = `${s.localDate}T${s.localTime}:00${off}`;
    if (!m || m.localISO !== expect || !slotById.has(s.id)) problems.push(`시간 슬롯 ${s.id}`);
  }
  return problems.length ? problems.join(", ") : null;
}
const mismatch = dataMismatch();
const noticeBar = $("#notice-bar");
if (mismatch) {
  noticeBar.hidden = false;
  noticeBar.textContent = "운영자 확인이 필요해요: 별자리 데이터가 현재 행사 설정과 달라요. (운영자 화면에서 확인)";
}

/* ---------- 화면 요소 ---------- */
const screens = {
  home: $("#screen-home"),
  explore: $("#screen-explore"),
  quiz: $("#screen-quiz"),
  success: $("#screen-success"),
};
const skySvg = $<SVGSVGElement>("#sky");
const homeSky = $<SVGSVGElement>("#home-sky");
const slotsEl = $("#slots");
const slotNote = $("#slot-note");
const chipsEl = $("#chips");
const detailPanel = $("#detail-panel");
const detailSvg = $<SVGSVGElement>("#detail-svg");
const quizSvg = $<SVGSVGElement>("#quiz-svg");
const successSvg = $<SVGSVGElement>("#success-svg");
const answerInput = $<HTMLInputElement>("#answer");
const feedback = $("#quiz-feedback");
const hintBtn = $<HTMLButtonElement>("#btn-hint");
const chosungEl = $("#quiz-chosung");
const exploreQuizHint = $("#explore-quiz-hint");
const exploreQuizBtn = $<HTMLButtonElement>("#btn-quiz-explore");
const metaLabel = `${config.eventDateLabel.replace(/\s*\S*요일$/, "")} · ${config.location.shortLabel} 기준 · 한국 시간`;
$("#home-meta").textContent = metaLabel;
$("#explore-meta").textContent = metaLabel;

/* ---------- 상태 ---------- */
let state: SkyState = { mode: "home" };
let session: Session = emptySession();
let currentScreen: HTMLElement = screens.home;
let detailRender: DetailRender | null = null;
let quizRender: DetailRender | null = null;
const layerPrefs = { lines: true, shape: true, labels: true };

const ctx = {
  defaultSlotId: settings.defaultSlotId,
  isSelectable: (cid: string, sid: string) => slotById.get(sid)?.constellationViews[cid]?.status === "visible",
  candidates: (sid: string) => slotById.get(sid)?.quizEligibleConstellationIds ?? [],
  rng: Math.random,
};

function dispatch(event: SkyEvent): void {
  const prev = state;
  const t = reduceSky(state, session, event, ctx);
  state = t.state;
  session = t.session;
  for (const fx of t.effects) {
    if (fx.kind === "no-candidates") exploreQuizHint.textContent = "이 시각에는 출제할 별자리가 없어요. 다른 시간을 골라 보세요.";
  }
  void render(prev);
}

async function render(prev: SkyState): Promise<void> {
  const target = screens[state.mode];
  if (target !== currentScreen) {
    const from = currentScreen;
    currentScreen = target;
    if (state.mode === "quiz") prepareQuiz();
    if (state.mode === "success") prepareSuccess();
    if (state.mode === "explore") prepareExplore(prev.mode === "explore" ? prev.slotId : null);
    if (state.mode === "home") prepareHome();
    await switchScreen(from, target, reducedMotion ? 120 : 240);
    if (state.mode === "success") playSuccessEffects();
    return;
  }
  if (state.mode === "explore") prepareExplore(prev.mode === "explore" ? prev.slotId : null);
  if (state.mode === "quiz") updateQuiz();
}

/* ---------- HOME ---------- */
function prepareHome(): void {
  const slot = slotById.get(settings.defaultSlotId) ?? slots[0];
  renderSkyMap(homeSky, slot, constellations, { selectedId: null, lowPerformance: settings.lowPerformance });
  answerInput.value = "";
  feedback.textContent = "";
  detailPanel.hidden = true;
}
prepareHome();
$("#btn-explore").addEventListener("click", () => dispatch({ type: "start-explore" }));
$("#btn-quiz-home").addEventListener("click", () => dispatch({ type: "start-quiz" }));

/* ---------- EXPLORE ---------- */
bindSkyMapSelection(skySvg, (id) => dispatch({ type: "select-constellation", constellationId: id }));
chipsEl.addEventListener("click", (e) => {
  const id = (e.target as Element | null)?.closest<HTMLButtonElement>(".chip[data-id]")?.dataset.id;
  if (id) dispatch({ type: "select-constellation", constellationId: id });
});

function slotButton(s: SkySlot): HTMLButtonElement {
  const b = el("button", { class: "slot", type: "button", role: "tab", "data-slot": s.id }, [s.labelKo, el("small", { text: s.localISO.slice(11, 16) })]);
  b.addEventListener("click", () => dispatch({ type: "select-slot", slotId: s.id }));
  return b;
}
slotsEl.append(...slots.map(slotButton));

function prepareExplore(prevSlotId: string | null): void {
  if (state.mode !== "explore") return;
  const slot = slotById.get(state.slotId)!;
  for (const b of slotsEl.querySelectorAll<HTMLButtonElement>(".slot")) {
    const active = b.dataset.slot === slot.id;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  }
  const dayNote = slot.isNextDay ? "다음 날 0시의 하늘이에요. " : "";
  slotNote.textContent = `${dayNote}${slot.twilightKo}`;

  const draw = () =>
    renderSkyMap(skySvg, slot, constellations, {
      selectedId: state.mode === "explore" ? state.selectedId : null,
      lowPerformance: settings.lowPerformance,
    });
  if (prevSlotId && prevSlotId !== slot.id && !reducedMotion) {
    skySvg.classList.add("is-switching");
    window.setTimeout(() => {
      draw();
      skySvg.classList.remove("is-switching");
    }, 200);
  } else draw();

  chipsEl.textContent = "";
  const learnedIds = new Set(session.learned.map((v) => v.constellationId));
  for (const c of constellations) {
    const st = slot.constellationViews[c.id].status;
    if (st === "belowHorizon") continue;
    if (st === "visible") {
      chipsEl.append(el("button", { class: `chip${learnedIds.has(c.id) ? " is-learned" : ""}${state.mode === "explore" && state.selectedId === c.id ? " is-on" : ""}`, type: "button", "data-id": c.id, text: c.nameKo }));
    } else {
      chipsEl.append(el("span", { class: "chip is-near", "aria-disabled": "true" }, [c.nameKo, " ", el("small", { text: "지평선 가까이" })]));
    }
  }

  const n = learnedIds.size;
  const pool = slot.quizEligibleConstellationIds.length;
  exploreQuizBtn.disabled = pool === 0;
  exploreQuizHint.textContent = pool === 0
    ? "이 시각에는 출제할 별자리가 없어요. 다른 시간을 골라 보세요."
    : n > 0
      ? `알아본 별자리 ${n}개 · 지금 보이는 ${pool}개 중 한 문제가 나와요.`
      : `지금 보이는 별자리 ${pool}개 중 한 문제가 나와요.`;

  if (state.selectedId) showDetail(slot, conById.get(state.selectedId)!);
  else detailPanel.hidden = true;
}

function whereText(slot: SkySlot, c: Constellation): string {
  const v = slot.constellationViews[c.id];
  return `${slot.labelKo}에는 ${v.whereKo} (고도 약 ${Math.round(v.centerAltitudeDeg)}°).`;
}

function showDetail(slot: SkySlot, c: Constellation): void {
  $("#detail-season").textContent = `대표 계절: ${c.seasonLabel} · ${c.nameEn}`;
  $("#detail-name").textContent = c.nameKo;
  $("#detail-where").textContent = whereText(slot, c);
  $("#detail-tip").textContent = c.findTip;
  $("#detail-desc").textContent = c.description;
  $("#detail-note").textContent = c.relatedNote ?? "";
  detailRender = renderDetail(detailSvg, slot, c, frames[c.id], { ...layerPrefs, twinkle: !settings.lowPerformance && !reducedMotion }, Math.random, shapeImageFor(c.id));
  for (const b of $("#layer-toggles").querySelectorAll<HTMLButtonElement>(".chip")) {
    const key = b.dataset.layer as keyof typeof layerPrefs;
    b.classList.toggle("is-on", layerPrefs[key]);
    b.setAttribute("aria-pressed", String(layerPrefs[key]));
  }
  detailPanel.hidden = false;
  detailPanel.querySelector(".detail-panel__inner")!.scrollTop = 0;
}
for (const b of $("#layer-toggles").querySelectorAll<HTMLButtonElement>(".chip")) {
  b.addEventListener("click", () => {
    const key = b.dataset.layer as keyof typeof layerPrefs;
    layerPrefs[key] = !layerPrefs[key];
    b.classList.toggle("is-on", layerPrefs[key]);
    b.setAttribute("aria-pressed", String(layerPrefs[key]));
    detailRender?.setLayers({ [key]: layerPrefs[key] });
  });
}
$("#btn-detail-close").addEventListener("click", () => dispatch({ type: "close-detail" }));
$("#btn-home-explore").addEventListener("click", () => dispatch({ type: "home" }));
$("#btn-home-detail").addEventListener("click", () => dispatch({ type: "home" }));
exploreQuizBtn.addEventListener("click", () => dispatch({ type: "start-quiz" }));
$("#btn-detail-quiz").addEventListener("click", () => dispatch({ type: "start-quiz" }));

/* ---------- QUIZ ---------- */
let composing = false;
answerInput.addEventListener("compositionstart", () => (composing = true));
answerInput.addEventListener("compositionend", () => (composing = false));
answerInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    if (e.isComposing || composing || (e as KeyboardEvent).keyCode === 229) {
      e.preventDefault(); // 한글 조합 중 Enter 는 제출하지 않는다
      return;
    }
    e.preventDefault();
    submitAnswer();
  }
});
$<HTMLFormElement>("#quiz-form").addEventListener("submit", (e) => {
  e.preventDefault();
  submitAnswer();
});
hintBtn.addEventListener("click", () => dispatch({ type: "hint" }));
$("#btn-home-quiz").addEventListener("click", () => dispatch({ type: "home" }));

function prepareQuiz(): void {
  if (state.mode !== "quiz") return;
  const c = conById.get(state.question.constellationId)!;
  const slot = slotById.get(state.question.slotId)!;
  quizRender = renderDetail(quizSvg, slot, c, frames[c.id], { lines: false, shape: false, labels: false, twinkle: !settings.lowPerformance && !reducedMotion }, Math.random, shapeImageFor(c.id));
  answerInput.value = "";
  feedback.textContent = "";
  feedback.classList.remove("is-wrong");
  chosungEl.hidden = true;
  updateQuiz();
}

function updateQuiz(): void {
  if (state.mode !== "quiz") return;
  const s = state;
  const c = conById.get(s.question.constellationId)!;
  quizRender?.setLayers({ lines: s.hintLevel >= 1, shape: s.hintLevel >= 2, labels: false });
  hintBtn.hidden = !s.hasWrongAnswer;
  const labels = ["힌트 보기", "모양 힌트 보기", "초성 힌트 보기", "힌트를 모두 봤어요"];
  hintBtn.textContent = labels[s.hintLevel];
  hintBtn.disabled = s.hintLevel >= MAX_HINT_LEVEL;
  if (s.hintLevel >= 3) {
    chosungEl.hidden = false;
    chosungEl.textContent = `초성 힌트: ${chosung(c.shortAnswer).split("").join(" ")}`;
  } else {
    chosungEl.hidden = true;
    chosungEl.textContent = "";
  }
}

function submitAnswer(): void {
  if (state.mode !== "quiz") return;
  if (composing) return;
  const c = conById.get(state.question.constellationId)!;
  const result = checkAnswer(answerInput.value, answerSets.get(c.id)!);
  if (result === "empty") {
    feedback.textContent = "별자리 이름을 적어 주세요.";
    return;
  }
  if (result === "wrong") {
    feedback.textContent = state.hasWrongAnswer ? "조금 달라요. 한 번 더 생각해 볼까요?" : "조금 달라요. 힌트를 보고 다시 생각해 볼까요?";
    feedback.classList.remove("is-wrong");
    void feedback.offsetWidth;
    feedback.classList.add("is-wrong");
    // 입력값은 유지하고, 강제 재포커스는 하지 않는다
  } else {
    answerInput.blur();
  }
  dispatch({ type: "answer", result });
}

/* ---------- SUCCESS ---------- */
function prepareSuccess(): void {
  if (state.mode !== "success") return;
  const c = conById.get(state.question.constellationId)!;
  const slot = slotById.get(state.question.slotId)!;
  $("#success-name").textContent = c.nameKo;
  $("#success-msg").textContent = `${c.nameKo}를 찾았어요.`;
  $("#success-where").textContent = whereText(slot, c);
  renderDetail(successSvg, slot, c, frames[c.id], { lines: true, shape: true, labels: true, twinkle: !settings.lowPerformance && !reducedMotion }, Math.random, shapeImageFor(c.id));
}
function playSuccessEffects(): void {
  burstStardust($<HTMLCanvasElement>("#dust"), { lowPerformance: settings.lowPerformance, reducedMotion });
  const meteor = $("#meteor");
  meteor.classList.remove("is-playing");
  void meteor.offsetWidth;
  meteor.classList.add("is-playing");
}
$("#btn-home-success").addEventListener("click", () => dispatch({ type: "home" }));

// 뒤로가기로 이전 결과가 되살아나지 않게: 히스토리를 쌓지 않고 항상 HOME 기준
window.addEventListener("popstate", () => {
  if (state.mode !== "home") dispatch({ type: "home" });
});

/* ---------- 배경·기기 ---------- */
const bg = mountStarsBackground($<HTMLCanvasElement>(".bg-stars"), { reducedMotion, lowPerformance: settings.lowPerformance });
void requestWakeLock();
void registerServiceWorker(BASE);

/* ---------- 운영자 ---------- */
const operator = createOperatorPanel({
  appName: "별자리 여행",
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
    const slotSel = el("select") as HTMLSelectElement;
    for (const s of slots) slotSel.append(el("option", { value: s.id, text: `${s.labelKo} (${s.localISO.slice(11, 16)})` }));
    slotSel.value = settings.defaultSlotId;
    slotSel.addEventListener("change", () => {
      settings.defaultSlotId = slotSel.value;
      ctx.defaultSlotId = slotSel.value;
      storage.set("settings", settings);
      prepareHome();
    });
    const eff = settings.override ?? { eventDate: config.eventDate, label: config.location.label, latitude: config.location.latitude, longitude: config.location.longitude, elevationM: config.location.elevationM };
    const date = el("input", { type: "date", value: eff.eventDate }) as HTMLInputElement;
    const label = el("input", { type: "text", value: eff.label }) as HTMLInputElement;
    const lat = el("input", { type: "number", step: "0.0001", value: String(eff.latitude) }) as HTMLInputElement;
    const lon = el("input", { type: "number", step: "0.0001", value: String(eff.longitude) }) as HTMLInputElement;
    const elev = el("input", { type: "number", step: "1", value: String(eff.elevationM) }) as HTMLInputElement;
    const saveOverride = () => {
      settings.override = { eventDate: date.value, label: label.value, latitude: Number(lat.value), longitude: Number(lon.value), elevationM: Number(elev.value) };
      storage.set("settings", settings);
      operator.open();
      const m = dataMismatch();
      noticeBar.hidden = !m;
      if (m) noticeBar.textContent = "운영자 확인이 필요해요: 별자리 데이터가 현재 행사 설정과 달라요. (운영자 화면에서 확인)";
    };
    for (const i of [date, label, lat, lon, elev]) i.addEventListener("change", saveOverride);
    const m = dataMismatch();
    return [
      {
        title: "행사 설정",
        statusText: m
          ? `데이터 재생성 필요: ${m}. 새 설정에 맞는 데이터가 없으므로 예전 데이터를 새 설정의 결과로 보여주지 않습니다. data/event-config.json 을 고치고 python3 scripts/generate-sky-data.py 로 다시 생성·빌드하거나, '설정 되돌리기'를 누르세요.`
          : `데이터와 설정 일치 (생성 ${meta.generatedAt.slice(0, 10)}, 지문 ${meta.configFingerprint}). 계산 기준점: ${meta.location.label} ${meta.location.latitude}°N, ${meta.location.longitude}°E, ${meta.location.elevationM} m${meta.location.isProvisional ? " (임시 대표점)" : ""}.`,
        statusKind: m ? "warn" : "ok",
        rows: [
          { label: "행사 날짜", control: date },
          { label: "지역명", control: label },
          { label: "위도", control: lat },
          { label: "경도", control: lon },
          { label: "고도(m)", control: elev },
          { label: "기본 시간", control: slotSel },
        ],
      },
      {
        title: "효과",
        rows: [{ label: "저사양 효과 모드", control: lowPerf, note: "별 반짝임·축하 효과를 줄입니다. 기능은 같습니다." }],
      },
      {
        title: "천문 데이터",
        statusText: `${String(meta.catalog.name)} · Skyfield ${meta.tools.skyfield} · ${meta.tools.ephemeris} · 굴절 ${meta.method.refraction}`,
        statusKind: "plain",
      },
      {
        title: "저장소",
        statusText: storage.available ? "로컬 저장소 사용 가능 (운영자 설정만 저장, 참가자 답안·기록은 저장하지 않음)" : `로컬 저장소를 쓸 수 없어 메모리로 동작 중: ${storage.lastError ?? ""}`,
        statusKind: storage.available ? "ok" : "warn",
      },
    ];
  },
  actions: [
    {
      label: "설정 되돌리기(데이터 기준)",
      onClick: () => {
        settings.override = null;
        storage.set("settings", settings);
        noticeBar.hidden = !dataMismatch();
        operator.open();
      },
    },
    {
      label: "참가자 화면 초기화",
      onClick: () => {
        dispatch({ type: "home" });
        operator.close();
      },
    },
  ],
});
onMultiTap($("#home-meta"), 5, 2500, () => operator.open());
if (location.hash === "#operator") operator.open();
window.addEventListener("hashchange", () => {
  if (location.hash === "#operator") operator.open();
});
