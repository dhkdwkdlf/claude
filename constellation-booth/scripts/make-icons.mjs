#!/usr/bin/env node
/**
 * 두 앱의 PWA 아이콘(PNG)을 SVG 에서 생성한다 (Playwright 의 Chromium 사용).
 *   node scripts/make-icons.mjs
 * 출력: apps/<app>/public/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { launchChromium } from "./lib/browser.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

const star = (cx, cy, r, fill) =>
  `<path fill="${fill}" d="M${cx} ${cy - r} L${cx + r * 0.28} ${cy - r * 0.28} L${cx + r} ${cy} L${cx + r * 0.28} ${cy + r * 0.28} L${cx} ${cy + r} L${cx - r * 0.28} ${cy + r * 0.28} L${cx - r} ${cy} L${cx - r * 0.28} ${cy - r * 0.28} Z"/>`;

const icons = {
  fortune: (pad) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#29486f"/><stop offset="1" stop-color="#142543"/></linearGradient></defs>
      <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="url(#g)"/>
      <g transform="translate(256 262) scale(${pad ? 0.78 : 0.9})">
        <rect x="-120" y="-170" width="240" height="340" rx="30" fill="#f7faff"/>
        <rect x="-120" y="-170" width="240" height="198" rx="30" fill="#142543"/>
        <rect x="-120" y="-30" width="240" height="60" fill="#142543"/>
        ${star(-40, -95, 20, "#f2d79b")}${star(30, -60, 12, "#f2d79b")}${star(62, -118, 9, "#f2d79b")}${star(-70, -30, 8, "#dce8f8")}
        <path d="M-52 -60 Q-20 -130 30 -60" fill="none" stroke="#dce8f8" stroke-width="8" stroke-linecap="round"/>
        <rect x="-70" y="60" width="140" height="18" rx="9" fill="#29486f"/>
        <rect x="-50" y="100" width="100" height="14" rx="7" fill="#8fb0da"/>
      </g>
    </svg>`,
  sky: (pad) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
      <defs><radialGradient id="g" cx="0.5" cy="0.35" r="0.8"><stop offset="0" stop-color="#3b5f8c"/><stop offset="1" stop-color="#142543"/></radialGradient></defs>
      <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="url(#g)"/>
      <g transform="translate(256 256) scale(${pad ? 0.78 : 0.92})">
        <circle r="190" fill="none" stroke="#8fb0da" stroke-width="6" stroke-dasharray="10 14"/>
        <polyline points="-110,-60 -40,-20 20,-70 90,-30 130,40" fill="none" stroke="#dce8f8" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        ${star(-110, -60, 20, "#f2d79b")}${star(-40, -20, 16, "#f2d79b")}${star(20, -70, 22, "#f2d79b")}${star(90, -30, 15, "#f2d79b")}${star(130, 40, 19, "#f2d79b")}
        ${star(-60, 110, 10, "#dce8f8")}${star(40, 130, 8, "#dce8f8")}${star(-140, 60, 7, "#dce8f8")}
      </g>
    </svg>`,
};

const browser = await launchChromium();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [app, make] of Object.entries(icons)) {
  const dir = `${root}apps/${app}/public/icons`;
  mkdirSync(dir, { recursive: true });
  for (const [name, size, pad] of [
    ["icon-192", 192, false],
    ["icon-512", 512, false],
    ["apple-touch-icon", 180, true],
    ["icon-maskable-512", 512, true],
  ]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${make(pad).replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
    const buf = await page.screenshot({ omitBackground: !pad, clip: { x: 0, y: 0, width: size, height: size } });
    writeFileSync(`${dir}/${name}.png`, buf);
    console.log(`${app}/${name}.png`);
  }
}
await browser.close();
