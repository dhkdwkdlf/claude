#!/usr/bin/env node
/**
 * 각 앱의 프로덕션 빌드를 독립 ZIP 으로 묶는다 (release/fortune.zip, release/sky.zip, release/both.zip).
 *   npm run build && node scripts/package-release.mjs
 * ZIP 은 Python 표준 zipfile 로 만들어 추가 의존성이 없다.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
for (const app of ["fortune", "sky"]) {
  if (!existsSync(`${root}dist/${app}/sw.js`)) {
    console.error(`dist/${app} 빌드가 없습니다. 먼저 npm run build 를 실행하세요.`);
    process.exit(1);
  }
}
mkdirSync(`${root}release`, { recursive: true });
const py = `
import sys, zipfile, pathlib
root = pathlib.Path(sys.argv[1])
def add(z, base, arc):
    for p in sorted(base.rglob('*')):
        if p.is_file():
            z.write(p, f"{arc}/{p.relative_to(base)}")
for app in ("fortune", "sky"):
    with zipfile.ZipFile(root / "release" / f"{app}.zip", "w", zipfile.ZIP_DEFLATED) as z:
        add(z, root / "dist" / app, app)
        z.write(root / "docs" / "OFFLINE_SETUP.md", "OFFLINE_SETUP.md")
        z.write(root / "docs" / "BOOTH_OPERATION.md", "BOOTH_OPERATION.md")
with zipfile.ZipFile(root / "release" / "both.zip", "w", zipfile.ZIP_DEFLATED) as z:
    add(z, root / "dist", "dist")
    for d in ("docs", ):
        add(z, root / d, d)
    for f in ("README.md", "ASSET_LICENSES.md", "scripts/preview-server.mjs"):
        z.write(root / f, f)
`;
execFileSync("python3", ["-I", "-c", py, root], { stdio: "inherit" });
for (const f of ["fortune.zip", "sky.zip", "both.zip"]) {
  console.log(`release/${f}  ${(statSync(`${root}release/${f}`).size / 1024 / 1024).toFixed(2)} MB`);
}
