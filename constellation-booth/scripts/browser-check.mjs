#!/usr/bin/env node
/**
 * 브라우저 자동 검수 (Playwright + Chromium). dist/ 빌드를 미리보기 서버로 띄워 두 앱의 핵심 흐름,
 * 세로 3규격 + 360×640 + 가로 모드 스크린샷, 오프라인 재실행, 50회 반복 누수, 외부 요청 여부를 확인한다.
 *   node scripts/browser-check.mjs            # 결과: docs/test-results.json, docs/screenshots/*.jpg
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { launchChromium } from "./lib/browser.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const PORT = 4199;
const ORIGIN = `http://localhost:${PORT}`;
const shotDir = `${root}docs/screenshots`;
mkdirSync(shotDir, { recursive: true });

const results = { startedAt: new Date().toISOString(), chromium: "", checks: [], screenshots: [], externalRequests: [], consoleErrors: [] };
const check = (id, name, pass, detail = "") => {
  results.checks.push({ id, name, pass, detail });
  console.log(`${pass ? "통과" : "실패"} ${id} ${name}${detail ? " — " + detail : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, [`${root}scripts/preview-server.mjs`, "--port", String(PORT)], { stdio: "ignore" });
await sleep(700);
const browser = await launchChromium();
results.chromium = browser.version();

const INIT_COUNTERS = `
  window.__counters = { listeners: 0, allAdds: 0, intervals: 0 };
  const persistent = (t) => t === window || t === document || (document.body && (t === document.body || t === document.documentElement));
  const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function(...a){ window.__counters.allAdds++; if (persistent(this)) window.__counters.listeners++; return add.apply(this,a); };
  EventTarget.prototype.removeEventListener = function(...a){ if (persistent(this)) window.__counters.listeners--; return rem.apply(this,a); };
  const si = window.setInterval, ci = window.clearInterval;
  window.setInterval = function(...a){ window.__counters.intervals++; return si.apply(this,a); };
  window.clearInterval = function(...a){ window.__counters.intervals--; return ci.apply(this,a); };
`;

async function newPage(ctx, app) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("request", (r) => {
    const u = r.url();
    if (!u.startsWith(ORIGIN) && !u.startsWith("data:") && !u.startsWith("blob:")) results.externalRequests.push({ app, url: u });
  });
  page.__errors = errors;
  return page;
}
async function shot(page, name) {
  const file = `${name}.jpg`;
  await page.screenshot({ path: `${shotDir}/${file}`, type: "jpeg", quality: 80 });
  results.screenshots.push(file);
}
const inside = (box, vw, vh) => !!box && box.x >= -1 && box.y >= -1 && box.x + box.width <= vw + 1 && box.y + box.height <= vh + 1;

/* ------------------------------------------------------------------ 앱 1 */
async function fortuneFlow(vw, vh, label) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await ctx.addInitScript(INIT_COUNTERS);
  const page = await newPage(ctx, "fortune");
  await page.goto(`${ORIGIN}/fortune/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await shot(page, `fortune-${label}-browse`);

  const centerBox = await page.locator(".card.is-center").boundingBox();
  const nameBox = await page.locator(".card.is-center .card__name").boundingBox();
  const rangeBox = await page.locator(".card.is-center .card__range").boundingBox();
  const hintBox = await page.locator("#hint").boundingBox();
  check(`C-01/${label}`, `세로 ${vw}×${vh}: 카드·이름·생일 구간·안내 문구가 잘리지 않음`, inside(centerBox, vw, vh) && inside(nameBox, vw, vh) && inside(rangeBox, vw, vh) && inside(hintBox, vw, vh), `card ${Math.round(centerBox.width)}×${Math.round(centerBox.height)}`);

  const tapCenter = async () => {
    const b = await page.locator(".card.is-center").boundingBox();
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  };
  const drag = async (dx, steps = 6) => {
    const b = await page.locator("#stage").boundingBox();
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    await page.dispatchEvent("#stage", "pointerdown", { pointerId: 1, clientX: x, clientY: y, pointerType: "touch", isPrimary: true, button: 0 });
    for (let i = 1; i <= steps; i++) await page.dispatchEvent("#stage", "pointermove", { pointerId: 1, clientX: x + (dx * i) / steps, clientY: y, pointerType: "touch", isPrimary: true });
    await page.dispatchEvent("#stage", "pointerup", { pointerId: 1, clientX: x + dx, clientY: y, pointerType: "touch", isPrimary: true });
  };
  const centerId = () => page.locator(".card.is-center").getAttribute("data-id");

  if (label === "600x960") {
    // F-03/F-04: 12장 양방향 순환
    const seen = [];
    for (let i = 0; i < 12; i++) {
      seen.push(await centerId());
      await drag(-160);
      await page.waitForTimeout(450);
    }
    const wrapped = await centerId();
    check("F-03", "12장 모두 순서대로 등장하고 12번째 → 1번째로 이어짐", new Set(seen).size === 12 && wrapped === seen[0], seen.join(","));
    for (let i = 0; i < 12; i++) {
      await drag(160);
      await page.waitForTimeout(450);
    }
    check("F-04", "반대 방향 12회 이동 후 처음 카드로 복귀", (await centerId()) === seen[0]);

    // F-06: 모든 카드 이미지·텍스트
    const imgs = await page.$$eval(".card__art img", (els) => els.map((i) => ({ ok: i.complete && i.naturalWidth > 0, src: i.getAttribute("src") })));
    const texts = await page.$$eval(".card", (els) => els.map((c) => ({ name: c.querySelector(".card__name")?.textContent?.trim(), range: c.querySelector(".card__range")?.textContent?.trim() })));
    check("F-06", "12개 카드 이미지 로드·이름·생일 구간 텍스트 존재", imgs.length === 12 && imgs.every((i) => i.ok) && texts.every((t) => t.name && t.range), `${imgs.filter((i) => i.ok).length}/12 이미지`);

    // F-05: 정렬 후 glow (전이 500ms 가 끝난 뒤 측정)
    await page.waitForTimeout(900);
    const glow = await page.$eval(".card.is-center .card__glow", (el) => getComputedStyle(el).opacity);
    check("F-05", "정렬된 가운데 카드에 은은한 빛 효과", Number(glow) > 0.3, `opacity ${glow}`);

    // F-07/F-08: 두 번 터치
    await tapCenter();
    await page.waitForTimeout(500);
    const previewOnly = (await page.locator(".card.is-preview").count()) === 1 && (await page.locator(".card.is-result").count()) === 0;
    const descVisible = await page.$eval(".card.is-center .card__desc", (el) => Number(getComputedStyle(el).opacity) > 0.9 && el.textContent.includes("한 번 더 누르면"));
    await shot(page, "fortune-600x960-preview");
    check("F-07", "첫 탭: 확대 + 설명 + '한 번 더' 안내, 운세는 열리지 않음", previewOnly && descVisible);
    await tapCenter();
    await page.waitForTimeout(900);
    const resultOpen = (await page.locator(".card.is-result").count()) === 1;
    const msg = await page.locator(".card.is-result .fortune__message").textContent();
    await shot(page, "fortune-600x960-result");
    check("F-08", "두 번째 탭: 뒤집혀 뒷면 운세 표시", resultOpen && msg.length > 10, msg.slice(0, 30));
    const titleOk = await page.$eval(".card.is-result .fortune__title", (el) => el.textContent.includes("11월 4일"));
    const noteOk = await page.$eval(".card.is-result .fortune__note", (el) => el.textContent.includes("재미로"));
    check("F-10", "결과 표제가 11월 4일 고정", titleOk);
    check("F-09b", "'재미로 만나는 별자리 이야기예요.' 안내", noteOk);

    // F-11: 3분 대기 (가상 시계)
    await page.clock.install();
    await page.clock.runFor(180_000);
    const stillOpen = (await page.locator(".card.is-result").count()) === 1 && (await page.locator(".card.is-result .fortune__message").textContent()) === msg;
    check("F-11", "결과 3분 유지 — 자동 닫기·재추첨 없음", stillOpen);

    // F-12: 결과에서 좌 슬라이드 → 복귀, 같은 제스처로 새 결과 열리지 않음
    await page.clock.runFor(10);
    await drag(-120);
    await page.clock.runFor(1200);
    await page.waitForTimeout(100);
    const backToBrowse = (await page.locator(".card.is-result").count()) === 0 && (await page.locator(".card.is-preview").count()) === 0;
    const sameCenter = (await centerId()) === seen[0];
    check("F-12", "결과에서 슬라이드 → 앞면 BROWSE 복귀, 방금 카드 중앙 유지", backToBrowse && sameCenter);

    // 우 슬라이드 복귀도 확인
    await tapCenter();
    await page.clock.runFor(500);
    await tapCenter();
    await page.clock.runFor(900);
    await drag(140);
    await page.clock.runFor(1200);
    check("F-12b", "결과에서 오른쪽 슬라이드도 복귀", (await page.locator(".card.is-result").count()) === 0);

    // 빠른 다중 탭으로 단계 건너뛰기 방지
    const b = await page.locator(".card.is-center").boundingBox();
    for (let i = 0; i < 4; i++) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await page.clock.runFor(100);
    const skipped = (await page.locator(".card.is-result").count()) === 1 || (await page.locator(".card.is-flipping").count()) === 1;
    check("F-07b", "빠른 연속 탭(4회)으로 운세까지 건너뛰지 않음", !skipped);
    await page.clock.runFor(800);
    await drag(-120); // 미리보기에서 드래그 → 탐색 복귀
    await page.clock.runFor(1200);
    check("F-07c", "드래그 직후 운세가 우연히 열리지 않음", (await page.locator(".card.is-result").count()) === 0);

    // F-09: 같은 별자리 12회 중복 없음, 13회째 직전과 다름
    const id = await centerId();
    const drawn = [];
    for (let i = 0; i < 13; i++) {
      await tapCenter();
      await page.clock.runFor(500);
      await tapCenter();
      await page.clock.runFor(900);
      drawn.push(await page.locator(".card.is-result .fortune__message").textContent());
      await page.locator("#return-btn").click();
      await page.clock.runFor(1200);
    }
    const first12 = drawn.slice(0, 12);
    check("F-09", `같은 별자리(${id}) 12회 완전 중복 없음, 13회째 ≠ 12회째`, new Set(first12).size === 12 && drawn[12] !== drawn[11]);

    // 기기 날짜가 달라도 행사일 유지
    await page.clock.setSystemTime(new Date("2027-03-15T10:00:00+09:00"));
    await page.reload({ waitUntil: "networkidle" });
    const dateLabel = await page.locator("#event-date").textContent();
    check("F-10b", "기기 날짜를 바꿔도 화면 행사일 2026. 11. 4.", dateLabel.includes("2026. 11. 4."));

    // 50회 반복 누수 관찰
    const snap = async () => page.evaluate(() => ({ ...window.__counters, nodes: document.querySelectorAll("*").length }));
    const loop = async (n) => {
      for (let i = 0; i < n; i++) {
        await tapCenter();
        await page.waitForTimeout(320);
        await tapCenter();
        await page.waitForTimeout(700);
        await page.locator("#return-btn").click();
        await page.waitForTimeout(750);
        await drag(-160);
        await page.waitForTimeout(450);
      }
    };
    await loop(5);
    const a = await snap();
    await loop(45);
    const b2 = await snap();
    check("F-01/누수", "50회 연속 체험 후 window/document 리스너·타이머·DOM 누적 없음", b2.listeners - a.listeners <= 2 && b2.intervals === a.intervals && b2.nodes === a.nodes, `persistent listeners ${a.listeners}→${b2.listeners}, intervals ${a.intervals}→${b2.intervals}, nodes ${a.nodes}→${b2.nodes}, addEventListener 누계 ${a.allAdds}→${b2.allAdds}`);

    // 캐시된 재실행 → 첫 조작 가능 화면
    const times = [];
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      await page.reload({ waitUntil: "commit" });
      await page.locator(".card.is-center").waitFor();
      times.push(Date.now() - t0);
    }
    const nav = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0];
      if (!n) return { note: "navigation timing 없음(가상 시계)" };
      return { domInteractive: Math.round(n.domInteractive), loadEventEnd: Math.round(n.loadEventEnd), transfer: Math.round(n.transferSize) };
    });
    check("F-01/시간", `캐시 재실행 → 첫 조작 가능까지 ${Math.max(...times)} ms 이하 (5회: ${times.join(", ")})`, Math.max(...times) < 2000, JSON.stringify(nav));
  }
  check(`콘솔/fortune/${label}`, "콘솔 오류 없음", page.__errors.length === 0, page.__errors.join(" | ").slice(0, 200));
  await ctx.close();
}

/* ------------------------------------------------------------------ 앱 2 */
async function skyFlow(vw, vh, label) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await ctx.addInitScript(INIT_COUNTERS);
  const page = await newPage(ctx, "sky");
  await page.goto(`${ORIGIN}/sky/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await shot(page, `sky-${label}-home`);
  const exploreBtn = await page.locator("#btn-explore").boundingBox();
  check(`C-01/sky/${label}/home`, `세로 ${vw}×${vh}: 홈 큰 버튼이 잘리지 않음`, inside(exploreBtn, vw, vh) && exploreBtn.height >= 56);
  await page.click("#btn-explore");
  await page.waitForTimeout(500);
  await shot(page, `sky-${label}-explore`);
  const quizBtn = await page.locator("#btn-quiz-explore").boundingBox();
  const slotBtn = await page.locator('.slot[data-slot="t00"]').boundingBox();
  check(`C-01/sky/${label}/explore`, "탐색 화면: 시간 버튼·퀴즈 버튼이 잘리지 않음", inside(quizBtn, vw, vh) && inside(slotBtn, vw, vh));
  await page.click(".chips .chip:not(.is-near)");
  await page.waitForTimeout(700);
  await shot(page, `sky-${label}-detail`);
  await page.click("#btn-detail-quiz");
  await page.waitForTimeout(600);
  await shot(page, `sky-${label}-quiz`);
  const input = await page.locator("#answer").boundingBox();
  const submit = await page.locator("#btn-submit").boundingBox();
  check(`C-01/sky/${label}/quiz`, "퀴즈 입력창·정답 확인 버튼이 잘리지 않음", inside(input, vw, vh) && inside(submit, vw, vh) && submit.height >= 48);

  if (label === "600x960") {
    await page.click("#btn-home-quiz");
    await page.waitForTimeout(500);
    // S-01: 시간별 변화
    await page.click("#btn-explore");
    await page.waitForTimeout(500);
    const lists = {};
    const stars = {};
    for (const s of ["t18", "t20", "t22", "t00"]) {
      await page.click(`.slot[data-slot="${s}"]`);
      await page.waitForTimeout(500);
      lists[s] = await page.$$eval(".chips .chip:not(.is-near)", (els) => els.map((e) => e.textContent.trim()));
      stars[s] = await page.$$eval("#sky .skymap__stars circle", (els) => els.slice(0, 5).map((c) => `${Math.round(c.getAttribute("cx"))},${Math.round(c.getAttribute("cy"))}`).join(";"));
    }
    const note00 = await page.locator("#slot-note").textContent();
    check("S-01", "시간 4개를 바꾸면 가시 별자리 목록과 별 좌표가 바뀌고 '다음 날 0시' 안내", new Set(Object.values(lists).map((l) => l.join())).size >= 3 && new Set(Object.values(stars)).size === 4 && note00.includes("다음 날"), JSON.stringify(Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, v.length]))));
    const metaText = await page.locator("#explore-meta").textContent();
    check("S-01b", "화면에 '봉화 기준 · 한국 시간' 표시", metaText.includes("봉화 기준") && metaText.includes("한국 시간"), metaText);
    const noMismatch = await page.locator("#notice-bar").isHidden();
    check("S-01c", "설정-데이터 불일치 경고 없음(일치)", noMismatch);

    // S-02: 여러 별자리 연속 확인, HOME 강제 이동 없음
    await page.click('.slot[data-slot="t20"]');
    await page.waitForTimeout(400);
    const chips = page.locator(".chips .chip:not(.is-near)");
    const names = [];
    for (let i = 0; i < 3; i++) {
      await chips.nth(i).click();
      await page.waitForTimeout(500);
      names.push(await page.locator("#detail-name").textContent());
      await page.click("#btn-detail-close");
      await page.waitForTimeout(300);
    }
    const stillExplore = await page.locator("#screen-explore").isVisible();
    check("S-02", "별자리 3개를 연속으로 확인해도 탐색 화면 유지", stillExplore && new Set(names).size === 3, names.join(","));
    // 레이어 토글
    await chips.nth(0).click();
    await page.waitForTimeout(400);
    const layersOn = await page.$eval("#detail-svg", (s) => s.classList.contains("show-lines") && s.classList.contains("show-shape") && s.classList.contains("show-labels"));
    await page.click('#layer-toggles [data-layer="shape"]');
    const shapeOff = await page.$eval("#detail-svg", (s) => !s.classList.contains("show-shape"));
    await page.click('#layer-toggles [data-layer="shape"]');
    check("S-02b", "학습 화면: 별·선·모양·이름 레이어 표시 및 토글", layersOn && shapeOff);
    const where = await page.locator("#detail-where").textContent();
    check("S-01d", "설명에 해당 시간의 방향·높이 표기", /쪽|머리 위/.test(where) && where.includes("고도"), where);
    await page.click("#btn-detail-close");

    // S-03: 학습한 후보만 출제 (10회)
    const learnedSet = new Set(names.map((n) => n));
    let allFromLearned = true;
    let askedNames = new Set();
    for (let i = 0; i < 10; i++) {
      await page.click("#btn-quiz-explore");
      await page.waitForTimeout(400);
      // 정답 화면을 통해 출제 별자리 확인: 모든 후보 이름을 차례로 입력
      let found = null;
      for (const n of names) {
        await page.fill("#answer", n.replace(/자리$/, ""));
        await page.click("#btn-submit");
        await page.waitForTimeout(450);
        if (await page.locator("#screen-success").isVisible()) {
          found = n;
          break;
        }
      }
      if (!found || !learnedSet.has(found)) allFromLearned = false;
      askedNames.add(found);
      // 다시 탐색으로 (처음으로 → 학습 복원 필요하므로 같은 3개를 다시 학습)
      await page.click("#btn-home-success");
      await page.waitForTimeout(600);
      await page.click("#btn-explore");
      await page.waitForTimeout(500);
      for (let k = 0; k < 3; k++) {
        await chips.nth(k).click();
        await page.waitForTimeout(250);
        await page.click("#btn-detail-close");
        await page.waitForTimeout(120);
      }
    }
    check("S-03", "10회 출제 모두 학습한 별자리에서만 선택됨", allFromLearned, [...askedNames].join(","));

    // 퀴즈 상세: 처음 화면은 별만
    await page.click("#btn-quiz-explore");
    await page.waitForTimeout(400);
    const starsOnly = await page.$eval("#quiz-svg", (s) => !s.classList.contains("show-lines") && !s.classList.contains("show-shape") && !s.classList.contains("show-labels"));
    const hintHidden = await page.locator("#btn-hint").isHidden();
    const labelsHidden = await page.$eval("#quiz-svg .detail__labels", (g) => getComputedStyle(g).opacity === "0");
    check("S-06", "최초 문제: 반짝이는 별만, 선·모양·이름 없음, 힌트 버튼 숨김", starsOnly && hintHidden && labelsHidden);

    // 빈 입력은 오답 아님
    await page.fill("#answer", "   ");
    await page.click("#btn-submit");
    await page.waitForTimeout(200);
    check("S-05a", "빈 입력 제출은 유효 오답이 아니라 힌트가 나오지 않음", await page.locator("#btn-hint").isHidden());
    // IME 조합 중 Enter 무시
    await page.fill("#answer", "ㅍ");
    await page.dispatchEvent("#answer", "compositionstart");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    const noWrongDuringIme = await page.locator("#btn-hint").isHidden();
    await page.dispatchEvent("#answer", "compositionend");
    check("S-04b", "한글 조합(compositionstart) 중 Enter 는 오답 판정하지 않음", noWrongDuringIme);
    // 유효 오답 → 힌트 등장
    await page.fill("#answer", "엉뚱한답");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    const hintShown = await page.locator("#btn-hint").isVisible();
    const kept = (await page.inputValue("#answer")) === "엉뚱한답";
    const fb = await page.locator("#quiz-feedback").textContent();
    const stillStarsOnly = await page.$eval("#quiz-svg", (s) => !s.classList.contains("show-lines"));
    check("S-05", "유효 오답 → 안내 문구 + 힌트 버튼 등장, 입력값 유지, 선은 자동 표시되지 않음", hintShown && kept && fb.includes("힌트") && stillStarsOnly, fb);
    await page.click("#btn-hint");
    await page.waitForTimeout(700);
    const l1 = await page.$eval("#quiz-svg", (s) => s.classList.contains("show-lines") && !s.classList.contains("show-shape"));
    await shot(page, "sky-600x960-hint1");
    await page.click("#btn-hint");
    await page.waitForTimeout(700);
    const l2 = await page.$eval("#quiz-svg", (s) => s.classList.contains("show-lines") && s.classList.contains("show-shape") && !s.classList.contains("show-labels"));
    const disabled = await page.locator("#btn-hint").isDisabled();
    await shot(page, "sky-600x960-hint2");
    await page.fill("#answer", "또틀림");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    const stayL2 = await page.$eval("#quiz-svg", (s) => s.classList.contains("show-shape"));
    check("S-07", "힌트 1회=선 잇기, 2회=모양 씌우기(이름 없음), 3회 없음, 이후 오답에도 단계 유지", l1 && l2 && disabled && stayL2);
    // 부분 문자열·다른 이름 실패, 짧은 이름·전체 이름 통과
    let answer = null;
    for (const n of names) {
      await page.fill("#answer", n.slice(0, 1));
      await page.click("#btn-submit");
      await page.waitForTimeout(100);
    }
    const partialFailed = await page.locator("#screen-quiz").isVisible();
    for (const n of names) {
      await page.fill("#answer", ` ${n} `);
      await page.click("#btn-submit");
      await page.waitForTimeout(450);
      if (await page.locator("#screen-success").isVisible()) {
        answer = n;
        break;
      }
    }
    check("S-04", "부분 문자열은 실패, 공백 포함 전체 이름은 정답", partialFailed && !!answer, answer);
    await page.waitForTimeout(900);
    await shot(page, "sky-600x960-success");
    const successName = await page.locator("#success-name").textContent();
    const successLayers = await page.$eval("#success-svg", (s) => s.classList.contains("show-lines") && s.classList.contains("show-shape") && s.classList.contains("show-labels"));
    const inputGone = await page.locator("#answer").isHidden();
    check("S-08", "정답: 이름 + 별·선·모양 다시 표시, 입력창 닫힘", successName === answer && successLayers && inputGone);
    const homeBtn = await page.locator("#btn-home-success").boundingBox();
    const rightAligned = homeBtn.x + homeBtn.width > vw * 0.9;
    check("S-09", "오른쪽 하단 큰 '처음으로 돌아가기' (높이 ≥64px, 너비 40~55%)", inside(homeBtn, vw, vh) && homeBtn.height >= 64 && homeBtn.width >= vw * 0.4 && homeBtn.width <= vw * 0.56 && rightAligned && homeBtn.y > vh * 0.75, `${Math.round(homeBtn.width)}×${Math.round(homeBtn.height)} @ ${Math.round(homeBtn.x)},${Math.round(homeBtn.y)}`);
    // 3분 유지
    await page.clock.install();
    await page.clock.runFor(180_000);
    check("S-08b", "정답 화면 3분 유지(자동 닫기·다음 문제 없음)", await page.locator("#screen-success").isVisible());
    await page.click("#btn-home-success");
    await page.clock.runFor(600);
    await page.waitForTimeout(100);
    const home = await page.locator("#screen-home").isVisible();
    await page.click("#btn-quiz-home");
    await page.clock.runFor(500);
    const needLearning = (await page.locator("#screen-explore").isVisible()) && (await page.locator("#explore-quiz-hint").textContent()).includes("먼저");
    const noLearned = (await page.locator(".chips .chip.is-learned").count()) === 0;
    const quizDisabled = await page.locator("#btn-quiz-explore").isDisabled();
    check("S-10", "복귀 후 HOME, 학습 목록·문제·힌트 초기화, 퀴즈는 학습으로 연결", home && needLearning && noLearned && quizDisabled);
    await page.clock.runFor(10);
    const inputEmpty = (await page.inputValue("#answer")) === "";
    check("S-10b", "이전 참가자의 답안이 입력창에 남지 않음", inputEmpty);

    // 50회 반복
    const snap = async () => page.evaluate(() => ({ ...window.__counters, nodes: document.querySelectorAll("*").length }));
    const loop = async (n) => {
      for (let i = 0; i < n; i++) {
        await page.locator(".chips .chip:not(.is-near)").first().click();
        await page.waitForTimeout(120);
        const nm = await page.locator("#detail-name").textContent();
        await page.click("#btn-detail-quiz");
        await page.waitForTimeout(120);
        await page.fill("#answer", nm);
        await page.click("#btn-submit");
        await page.waitForTimeout(450);
        await page.click("#btn-home-success");
        await page.waitForTimeout(350);
        await page.click("#btn-explore");
        await page.waitForTimeout(350);
      }
    };
    await page.clock.runFor(100);
    await loop(5);
    const a = await snap();
    await loop(45);
    const b2 = await snap();
    check("F-01/sky/누수", "50회 연속 체험 후 window/document 리스너·타이머·DOM 누적 없음", b2.listeners - a.listeners <= 2 && b2.intervals === a.intervals && Math.abs(b2.nodes - a.nodes) <= 2, `persistent listeners ${a.listeners}→${b2.listeners}, intervals ${a.intervals}→${b2.intervals}, nodes ${a.nodes}→${b2.nodes}, 노드별 addEventListener 누계 ${a.allAdds}→${b2.allAdds} (다시 그린 노드와 함께 해제됨)`);
    const times = [];
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      await page.reload({ waitUntil: "commit" });
      await page.locator("#btn-explore").waitFor();
      times.push(Date.now() - t0);
    }
    check("F-01/sky/시간", `캐시 재실행 → 첫 조작 가능까지 ${Math.max(...times)} ms 이하 (5회: ${times.join(", ")})`, Math.max(...times) < 2000);
  }
  check(`콘솔/sky/${label}`, "콘솔 오류 없음", page.__errors.length === 0, page.__errors.join(" | ").slice(0, 200));
  await ctx.close();
}

