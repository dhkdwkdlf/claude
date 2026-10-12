import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { precachePlugin } from "../../shared/build/vite-plugin-precache.ts";

const root = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../..", import.meta.url));
const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };
const version = `${pkg.version}+${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;

export default defineConfig({
  root,
  base: "/sky/",
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
    outDir: `${repo}dist/sky`,
    emptyOutDir: true,
    target: ["es2020", "safari14"],
    sourcemap: false,
    assetsInlineLimit: 2048,
  },
  plugins: [precachePlugin({ appId: "sky", version })],
});
