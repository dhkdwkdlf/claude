import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { precachePlugin } from "../../shared/build/vite-plugin-precache.ts";

const root = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../..", import.meta.url));
const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };
const version = `${pkg.version}+${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;

// STANDALONE=1 이면 단일 HTML 파일용 빌드(상대 경로, 모든 자산 인라인, 서비스 워커 없음)
const standalone = process.env.STANDALONE === "1";

export default defineConfig({
  root,
  base: standalone ? "./" : "/sky/",
  publicDir: "public",
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: {
    alias: {
      "@shared": `${repo}shared`,
      "@data": `${repo}data`,
    },
  },
  server: { host: true, port: 5174, fs: { allow: [repo] } },
  build: {
    outDir: standalone ? `${repo}dist/.standalone/sky` : `${repo}dist/sky`,
    emptyOutDir: true,
    target: ["es2020", "safari14"],
    sourcemap: false,
    assetsInlineLimit: standalone ? 1024 * 1024 * 64 : 2048,
    modulePreload: !standalone,
  },
  plugins: standalone ? [] : [precachePlugin({ appId: "sky", version })],
});