/* ------------------------------------------------------------------ 오프라인 */
async function offlineFlow() {
  const ctx = await browser.newContext({ viewport: { width: 600, height: 960 }, hasTouch: true, isMobile: true });
  const page = await newPage(ctx, "offline");
  const waitReady = async (base) => {
    await page.goto(`${ORIGIN}${base}`, { waitUntil: "networkidle" });
    for (let i = 0; i < 40; i++) {
      const st = await page.evaluate(async (b) => {
        const reg = await navigator.serviceWorker.getRegistration(b);
        if (!reg?.active) return { ready: false };
        const m = await (await fetch(`${b}precache-manifest.json`, { cache: "no-store" })).json();
        const cache = await caches.open(m.cacheName);
        const keys = await cache.keys();
        return { ready: keys.length >= m.files.length, cached: keys.length, total: m.files.length + 1, cacheName: m.cacheName };
      }, base);
      if (st.ready) return st;
      await sleep(250);
    }
    return { ready: false };
  };
  const f = await waitReady("/fortune/");
  const s = await waitReady("/sky/");
  check("F-02/설치", "두 앱 서비스 워커 설치 및 전체 자산 사전 캐시 완료", f.ready && s.ready, `fortune ${f.cached}/${f.total}, sky ${s.cached}/${s.total}`);
  const separate = f.cacheName && s.cacheName && f.cacheName.startsWith("fortune-") && s.cacheName.startsWith("sky-");
  check("F-02/분리", "캐시 이름이 앱 ID + 버전으로 분리됨", separate, `${f.cacheName} / ${s.cacheName}`);

  await ctx.setOffline(true);
  // 미방문 화면 포함 전체 체험 (sky 는 퀴즈·정답 화면을 아직 열지 않은 상태)
  await page.goto(`${ORIGIN}/sky/`, { waitUntil: "load" });
  await page.waitForTimeout(400);
  await page.click("#btn-explore");
  await page.waitForTimeout(300);
  await page.click(".chips .chip:not(.is-near)");
  await page.waitForTimeout(300);
  const nm = await page.locator("#detail-name").textContent();
  await page.click("#btn-detail-quiz");
  await page.fill("#answer", nm);
  await page.click("#btn-submit");
  await page.waitForTimeout(400);
  const skyOffline = await page.locator("#screen-success").isVisible();
  const fontsOk = await page.evaluate(() => document.fonts.check('700 20px "Noto Sans KR"') && document.fonts.check('700 20px "Gowun Batang"'));
  check("F-02/sky", "오프라인에서 앱 2 재실행 + 미방문 화면(퀴즈·정답) 포함 전체 체험", skyOffline, `fonts ${fontsOk}`);
  await page.goto(`${ORIGIN}/fortune/`, { waitUntil: "load" });
  await page.waitForTimeout(400);
  const imgs = await page.$$eval(".card__art img", (els) => els.every((i) => i.complete && i.naturalWidth > 0));
  const b = await page.locator(".card.is-center").boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(400);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(900);
  const fortuneOffline = (await page.locator(".card.is-result").count()) === 1;
  check("F-02/fortune", "오프라인에서 앱 1 재실행 + 12개 이미지 + 운세 열기", imgs && fortuneOffline);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(300);
  check("F-02/새로고침", "오프라인 새로고침 후에도 동작", (await page.locator(".card.is-center").count()) === 1);
  // 앱 1 캐시 삭제가 앱 2를 깨뜨리지 않음
  await page.evaluate(async () => {
    for (const n of await caches.keys()) if (n.startsWith("fortune-")) await caches.delete(n);
  });
  await page.goto(`${ORIGIN}/sky/`, { waitUntil: "load" });
  await page.waitForTimeout(300);
  check("F-02/독립", "앱 1 캐시를 지워도 앱 2는 오프라인 실행", await page.locator("#btn-explore").isVisible());
  await ctx.setOffline(false);
  check("콘솔/offline", "오프라인 검사 중 콘솔 오류 없음(캐시 삭제 후 앱 1 미접속)", page.__errors.length === 0, page.__errors.join(" | ").slice(0, 200));
  await ctx.close();
}

