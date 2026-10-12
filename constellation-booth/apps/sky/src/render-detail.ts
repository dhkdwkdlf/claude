/** 별자리 상세 그림 (SVG). 별 → 선 → 모양 레이어가 같은 좌표·viewBox 를 공유한다. */
import { svgEl } from "@shared/utils/dom.ts";
import type { Constellation, ConstellationFrame, SkySlot } from "@shared/types.ts";
import { fitSimilarity, layoutDetail, magnitudeRadius, similarityToSvgMatrix, type DetailLayout } from "./projection.ts";
import { SHAPES } from "./shapes.ts";

export interface DetailLayers {
  lines: boolean;
  shape: boolean;
  labels: boolean;
  twinkle: boolean;
}

export interface DetailRender {
  layout: DetailLayout;
  shapeFitError: number;
  setLayers(layers: Partial<DetailLayers>): void;
}

export function renderDetail(
  svg: SVGSVGElement,
  slot: SkySlot,
  constellation: Constellation,
  frame: ConstellationFrame,
  layers: DetailLayers,
  rng: () => number = Math.random,
): DetailRender {
  svg.setAttribute("viewBox", "0 0 1000 1000");
  svg.textContent = "";
  const view = slot.constellationViews[constellation.id];
  const starById = new Map(slot.stars.map((s) => [s.id, s]));
  const stars = constellation.starIds.map((id) => starById.get(id)).filter((s): s is NonNullable<typeof s> => !!s);
  const layout = layoutDetail(stars, view.centerAltitudeDeg, view.centerAzimuthDeg);

  const root = svgEl("g", { class: "detail" });

  // 모양 (가장 아래)
  const shapeG = svgEl("g", { class: "detail__shape" });
  const pairs: Array<[{ x: number; y: number }, { x: number; y: number }]> = [];
  for (const id of constellation.starIds) {
    const f = frame.stars[id];
    const p = layout.points[id];
    if (f && p) pairs.push([{ x: f[0], y: f[1] }, p]);
  }
  const sim = fitSimilarity(pairs);
  const shape = SHAPES[constellation.shapeAsset];
  if (shape) {
    const inner = svgEl("g", { transform: similarityToSvgMatrix(sim) });
    for (const d of shape.fills ?? []) inner.append(svgEl("path", { d, class: "detail__shape-fill" }));
    for (const d of shape.strokes) inner.append(svgEl("path", { d, class: "detail__shape-stroke", "vector-effect": "non-scaling-stroke" }));
    shapeG.append(inner);
  }
  root.append(shapeG);

  // 선
  const lineG = svgEl("g", { class: "detail__lines" });
  for (const [a, b] of constellation.edges) {
    const pa = layout.points[a];
    const pb = layout.points[b];
    if (!pa || !pb) continue;
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    lineG.append(svgEl("line", { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, "stroke-dasharray": len.toFixed(1), "stroke-dashoffset": "0", style: `--len:${len.toFixed(1)}` }));
  }
  root.append(lineG);

  // 별
  const starG = svgEl("g", { class: "detail__stars" });
  for (const s of stars) {
    const p = layout.points[s.id];
    const r = magnitudeRadius(s.magnitude, 11, 3.5);
    const required = constellation.requiredStarIds.includes(s.id);
    const star = svgEl("g", { class: `detail__star${required ? " is-required" : ""}`, style: `--delay:${(rng() * 2.4).toFixed(2)}s; --dur:${(1.8 + rng() * 1.6).toFixed(2)}s` });
    star.append(svgEl("circle", { cx: p.x, cy: p.y, r: r * 2.2, class: "detail__star-halo" }));
    star.append(svgEl("circle", { cx: p.x, cy: p.y, r, class: "detail__star-core" }));
    starG.append(star);
  }
  root.append(starG);

  // 이름 라벨 (학습·정답 화면에서만)
  const labelG = svgEl("g", { class: "detail__labels" });
  for (const [id, name] of Object.entries(constellation.starLabels ?? {})) {
    const p = layout.points[id];
    if (!p) continue;
    labelG.append(svgEl("text", { x: p.x + 16, y: p.y - 14, class: "detail__label" }, [document.createTextNode(name)]));
  }
  root.append(labelG);
  svg.append(root);

  const apply = (l: DetailLayers) => {
    svg.classList.toggle("show-lines", l.lines);
    svg.classList.toggle("show-shape", l.shape);
    svg.classList.toggle("show-labels", l.labels);
    svg.classList.toggle("twinkle", l.twinkle);
  };
  let current = { ...layers };
  apply(current);

  return {
    layout,
    shapeFitError: sim.rmsError,
    setLayers(partial) {
      current = { ...current, ...partial };
      apply(current);
    },
  };
}
