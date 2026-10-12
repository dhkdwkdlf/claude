#!/usr/bin/env node
/**
 * dist/ 를 정적으로 제공하는 미리보기 서버. /fortune/ 와 /sky/ 를 각각 독립 앱으로 서비스한다.
 *   node scripts/preview-server.mjs [--port 4173] [--host 0.0.0.0]
 * 실제 행사 설치는 HTTPS 서버(또는 이 서버를 HTTPS 리버스 프록시 뒤에) 에서 한다. 개발·검수용으로는
 * localhost 가 보안 컨텍스트로 취급되어 서비스 워커가 동작한다.
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist", import.meta.url));
const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1] || 4173);
const host = args.includes("--host") ? args[args.indexOf("--host") + 1] : "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><meta charset="utf-8"><title>별자리 부스</title><body style="font-family:sans-serif;padding:24px"><p>검수용 목록 페이지입니다. 부스에서는 각 앱 주소를 직접 홈 화면에 설치합니다.</p><ul><li><a href="/fortune/">/fortune/ — 즉석 별자리 운세</a></li><li><a href="/sky/">/sky/ — 11월 4일의 별자리 여행</a></li></ul>`);
    return;
  }
  for (const app of ["fortune", "sky"]) {
    if (pathname === `/${app}`) {
      res.writeHead(301, { location: `/${app}/` });
      res.end();
      return;
    }
    if (pathname.startsWith(`/${app}/`)) {
      let file = normalize(join(root, pathname));
      if (!file.startsWith(root)) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, app, "index.html");
      const type = MIME[extname(file)] || "application/octet-stream";
      const headers = { "content-type": type, "cache-control": file.endsWith("sw.js") || file.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable" };
      if (file.endsWith("sw.js")) headers["service-worker-allowed"] = `/${app}/`;
      res.writeHead(200, headers);
      createReadStream(file).pipe(res);
      return;
    }
  }
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("not found");
});

server.listen(port, host, () => {
  console.log(`미리보기 서버: http://localhost:${port}/fortune/  http://localhost:${port}/sky/`);
});
