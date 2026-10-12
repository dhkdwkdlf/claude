/** 전체 하늘 지도 (SVG). 올려다본 하늘: 북쪽 위, 동쪽 왼쪽. */
import { svgEl } from "@shared/utils/dom.ts";
import type { Constellation, SkySlot } from "@shared/types.ts";
import { compassPoint, magnitudeRadius, skyMapPoint } from "./projection.ts";

export interface SkyMapOptions {
  selectedId: string | null;
  onSelect(constellationId: string): void;
  lowPerformance: boolean;
}

const VB = 1000;
const CX = 500;
const CY = 500;
const R = 440;

export function renderSkyMap(svg: SVGSVGElement, slot: SkySlot, constellations: Constellation[], opts: SkyMapOptions): void {
  svg.setAttribute("viewBox", `0 0 ${VB} ${VB}`);
  svg.textContent = "";
  const g = svgEl("g", { class: "skymap" });

  // 하늘 원판
  g.append(svgEl("circle", { cx: CX, cy: CY, r: R, class: "skymap__dome" }));
  for (const alt of [30, 60]) {
    g.append(svgEl("circle", { cx: CX, cy: CY, r: (R * (90 - alt)) / 90, class: "skymap__ring" }));
  }
  g.append(svgEl("circle", { cx: CX, cy: CY, r: R, class: "skymap__horizon" }));
  g.append(svgEl("circle", { cx: CX, cy: CY, r: 3, class: "skymap__zenith" }));

  // 방위 표시
  const compass: Array<[number, string]> = [
    [0, "북"],
    [90, "동"],
    [180, "남"],
    [270, "서"],
  ];
  for (const [az, label] of compass) {
    const p = compassPoint(az, CX, CY, R + 36);
    g.append(svgEl("text", { x: p.x, y: p.y, class: "skymap__compass", "text-anchor": "middle", "dominant-baseline": "middle" }, [document.createTextNode(label)]));
    const t = compassPoint(az, CX, CY, R);
    const t2 = compassPoint(az, CX, CY, R - 14);
    g.append(svgEl("line", { x1: t.x, y1: t.y, x2: t2.x, y2: t2.y, class: "skymap__tick" }));
  }

  const starPos = new Map<string, { x: number; y: number; mag: number }>();
  for (const s of slot.stars) {
    const p = skyMapPoint(s.altitudeDeg, s.azimuthDeg, CX, CY, R);
    if (p) starPos.set(s.id, { ...p, mag: s.magnitude });
  }

  const status = (id: string) => slot.constellationViews[id]?.status ?? "belowHorizon";

  // 연결선 (보이는 별자리는 선명하게, 지평선 가까이는 옅게)
  const lines = svgEl("g", { class: "skymap__lines" });
  for (const c of constellations) {
    const st = status(c.id);
    if (st === "belowHorizon") continue;
    const cg = svgEl("g", { class: `skymap__con skymap__con--${st}${opts.selectedId === c.id ? " is-selected" : ""}`, "data-id": c.id });
    for (const [a, b] of c.edges) {
      const pa = starPos.get(a);
      const pb = starPos.get(b);
      if (!pa || !pb) continue;
      cg.append(svgEl("line", { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y }));
    }
    lines.append(cg);
  }
  g.append(lines);

  // 별
  const stars = svgEl("g", { class: "skymap__stars" });
  const drawn = new Set<string>();
  for (const c of constellations) {
    const st = status(c.id);
    for (const id of c.starIds) {
      if (drawn.has(id)) continue;
      const p = starPos.get(id);
      if (!p) continue;
      drawn.add(id);
      const r = magnitudeRadius(p.mag, 6.5, 1.8) * (st === "belowHorizon" ? 0.7 : 1);
      stars.append(svgEl("circle", { cx: p.x, cy: p.y, r, class: `skymap__star${st === "visible" ? "" : " skymap__star--dim"}` }));
    }
  }
  g.append(stars);

  // 라벨 + 터치 영역 (별 점보다 크게). 겹치는 라벨은 아래로 밀어 배치한다.
  const labels = svgEl("g", { class: "skymap__labels" });
  const placed: Array<{ x: number; y: number; w: number }> = [];
  for (const c of constellations) {
    const st = status(c.id);
    if (st === "belowHorizon") continue;
    const view = slot.constellationViews[c.id];
    const p = skyMapPoint(view.centerAltitudeDeg, view.centerAzimuthDeg, CX, CY, R);
    if (!p) continue;
    const labelText = c.shortAnswer.length <= 2 ? c.nameKo : c.shortAnswer;
    const w = labelText.length * 24 + 24;
    let labelY = p.y + 44;
    for (let guard = 0; guard < 6; guard++) {
      const clash = placed.find((q) => Math.abs(q.y - labelY) < 34 && Math.abs(q.x - p.x) < (q.w + w) / 2);
      if (!clash) break;
      labelY = clash.y + 34;
    }
    placed.push({ x: p.x, y: labelY, w });
    const hit = svgEl("g", {
      class: `skymap__hit${st === "visible" ? " is-selectable" : " is-near"}${opts.selectedId === c.id ? " is-selected" : ""}`,
      "data-id": c.id,
      role: st === "visible" ? "button" : undefined,
      tabindex: st === "visible" ? 0 : undefined,
      "aria-label": st === "visible" ? `${c.nameKo} 설명 보기` : `${c.nameKo} (지평선 가까이)`,
    });
    hit.append(svgEl("circle", { cx: p.x, cy: p.y, r: 62, class: "skymap__hit-area" }));
    const text = svgEl("text", { x: p.x, y: labelY, class: "skymap__label", "text-anchor": "middle" }, [document.createTextNode(labelText)]);
    hit.append(svgEl("rect", { x: p.x - w / 2, y: labelY - 21, width: w, height: 30, rx: 15, class: "skymap__label-bg" }));
    hit.append(text);
    if (st === "visible") {
      const act = () => opts.onSelect(c.id);
      hit.addEventListener("click", act);
      hit.addEventListener("keydown", (e) => {
        if ((e as KeyboardEvent).key === "Enter" || (e as KeyboardEvent).key === " ") act();
      });
    }
    labels.append(hit);
  }
  g.append(labels);

  // 달 (지평선 위일 때만)
  if (slot.moon.altitudeDeg > 0) {
    const mp = skyMapPoint(slot.moon.altitudeDeg, slot.moon.azimuthDeg, CX, CY, R)!;
    g.append(svgEl("circle", { cx: mp.x, cy: mp.y, r: 10, class: "skymap__moon" }));
  }
  svg.append(g);
}
