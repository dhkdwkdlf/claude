import { test } from "node:test";
import assert from "node:assert/strict";
import { compassPoint, fitSimilarity, gnomonicHorizontal, layoutDetail, skyMapPoint } from "../apps/sky/src/projection.ts";

test("전체 지도: 북쪽 위, 동쪽 왼쪽, 남쪽 아래, 서쪽 오른쪽", () => {
  const n = skyMapPoint(0, 0, 500, 500, 400)!;
  const e = skyMapPoint(0, 90, 500, 500, 400)!;
  const s = skyMapPoint(0, 180, 500, 500, 400)!;
  const w = skyMapPoint(0, 270, 500, 500, 400)!;
  assert.ok(Math.abs(n.x - 500) < 1e-9 && n.y < 500);
  assert.ok(e.x < 500 && Math.abs(e.y - 500) < 1e-9);
  assert.ok(Math.abs(s.x - 500) < 1e-9 && s.y > 500);
  assert.ok(w.x > 500 && Math.abs(w.y - 500) < 1e-9);
  const z = skyMapPoint(90, 123, 500, 500, 400)!;
  assert.ok(Math.abs(z.x - 500) < 1e-9 && Math.abs(z.y - 500) < 1e-9, "천정은 중심");
  assert.equal(skyMapPoint(-1, 0, 500, 500, 400), null, "지평선 아래는 그리지 않는다");
  const c = compassPoint(90, 500, 500, 400);
  assert.ok(c.x < 500);
});

test("상세 투영: 마주 본 모습에서 방위각이 큰 쪽이 오른쪽, 고도가 높은 쪽이 위", () => {
  const right = gnomonicHorizontal(40, 190, 40, 180);
  const up = gnomonicHorizontal(50, 180, 40, 180);
  // 같은 고도의 옆 점은 소원(小圓) 위에 있어 아주 조금 위로 보인다
  assert.ok(right.x > 0.1 && Math.abs(right.y) < 0.02);
  assert.ok(up.y > 0 && Math.abs(up.x) < 1e-9);
});

test("상세 배치는 1000 상자 안에 들어가고 상대 위치를 보존한다", () => {
  const stars = [
    { id: "a", altitudeDeg: 40, azimuthDeg: 180 },
    { id: "b", altitudeDeg: 45, azimuthDeg: 190 },
    { id: "c", altitudeDeg: 35, azimuthDeg: 170 },
  ];
  const l = layoutDetail(stars, 40, 180);
  for (const p of Object.values(l.points)) {
    assert.ok(p.x >= 100 && p.x <= 900 && p.y >= 100 && p.y <= 900);
  }
  assert.ok(l.points.b.x > l.points.a.x && l.points.b.y < l.points.a.y);
  assert.ok(l.points.c.x < l.points.a.x && l.points.c.y > l.points.a.y);
});

test("닮음 변환 최소제곱: 회전·축척·이동을 복원하고 반사는 쓰지 않는다", () => {
  const theta = 0.7;
  const s = 1.3;
  const tx = 40;
  const ty = -20;
  const src = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 0, y: 100 },
    { x: 60, y: 80 },
  ];
  const dst = src.map((p) => ({
    x: s * (Math.cos(theta) * p.x - Math.sin(theta) * p.y) + tx,
    y: s * (Math.sin(theta) * p.x + Math.cos(theta) * p.y) + ty,
  }));
  const f = fitSimilarity(src.map((p, i) => [p, dst[i]]));
  assert.ok(Math.abs(f.a - s * Math.cos(theta)) < 1e-9);
  assert.ok(Math.abs(f.b - s * Math.sin(theta)) < 1e-9);
  assert.ok(Math.abs(f.tx - tx) < 1e-7 && Math.abs(f.ty - ty) < 1e-7);
  assert.ok(f.rmsError < 1e-7);
  // 반사된 입력은 회전으로 맞출 수 없어 오차가 남는다
  const mirrored = src.map((p) => ({ x: -p.x, y: p.y }));
  const g = fitSimilarity(src.map((p, i) => [p, mirrored[i]]));
  assert.ok(g.rmsError > 10);
});
