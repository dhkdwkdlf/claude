#!/usr/bin/env node
/**
 * 단일 파일 빌드(dist/standalone/*.html)를 file:// 로 열어 서버 없이 동작하는지 확인한다.
 *   node scripts/standalone-check.mjs
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { launchChromium } from "./lib/browser.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const browser = await launchChromium();
let failed = 0;
const check = (name, ok, detail = "") => {
  failed += ok ? 0 : 1;
  console.log(`${ok ? "통과" : "실패"} ${name}${detail ? " — " + detail : ""}`);
};

async function open(file) {
  const ctx = await browser.newContext({ viewport: { width: 600, height: 960 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  const requests = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("request", (r) => !r.url().startsWith("file:") && !r.url().startsWith("data:") && requests.push(r.url()));
  await page.goto(pathToFileURL(`${root}dist/standalone/${file}`).href, { waitUntil: "load" });
  await page.waitForTimeout(600);
  return { ctx, page, errors, requests };
}

// 앱 1
{
  const { ctx, page, errors, requests } = await open("별자리운세.html");
  const imgs = await page.$$eval(".card__art img", (els) => els.map((i) => i.complete && i.naturalWidth > 0));
  check("운세: 12개 카드 그림이 파일 안에서 로드됨", imgs.length === 12 && imgs.every(Boolean), `${imgs.filter(Boolean).length}/12`);
  const fonts = await page.evaluate(() => document.fonts.check('700 20px "Gowun Batang"') && document.fonts.check('400 18px "Noto Sans KR"'));
  check("운세: 번들 글꼴 사용", fonts);
  const b = await page.locator(".card.is-center").boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(450);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(900);
  const msg = await page.locator(".card.is-result .fortune__message").textContent().catch(() => "");
  check("운세: 두 번 터치로 운세 표시", (msg || "").length > 10);
  const stored = await page.evaluate(() => {
    try {
      return Object.keys(localStorage).some((k) => k.startsWith("booth-fortune:"));
    } catch {
      return false;
    }
  });
  check("운세: 덱 진행 저장(localStorage) 동작", stored, stored ? "" : "저장소 불가 환경이면 메모리 덱으로 동작");
  await page.goto(`${pathToFileURL(`${root}dist/standalone/별자리운세.html`).href}#operator`, { waitUntil: "load" });
  await page.waitForTimeout(800);
  const op = await page.locator(".operator__status").first().textContent();
  check("운세: 운영자 화면이 '단일 파일 실행' 상태를 표시", op.includes("단일 파일") && op.includes("완료"), op.slice(0, 60));
  check("운세: 외부 요청 없음", requests.length === 0, requests.slice(0, 3).join(", "));
  check("운세: 콘솔 오류 없음", errors.length === 0, errors.join(" | ").slice(0, 200));
  await ctx.close();
}
// 앱 2
{
  const { ctx, page, errors, requests } = await open("별자리여행.html");
  await page.click("#btn-explore");
  await page.waitForTimeout(400);
  await page.click('.slot[data-slot="t22"]');
  await page.waitForTimeout(400);
  const stars = await page.$$eval("#sky .skymap__stars circle", (els) => els.length);
  check("여행: 하늘 지도 별 표시", stars > 50, `${stars}개`);
  await page.click(".chips .chip:not(.is-near)");
  await page.waitForTimeout(500);
  const nm = await page.locator("#detail-name").textContent();
  await page.click("#btn-detail-quiz");
  await page.waitForTimeout(400);
  await page.fill("#answer", "틀린답");
  await page.click("#btn-submit");
  await page.waitForTimeout(300);
  await page.click("#btn-hint");
  await page.waitForTimeout(300);
  await page.fill("#answer", nm);
  await page.click("#btn-submit");
  await page.waitForTimeout(700);
  check("여행: 설명 → 퀴즈 → 힌트 → 정답 화면", await page.locator("#screen-success").isVisible(), nm);
  await page.click("#btn-home-success");
  await page.waitForTimeout(500);
  check("여행: 처음으로 복귀", await page.locator("#screen-home").isVisible());
  check("여행: 외부 요청 없음", requests.length === 0, requests.slice(0, 3).join(", "));
  check("여행: 콘솔 오류 없음", errors.length === 0, errors.join(" | ").slice(0, 200));
  await ctx.close();
}
await browser.close();
console.log(failed ? `실패 ${failed}건` : "단일 파일 검사 모두 통과");
process.exit(failed ? 1 : 0);
