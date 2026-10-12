/** 생성 데이터의 불변식: 날짜 변환, 가시성 필터, 별 ID 대응, 프레임 정합 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fitSimilarity, layoutDetail } from "../apps/sky/src/projection.ts";

const read = (p: string) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), "utf8"));
const config = read("event-config.json");
const slotsDoc = read("sky-slots.json");
const cons = read("constellations.json").constellations;
const frames = read("constellation-frames.json").frames;
const meta = read("sky-data-metadata.json");

test("행사일·시간대·다음 날 0시 변환 (S-01, F-10)", () => {
  assert.equal(config.eventDate, "2026-11-04");
  assert.equal(config.timeZone, "Asia/Seoul");
  const byId = Object.fromEntries(slotsDoc.slots.map((s: { id: string }) => [s.id, s]));
  assert.equal(byId.t20.localISO, "2026-11-04T20:00:00+09:00");
  assert.equal(byId.t20.utcISO, "2026-11-04T11:00:00Z");
  assert.equal(byId.t00.localISO, "2026-11-05T00:00:00+09:00", "00:00 는 11월 5일");
  assert.equal(byId.t00.utcISO, "2026-11-04T15:00:00Z");
  assert.equal(byId.t00.isNextDay, true);
  assert.equal(byId.t18.isNextDay, false);
});

test("데이터 지문이 설정·메타데이터와 일치한다", () => {
  assert.equal(slotsDoc.configFingerprint, meta.configFingerprint);
  assert.equal(meta.location.latitude, config.location.latitude);
  assert.equal(meta.location.longitude, config.location.longitude);
  assert.equal(meta.eventDate, config.eventDate);
});

test("가시성 필터: 필수 별 모두 15° 이상이어야 표시·출제 후보 (5.4-5, 6)", () => {
  const min = config.visibility.quizMinAltitudeDeg;
  for (const slot of slotsDoc.slots) {
    const alt = new Map<string, number>(slot.stars.map((s: { id: string; altitudeDeg: number }) => [s.id, s.altitudeDeg]));
    for (const c of cons) {
      const lowest = Math.min(...c.requiredStarIds.map((id: string) => alt.get(id) ?? -99));
      const v = slot.constellationViews[c.id];
      const expected = lowest >= min ? "visible" : lowest > 0 ? "nearHorizon" : "belowHorizon";
      assert.equal(v.status, expected, `${slot.id} ${c.id}`);
      assert.equal(slot.visibleConstellationIds.includes(c.id), expected === "visible");
      assert.equal(slot.quizEligibleConstellationIds.includes(c.id), expected === "visible");
      assert.equal(slot.nearHorizonConstellationIds.includes(c.id), expected === "nearHorizon");
    }
    assert.ok(slot.visibleConstellationIds.length >= 6, `${slot.id}: 표시 후보 ${slot.visibleConstellationIds.length}개`);
  }
});

test("시간마다 별 위치와 가시 목록이 실제로 달라진다 (5.4)", () => {
  const [a, b] = slotsDoc.slots;
  const pa = new Map(a.stars.map((s: { id: string; azimuthDeg: number }) => [s.id, s.azimuthDeg]));
  let moved = 0;
  for (const s of b.stars) if (Math.abs((pa.get(s.id) as number) - s.azimuthDeg) > 5) moved++;
  assert.ok(moved > b.stars.length * 0.8);
  const lists = slotsDoc.slots.map((s: { visibleConstellationIds: string[] }) => s.visibleConstellationIds.join(","));
  assert.ok(new Set(lists).size >= 3, "시각별 가시 목록이 서로 다르다");
});

test("별 ID·연결선·필수 별·앵커·프레임이 서로 대응한다", () => {
  const ids = new Set<string>();
  for (const slot of slotsDoc.slots) for (const s of slot.stars) ids.add(s.id);
  for (const c of cons) {
    for (const id of c.starIds) assert.ok(ids.has(id), `${c.id}: ${id} 좌표 없음`);
    for (const id of c.requiredStarIds) assert.ok(c.starIds.includes(id), `${c.id}: 필수 별 ${id} 미포함`);
    for (const id of c.anchorStarIds) assert.ok(c.starIds.includes(id));
    for (const [a, b] of c.edges) assert.ok(c.starIds.includes(a) && c.starIds.includes(b), `${c.id}: 선 ${a}-${b}`);
    assert.ok(c.aliases.includes(c.shortAnswer) && c.aliases.includes(c.nameKo));
    assert.ok(c.description.length > 10 && c.findTip.length > 10);
    const fr = frames[c.id];
    assert.ok(fr, `${c.id} 프레임 없음`);
    for (const id of c.starIds) assert.ok(fr.stars[id], `${c.id}: 프레임에 ${id} 없음`);
  }
});

test("모양 오버레이 정합: 프레임 → 각 시각 상세 그림 닮음 변환 오차가 작다", () => {
  for (const slot of slotsDoc.slots) {
    const byId = new Map(slot.stars.map((s: { id: string }) => [s.id, s]));
    for (const c of cons) {
      if (slot.constellationViews[c.id].status === "belowHorizon") continue;
      const v = slot.constellationViews[c.id];
      const stars = c.starIds.map((id: string) => byId.get(id) as { id: string; altitudeDeg: number; azimuthDeg: number });
      const layout = layoutDetail(stars, v.centerAltitudeDeg, v.centerAzimuthDeg);
      const fr = frames[c.id];
      const pairs = c.starIds.map((id: string) => [{ x: fr.stars[id][0], y: fr.stars[id][1] }, layout.points[id]] as [{ x: number; y: number }, { x: number; y: number }]);
      const f = fitSimilarity(pairs);
      assert.ok(f.rmsError < 12, `${slot.id} ${c.id}: rms ${f.rmsError.toFixed(1)} (1000 단위)`);
      // 지평선 가까운 큰 별자리는 심사투영 왜곡으로 축척이 조금 달라진다(닮음 변환이 흡수)
      assert.ok(Math.hypot(f.a, f.b) > 0.65 && Math.hypot(f.a, f.b) < 1.5, `${slot.id} ${c.id}: 축척 ${Math.hypot(f.a, f.b).toFixed(2)}`);
    }
  }
});