/* ------------------------------------------------------------------ 실행 */
try {
  for (const [w, h, label] of [
    [600, 960, "600x960"],
    [768, 1024, "768x1024"],
    [800, 1280, "800x1280"],
    [360, 640, "360x640"],
    [1024, 700, "landscape"],
  ]) {
    await fortuneFlow(w, h, label);
    await skyFlow(w, h, label);
  }
  await offlineFlow();
  check("F-02/외부요청", "행사 중 외부 네트워크 요청 없음 (CDN·폰트·API)", results.externalRequests.length === 0, results.externalRequests.map((r) => r.url).slice(0, 5).join(", "));
} catch (err) {
  check("실행", "검수 스크립트가 끝까지 실행됨", false, String(err).slice(0, 300));
  console.error(err);
} finally {
  await browser.close();
  server.kill();
}
results.finishedAt = new Date().toISOString();
results.summary = { total: results.checks.length, pass: results.checks.filter((c) => c.pass).length, fail: results.checks.filter((c) => !c.pass).length };
writeFileSync(`${root}docs/test-results.json`, JSON.stringify(results, null, 1));
console.log(`\n합계 ${results.summary.total}건, 통과 ${results.summary.pass}건, 실패 ${results.summary.fail}건 → docs/test-results.json`);
process.exit(results.summary.fail ? 1 : 0);
