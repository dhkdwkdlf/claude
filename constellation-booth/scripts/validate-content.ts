#!/usr/bin/env node
/**
 * 콘텐츠·스키마 검사. 알 수 없는 ID, 누락 이미지, 무효 좌표, 출제 후보의 설명 누락, 운세 수·중복·금지 표현을 검출한다.
 *   node scripts/validate-content.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p: string) => JSON.parse(readFileSync(`${root}${p}`, "utf8"));

const problems: string[] = [];
const warn = (m: string) => problems.push(m);

const config = read("data/event-config.json");
const zodiac = read("data/zodiac.json").cards as Array<Record<string, unknown>>;
const fortunesDoc = read("data/fortunes.json");
const fortunes = fortunesDoc.fortunes as Array<{ id: string; zodiacId: string; message: string; smallAction: string }>;
const cons = read("data/constellations.json").constellations as Array<Record<string, unknown>>;
const slots = read("data/sky-slots.json").slots as Array<Record<string, unknown>>;
const frames = read("data/constellation-frames.json").frames as Record<string, { stars: Record<string, [number, number]> }>;
const meta = read("data/sky-data-metadata.json");

/* 앱 1 */
if (zodiac.length !== 12) warn(`12별자리가 아님: ${zodiac.length}`);
const zIds = new Set<string>();
for (const z of zodiac) {
  const id = String(z.id);
  if (zIds.has(id)) warn(`중복 별자리 ID ${id}`);
  zIds.add(id);
  for (const k of ["nameKo", "birthRangeLabel", "illustrationAsset", "shortDescription"]) if (!z[k]) warn(`${id}: ${k} 누락`);
  const asset = `${root}apps/fortune/public/${z.illustrationAsset}`;
  if (!existsSync(asset)) warn(`${id}: 이미지 없음 ${z.illustrationAsset}`);
  const [sm, sd] = z.startMonthDay as [number, number];
  const [em, ed] = z.endMonthDay as [number, number];
  if (!(sm >= 1 && sm <= 12 && sd >= 1 && sd <= 31 && em >= 1 && em <= 12 && ed >= 1 && ed <= 31)) warn(`${id}: 생일 구간 값 오류`);
}
// 생일 구간이 1년을 빈틈없이 덮는지 (연도 넘김 포함)
const dayOfYear = (m: number, d: number) => [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][m - 1] + d;
const covered = new Array(366).fill(0);
for (const z of zodiac) {
  const [sm, sd] = z.startMonthDay as [number, number];
  const [em, ed] = z.endMonthDay as [number, number];
  let s = dayOfYear(sm, sd);
  const e = dayOfYear(em, ed);
  if (s <= e) for (let i = s; i <= e; i++) covered[i]++;
  else {
    for (let i = s; i <= 365; i++) covered[i]++;
    for (let i = 1; i <= e; i++) covered[i]++;
  }
}
for (let i = 1; i <= 365; i++) if (covered[i] !== 1) warn(`생일 구간 겹침/빈틈: 연중 ${i}일째 (${covered[i]}회)`);

const perZodiac = new Map<string, number>();
const seenMsg = new Set<string>();
const seenId = new Set<string>();
const banned = [/불운/, /사고/, /질병/, /병원/, /아프/, /죽/, /못생/, /뚱뚱/, /이별/, /헤어지/, /돈/, /복권/, /도박/, /주식/, /투자/, /여자(는|라서)/, /남자(는|라서)/, /무서/, /죄책/, /벌을/, /실패할/, /반드시 성공/, /틀림없이/];
for (const f of fortunes) {
  if (seenId.has(f.id)) warn(`운세 ID 중복 ${f.id}`);
  seenId.add(f.id);
  if (!zIds.has(f.zodiacId)) warn(`${f.id}: 알 수 없는 별자리 ${f.zodiacId}`);
  perZodiac.set(f.zodiacId, (perZodiac.get(f.zodiacId) ?? 0) + 1);
  const key = f.message.replace(/\s/g, "");
  if (seenMsg.has(key)) warn(`${f.id}: 완전히 같은 문안 반복`);
  seenMsg.add(key);
  if (f.message.length < 15 || f.smallAction.length < 8) warn(`${f.id}: 문안이 너무 짧음`);
  if (/TODO|자리표시|placeholder|lorem/i.test(f.message + f.smallAction)) warn(`${f.id}: 자리표시자`);
  for (const re of banned) if (re.test(f.message + " " + f.smallAction)) warn(`${f.id}: 검토 필요 표현 ${re}`);
}
for (const id of zIds) if ((perZodiac.get(id) ?? 0) < 12) warn(`${id}: 운세 ${perZodiac.get(id) ?? 0}개 (<12)`);
if (fortunes.length < 144) warn(`운세 총 ${fortunes.length}개 (<144)`);
if (fortunesDoc.eventDate !== config.eventDate) warn("운세 행사일 불일치");

