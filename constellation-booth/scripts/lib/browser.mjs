/** Playwright Chromium 실행 파일을 찾는다. 설치된 빌드 번호가 달라도 동작하게 한다. */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

export function findChromium() {
  if (process.env.PW_CHROMIUM && existsSync(process.env.PW_CHROMIUM)) return process.env.PW_CHROMIUM;
  try {
    const p = chromium.executablePath();
    if (existsSync(p)) return p;
  } catch {
    /* 계속 탐색 */
  }
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (existsSync(base)) {
    for (const dir of readdirSync(base).filter((d) => d.startsWith("chromium-")).sort().reverse()) {
      for (const sub of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
        const p = join(base, dir, sub);
        if (existsSync(p)) return p;
      }
    }
  }
  return undefined;
}

export async function launchChromium(options = {}) {
  const executablePath = findChromium();
  return chromium.launch({ executablePath, headless: true, ...options });
}
