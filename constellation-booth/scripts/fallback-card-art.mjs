#!/usr/bin/env node
/**
 * 이미지 API 를 쓸 수 없을 때를 위한 수작업 SVG 선화 → PNG(1024×1536) 렌더.
 * 생성 그림과 같은 규칙(아이보리 선, 남색 배경, 라벤더 포인트, 금색 별)으로 그린다.
 *   node scripts/fallback-card-art.mjs <출력 폴더> [id,id,...]
 * 이후 scripts/optimize-card-art.py 로 WebP 변환한다.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { launchChromium } from "./lib/browser.mjs";

const out = process.argv[2];
const only = (process.argv[3] || "").split(",").filter(Boolean);
if (!out) {
  console.error("출력 폴더를 지정하세요.");
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const star = (x, y, r) => `<path fill="#F2D79B" d="M${x} ${y - r} L${x + r * 0.26} ${y - r * 0.26} L${x + r} ${y} L${x + r * 0.26} ${y + r * 0.26} L${x} ${y + r} L${x - r * 0.26} ${y + r * 0.26} L${x - r} ${y} L${x - r * 0.26} ${y - r * 0.26} Z"/>`;
const frame = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536" viewBox="0 0 1024 1536">
  <rect width="1024" height="1536" fill="#142543"/>
  <g fill="none" stroke="#F7FAFF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">${inner}</g>
</svg>`;

const ART = {
  capricorn: frame(`
    <!-- 바다 염소: 왼쪽을 보는 염소 머리·앞다리, 오른쪽 아래로 흐르는 물고기 꼬리 -->
    <g fill="#DCE8F8" stroke="none" opacity="0.9">
      <path d="M586 556 C612 500 650 470 690 476 C660 500 640 540 634 584 Z"/>
      <path d="M642 1140 C690 1150 740 1190 760 1240 C710 1215 660 1205 620 1215 Z"/>
    </g>
    <!-- 뿔 -->
    <path d="M520 540 C545 470 605 430 668 452 C625 470 594 516 582 566"/>
    <path d="M540 556 C560 510 600 480 640 478"/>
    <!-- 얼굴 -->
    <path d="M520 540 C470 560 432 600 402 660 C382 694 380 722 400 744 C428 764 470 754 492 730"/>
    <path d="M492 730 C484 768 490 800 500 824"/>
    <path d="M520 540 C560 540 590 560 604 600 C612 626 606 650 596 660"/>
    <circle cx="468" cy="642" r="8" fill="#F7FAFF" stroke="none"/>
    <path d="M430 700 C444 708 460 706 470 698"/>
    <!-- 목·등·배 -->
    <path d="M596 660 C660 704 700 780 702 860"/>
    <path d="M492 730 C520 800 556 862 604 900"/>
    <!-- 앞다리 -->
    <path d="M566 884 C544 940 536 1000 562 1050 L608 1058"/>
    <path d="M628 902 C614 960 622 1010 652 1050"/>
    <!-- 몸통 → 꼬리 -->
    <path d="M702 860 C724 960 704 1062 642 1140"/>
    <path d="M604 900 C644 960 664 1040 624 1120"/>
    <path d="M642 1140 C690 1150 740 1190 760 1240"/>
    <path d="M642 1140 C600 1180 582 1230 592 1282"/>
    <path d="M760 1240 C702 1232 644 1250 592 1282"/>
    <!-- 비늘 -->
    <path d="M664 980 C680 990 680 1010 664 1020 M680 1040 C696 1050 696 1070 680 1080 M650 1060 C666 1070 666 1090 650 1100"/>
    ${star(250, 520, 14)}${star(310, 430, 9)}${star(780, 420, 11)}${star(840, 520, 8)}${star(260, 1180, 10)}${star(860, 1130, 13)}${star(720, 1360, 8)}
  `),
  aquarius: frame(`
    <!-- 기울인 물병과 흘러내리는 물결 -->
    <g fill="#DCE8F8" stroke="none" opacity="0.9">
      <path d="M470 470 C520 450 580 460 620 500 C580 520 520 520 470 500 Z"/>
      <path d="M300 1080 C360 1060 420 1070 470 1100 C420 1120 360 1120 300 1100 Z"/>
    </g>
    <path d="M430 420 C400 380 420 330 470 320 C560 300 650 330 690 380 C720 420 700 470 650 480"/>
    <path d="M430 420 C430 520 440 620 480 700 C520 770 600 800 660 760 C700 730 720 670 690 600 C670 560 660 520 650 480"/>
    <path d="M470 320 C470 290 500 270 540 270 C600 270 640 300 650 330"/>
    <path d="M430 430 L390 410 C360 400 340 420 350 450"/>
    <path d="M480 700 C440 760 380 800 330 850 C290 890 270 940 300 980"/>
    <path d="M300 980 C340 1000 380 980 420 960 C470 940 520 960 560 990 C600 1020 650 1010 690 980"/>
    <path d="M330 1070 C370 1090 410 1070 450 1050 C500 1030 550 1050 590 1080 C630 1110 680 1100 720 1070"/>
    <path d="M360 1160 C400 1180 440 1160 480 1140 C530 1120 580 1140 620 1170 C660 1200 710 1190 750 1160"/>
    <path d="M500 740 C540 780 600 790 640 760"/>
    ${star(250, 380, 12)}${star(320, 300, 8)}${star(760, 300, 10)}${star(820, 400, 14)}${star(230, 1260, 9)}${star(800, 1280, 12)}${star(540, 1330, 8)}
  `),
  pisces: frame(`
    <!-- 끈으로 이어진 두 마리 물고기 -->
    <g fill="#DCE8F8" stroke="none" opacity="0.9">
      <path d="M560 520 C600 500 640 510 660 540 C620 560 580 560 560 540 Z"/>
      <path d="M460 1040 C420 1060 380 1050 360 1020 C400 1000 440 1000 460 1020 Z"/>
    </g>
    <!-- 위쪽 물고기 (오른쪽을 향함) -->
    <path d="M330 560 C380 460 480 410 600 430 C680 445 740 500 780 560 C740 620 680 670 600 680 C480 690 390 640 330 560 Z"/>
    <path d="M330 560 C290 520 250 500 220 510 C240 560 240 600 220 640 C260 640 300 610 330 560"/>
    <path d="M600 430 C610 390 640 370 680 380 C650 400 640 430 640 460"/>
    <path d="M620 680 C640 720 670 730 700 720"/>
    <circle cx="700" cy="540" r="9" fill="#F7FAFF"/>
    <path d="M460 500 C520 540 520 600 460 640"/>
    <!-- 아래쪽 물고기 (왼쪽을 향함) -->
    <path d="M690 1000 C640 900 540 850 420 870 C340 885 280 940 240 1000 C280 1060 340 1110 420 1120 C540 1130 630 1080 690 1000 Z"/>
    <path d="M690 1000 C730 960 770 940 800 950 C780 1000 780 1040 800 1080 C760 1080 720 1050 690 1000"/>
    <path d="M420 870 C410 830 380 810 340 820 C370 840 380 870 380 900"/>
    <path d="M400 1120 C380 1160 350 1170 320 1160"/>
    <circle cx="320" cy="980" r="9" fill="#F7FAFF"/>
    <path d="M560 940 C500 980 500 1040 560 1080"/>
    <!-- 끈 -->
    <path d="M780 560 C880 640 900 760 860 860 C830 930 760 960 690 1000" stroke-dasharray="2 18" stroke-width="6"/>
    ${star(220, 400, 12)}${star(300, 330, 8)}${star(820, 380, 10)}${star(870, 480, 8)}${star(200, 1200, 10)}${star(760, 1260, 13)}${star(560, 1340, 8)}
  `),
};

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1024, height: 1536 }, deviceScaleFactor: 1 });
for (const [id, svg] of Object.entries(ART)) {
  if (only.length && !only.includes(id)) continue;
  await page.setContent(`<html><body style="margin:0;background:#142543">${svg}</body></html>`);
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 1024, height: 1536 } });
  writeFileSync(`${out}/${id}.png`, buf);
  console.log(`${id}.png (수작업 SVG 선화)`);
}
await browser.close();
