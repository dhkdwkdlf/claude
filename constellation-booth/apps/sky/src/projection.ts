/**
 * 투영 (순수 함수)
 * - 전체 하늘 지도: 방위각 기반 등거리 투영. 하늘을 올려다본 모습 — 북쪽 위, 동쪽 왼쪽, 남쪽 아래, 서쪽 오른쪽.
 * - 상세 그림: 별자리 중심을 향해 마주 선 모습 — 위가 천정 방향, 방위각이 커지는 쪽이 오른쪽.
 * - 모양 오버레이: 기준 프레임(적도좌표, 북쪽 위·동쪽 왼쪽) → 상세 그림으로 가는 닮음 변환(최소제곱).
 */
const D2R = Math.PI / 180;

export interface Point {
  x: number;
  y: number;
}

/** 전체 지도. alt<0 는 null. */
export function skyMapPoint(altDeg: number, azDeg: number, cx: number, cy: number, radius: number): Point | null {
  if (altDeg < 0) return null;
  const r = (radius * (90 - altDeg)) / 90;
  const a = azDeg * D2R;
  return { x: cx - r * Math.sin(a), y: cy - r * Math.cos(a) };
}

/** 지평선 원 위의 방위 라벨 위치 */
export function compassPoint(azDeg: number, cx: number, cy: number, radius: number): Point {
  const a = azDeg * D2R;
  return { x: cx - radius * Math.sin(a), y: cy - radius * Math.cos(a) };
}

/** 지평좌표 심사(gnomonic) 투영: 반환 x 오른쪽+, y 위+ (라디안 단위) */
export function gnomonicHorizontal(altDeg: number, azDeg: number, alt0Deg: number, az0Deg: number): Point {
  const alt = altDeg * D2R;
  const alt0 = alt0Deg * D2R;
  const dAz = (azDeg - az0Deg) * D2R;
  const cosc = Math.sin(alt0) * Math.sin(alt) + Math.cos(alt0) * Math.cos(alt) * Math.cos(dAz);
  const x = (Math.cos(alt) * Math.sin(dAz)) / cosc;
  const y = (Math.cos(alt0) * Math.sin(alt) - Math.sin(alt0) * Math.cos(alt) * Math.cos(dAz)) / cosc;
  return { x, y };
}

export interface DetailLayout {
  /** 별 ID → viewBox 좌표 (0..1000) */
  points: Record<string, Point>;
  unitsPerRadian: number;
}

/**
 * 별자리 상세 그림 배치. 모든 별이 1000×1000 상자 안(760 폭)에 들어가게 균일 축척으로 맞춘다.
 * 중심(alt0, az0)은 데이터의 필수 별 평균 위치를 사용한다.
 */
export function layoutDetail(stars: Array<{ id: string; altitudeDeg: number; azimuthDeg: number }>, alt0: number, az0: number, extent = 760): DetailLayout {
  const raw: Record<string, Point> = {};
  for (const s of stars) {
    const p = gnomonicHorizontal(s.altitudeDeg, s.azimuthDeg, alt0, az0);
    raw[s.id] = { x: p.x, y: -p.y };
  }
  const xs = Object.values(raw).map((p) => p.x);
  const ys = Object.values(raw).map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const scale = extent / span;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const points: Record<string, Point> = {};
  for (const [id, p] of Object.entries(raw)) points[id] = { x: 500 + (p.x - cx) * scale, y: 500 + (p.y - cy) * scale };
  return { points, unitsPerRadian: scale };
}

export interface Similarity {
  a: number; // scale*cos
  b: number; // scale*sin
  tx: number;
  ty: number;
  rmsError: number;
}

/** z_i → w_i 최소제곱 닮음 변환 (회전+균일 축척+이동, 반사 없음). SVG matrix(a, b, -b, a, tx, ty) */
export function fitSimilarity(pairs: Array<[Point, Point]>): Similarity {
  const n = pairs.length;
  if (n === 0) return { a: 1, b: 0, tx: 0, ty: 0, rmsError: 0 };
  let zx = 0, zy = 0, wx = 0, wy = 0;
  for (const [z, w] of pairs) {
    zx += z.x; zy += z.y; wx += w.x; wy += w.y;
  }
  zx /= n; zy /= n; wx /= n; wy /= n;
  let num_re = 0, num_im = 0, den = 0;
  for (const [z, w] of pairs) {
    const dzx = z.x - zx, dzy = z.y - zy, dwx = w.x - wx, dwy = w.y - wy;
    // conj(dz) * dw
    num_re += dzx * dwx + dzy * dwy;
    num_im += dzx * dwy - dzy * dwx;
    den += dzx * dzx + dzy * dzy;
  }
  const a = den ? num_re / den : 1;
  const b = den ? num_im / den : 0;
  const tx = wx - (a * zx - b * zy);
  const ty = wy - (b * zx + a * zy);
  let err = 0;
  for (const [z, w] of pairs) {
    const px = a * z.x - b * z.y + tx;
    const py = b * z.x + a * z.y + ty;
    err += (px - w.x) ** 2 + (py - w.y) ** 2;
  }
  return { a, b, tx, ty, rmsError: Math.sqrt(err / n) };
}

export function similarityToSvgMatrix(s: Similarity): string {
  return `matrix(${s.a.toFixed(5)} ${s.b.toFixed(5)} ${(-s.b).toFixed(5)} ${s.a.toFixed(5)} ${s.tx.toFixed(2)} ${s.ty.toFixed(2)})`;
}

/** 등급 → 반지름(viewBox 단위) */
export function magnitudeRadius(mag: number, base = 9, min = 3.2): number {
  return Math.max(min, base - mag * 1.9);
}
