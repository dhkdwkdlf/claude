/**
 * 빌드 결과(outDir)의 모든 파일 목록으로 서비스 워커(sw.js)와 precache-manifest.json 을 생성한다.
 *
 * - 방문한 화면만 저장하는 방식이 아니라 전체 필수 자산을 설치 시점에 한 번에 캐시한다.
 * - 캐시 이름은 앱 ID + 빌드 버전 + 내용 해시로 분리해 두 앱이 서로의 캐시를 건드리지 않는다.
 * - 새 서비스 워커는 자동으로 활성화하지 않는다(운영자가 체험 종료 후 적용).
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

export interface PrecacheOptions {
  appId: string;
  version: string;
}

function walk(dir: string, root: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, root, out);
    else out.push(relative(root, full).split(sep).join("/"));
  }
  return out;
}

export function precachePlugin(opts: PrecacheOptions): Plugin {
  let config: ResolvedConfig;
  return {
    name: "booth-precache",
    apply: "build",
    configResolved(c) {
      config = c;
    },
    closeBundle() {
      const outDir = config.build.outDir;
      const base = config.base.endsWith("/") ? config.base : `${config.base}/`;
      const files = walk(outDir, outDir)
        .filter((f) => f !== "sw.js" && f !== "precache-manifest.json" && !f.endsWith(".map"))
        .sort();
      const hash = createHash("sha256");
      for (const f of files) {
        hash.update(f);
        hash.update(readFileSync(join(outDir, f)));
      }
      const contentHash = hash.digest("hex").slice(0, 10);
      const cacheName = `${opts.appId}-v${opts.version}-${contentHash}`;
      const urls = files.map((f) => (f === "index.html" ? base : `${base}${f}`));
      const totalBytes = files.reduce((n, f) => n + statSync(join(outDir, f)).size, 0);

      const manifest = {
        appId: opts.appId,
        version: opts.version,
        contentHash,
        cacheName,
        base,
        totalBytes,
        files: urls,
      };
      writeFileSync(join(outDir, "precache-manifest.json"), JSON.stringify(manifest, null, 1));

      const template = readFileSync(new URL("./sw-template.js", import.meta.url), "utf8");
      const sw = template
        .replace("__CACHE_NAME__", JSON.stringify(cacheName))
        .replace("__CACHE_PREFIX__", JSON.stringify(`${opts.appId}-v`))
        .replace("__BASE__", JSON.stringify(base))
        .replace("__PRECACHE__", JSON.stringify([...urls, `${base}precache-manifest.json`]));
      writeFileSync(join(outDir, "sw.js"), sw);
      config.logger.info(
        `[precache] ${opts.appId}: ${files.length} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MB, cache ${cacheName}`,
      );
    },
  };
}
