#!/usr/bin/env node
/**
 * 각 앱을 '단일 HTML 파일' 로 만든다. 글꼴·그림·데이터·스크립트·스타일을 전부 파일 하나에 넣어
 * 서버 없이 더블클릭(file://)만으로 실행된다. PC 시험과 태블릿 간편 설치용.
 *   node scripts/build-standalone.mjs
 * 출력: dist/standalone/별자리운세.html, dist/standalone/별자리여행.html
 *
 * 단일 파일에서는 서비스 워커·manifest 를 쓰지 않는다(필요 없음). 홈 화면 앱(PWA) 설치는 dist/<app>/ 서버 버전.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const MIME = { ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".jpg": "image/jpeg" };
const APPS = [
  { id: "fortune", file: "별자리운세.html", title: "별빛이 전하는 오늘의 한마디" },
  { id: "sky", file: "별자리여행.html", title: "11월 4일의 별자리 여행" },
];

const dataUrl = (file) => `data:${MIME[extname(file)] || "application/octet-stream"};base64,${readFileSync(file).toString("base64")}`;

function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, base, out);
    else out.push(full.slice(base.length + 1).split("\\").join("/"));
  }
  return out;
}

mkdirSync(`${root}dist/standalone`, { recursive: true });
for (const app of APPS) {
  const outDir = `${root}dist/.standalone/${app.id}`;
  execFileSync("npx", ["vite", "build", "--config", `apps/${app.id}/vite.config.ts`], { cwd: root, stdio: "inherit", env: { ...process.env, STANDALONE: "1" } });

  let html = readFileSync(`${outDir}/index.html`, "utf8");
  const files = walk(outDir);
  const assets = {};

  // 1) 스크립트·스타일 인라인
  for (const f of files) {
    if (f.endsWith(".js")) {
      const js = readFileSync(`${outDir}/${f}`, "utf8").replace(/<\/script/gi, "<\\/script");
      html = html.replace(new RegExp(`<script[^>]*src="\\./${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*></script>`), () => `<script type="module">${js}</script>`);
    } else if (f.endsWith(".css")) {
      const css = readFileSync(`${outDir}/${f}`, "utf8");
      html = html.replace(new RegExp(`<link[^>]*href="\\./${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`), () => `<style>${css}</style>`);
    }
  }
  // 2) public 자산(그림·아이콘) → data: URL 매핑. 아이콘은 favicon 으로만 인라인.
  for (const f of files) {
    if (f.startsWith("art/") || f.startsWith("shapes/")) assets[f] = dataUrl(`${outDir}/${f}`);
  }
  const icon192 = files.includes("icons/icon-192.png") ? dataUrl(`${outDir}/icons/icon-192.png`) : "";
  html = html
    .replace(/<link rel="manifest"[^>]*>\s*/g, "")
    .replace(/<link rel="icon"[^>]*>/, icon192 ? `<link rel="icon" href="${icon192}" type="image/png" />` : "")
    .replace(/<link rel="apple-touch-icon"[^>]*>/, icon192 ? `<link rel="apple-touch-icon" href="${icon192}" />` : "")
    .replace(/<link rel="modulepreload"[^>]*>\s*/g, "");
  // 3) 단일 파일 표식 + 자산 매핑 (스크립트보다 먼저)
  const bootstrap = `<script>window.__STANDALONE__=true;window.__STANDALONE_ASSETS__=${JSON.stringify(assets)};</script>`;
  html = html.replace("<head>", `<head>\n${bootstrap}`);
  if (/src="\.\//.test(html) || /href="\.\/assets/.test(html)) {
    console.error(`${app.id}: 인라인되지 않은 참조가 남아 있습니다.`);
    process.exit(1);
  }
  const target = `${root}dist/standalone/${app.file}`;
  writeFileSync(target, html);
  console.log(`dist/standalone/${app.file}  ${(statSync(target).size / 1024 / 1024).toFixed(2)} MB`);
}
rmSync(`${root}dist/.standalone`, { recursive: true, force: true });