/* 앱 2 */
const starIds = new Set<string>();
for (const slot of slots) {
  for (const s of slot.stars as Array<{ id: string; altitudeDeg: number; azimuthDeg: number; magnitude: number }>) {
    starIds.add(s.id);
    if (!(s.altitudeDeg >= -90 && s.altitudeDeg <= 90) || !(s.azimuthDeg >= 0 && s.azimuthDeg < 360) || !Number.isFinite(s.magnitude)) warn(`${slot.id} ${s.id}: 무효 좌표`);
  }
}
const cIds = new Set<string>();
for (const c of cons) {
  const id = String(c.id);
  if (cIds.has(id)) warn(`중복 별자리 ID ${id}`);
  cIds.add(id);
  for (const k of ["nameKo", "shortAnswer", "description", "findTip", "seasonLabel", "shapeAsset"]) if (!c[k]) warn(`${id}: ${k} 누락`);
  for (const sid of c.starIds as string[]) if (!starIds.has(sid)) warn(`${id}: 좌표 없는 별 ${sid}`);
  for (const sid of c.requiredStarIds as string[]) if (!(c.starIds as string[]).includes(sid)) warn(`${id}: 필수 별 ${sid} 미포함`);
  for (const [a, b] of c.edges as [string, string][]) if (!(c.starIds as string[]).includes(a) || !(c.starIds as string[]).includes(b)) warn(`${id}: 선 ${a}-${b}`);
  if (!frames[id]) warn(`${id}: 프레임 없음`);
  else for (const sid of c.starIds as string[]) if (!frames[id].stars[sid]) warn(`${id}: 프레임 좌표 없음 ${sid}`);
  const shapes = readFileSync(`${root}apps/sky/src/shapes.ts`, "utf8");
  if (!shapes.includes(`${c.shapeAsset}: {`)) warn(`${id}: 모양 에셋 ${c.shapeAsset} 없음`);
}
for (const slot of slots) {
  for (const id of slot.quizEligibleConstellationIds as string[]) if (!cIds.has(id)) warn(`${slot.id}: 출제 후보 ${id} 설명 없음`);
  if ((slot.visibleConstellationIds as string[]).length < 6) warn(`${slot.id}: 표시 후보 6개 미만`);
}
if (meta.configFingerprint !== read("data/sky-slots.json").configFingerprint) warn("데이터 지문 불일치: 재생성 필요");
if (meta.location.latitude !== config.location.latitude || meta.location.longitude !== config.location.longitude) warn("관측 지점 불일치: 재생성 필요");

for (const p of ["apps/fortune/public/icons/icon-192.png", "apps/fortune/public/icons/icon-512.png", "apps/sky/public/icons/icon-192.png", "apps/sky/public/icons/icon-512.png"]) if (!existsSync(root + p)) warn(`아이콘 없음 ${p}`);
for (const p of ["NotoSansKR-Regular", "NotoSansKR-Bold", "GowunBatang-Regular", "GowunBatang-Bold"]) if (!existsSync(`${root}shared/fonts/${p}.subset.woff2`)) warn(`글꼴 없음 ${p}`);

if (problems.length) {
  console.error(`검사 실패 (${problems.length}건):`);
  for (const p of problems) console.error(" -", p);
  process.exit(1);
}
console.log(`검사 통과: 별자리 카드 ${zodiac.length}개, 운세 ${fortunes.length}개, 학습 별자리 ${cons.length}개, 시간 슬롯 ${slots.length}개, 별 ${starIds.size}개`);
