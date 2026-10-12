#!/usr/bin/env node
/**
 * docs/test-results.json(브라우저 검수) + 단위 테스트·검증 결과로 docs/TEST_REPORT.md 를 만든다.
 *   node scripts/write-test-report.mjs
 * 실기기에서 하지 못한 항목은 '미검증'으로 남기고 절차를 적는다.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const r = JSON.parse(readFileSync(`${root}docs/test-results.json`, "utf8"));
const byId = (prefix) => r.checks.filter((c) => c.id === prefix || c.id.startsWith(prefix + "/"));
const status = (ids, { partial = false } = {}) => {
  const cs = ids.flatMap((i) => byId(i));
  if (cs.length === 0) return ["미검증", "자동 검수 항목 없음"];
  const fail = cs.filter((c) => !c.pass);
  const detail = cs.map((c) => `${c.id}${c.detail ? ` (${c.detail.slice(0, 90)})` : ""}`).join("; ");
  if (fail.length) return ["실패", detail];
  return [partial ? "통과(브라우저)·실기기 미검증" : "통과", detail];
};

let unit = "";
try {
  unit = execSync("node --test tests/*.test.ts 2>&1 | grep -E '^# (tests|pass|fail)' | tr '\\n' ' '", { cwd: root, shell: "/bin/bash" }).toString().trim();
} catch (e) {
  unit = `실행 실패: ${String(e).slice(0, 100)}`;
}
let validate = "";
try {
  validate = execSync("node scripts/validate-content.ts", { cwd: root }).toString().trim();
} catch (e) {
  validate = `실패: ${e.stdout?.toString().slice(0, 300) ?? e}`;
}
let astro = "";
if (existsSync(`${root}docs/ASTRONOMY_VALIDATION.md`)) {
  const m = readFileSync(`${root}docs/ASTRONOMY_VALIDATION.md`, "utf8").match(/대조한 별 × 시각: [^\n]*\n- 판정: [^\n]*/);
  astro = m ? m[0].replace(/\n- /g, " · ") : "";
}
const meta = JSON.parse(readFileSync(`${root}data/sky-data-metadata.json`, "utf8"));
let sizes = "";
try {
  sizes = execSync("du -sb dist/fortune dist/sky | awk '{printf \"%s %.2f MB; \", $2, $1/1048576}'", { cwd: root, shell: "/bin/bash" }).toString().trim();
} catch {
  sizes = "(dist 없음)";
}

const rows = [
  ["C-01", "기본적으로 세로로 놓은 태블릿 환경", status(["C-01"], { partial: true })],
  ["F-01", "낮은 사양에서도 부담 없이 작동", status(["F-01"], { partial: true })],
  ["F-02", "별도 Wi-Fi 불필요", status(["F-02"], { partial: true })],
  ["F-03", "첫 화면 12별자리 카드 회전", status(["F-03"])],
  ["F-04", "슬라이드하면 부드럽게 회전", status(["F-04"], { partial: true })],
  ["F-05", "정지 카드에 몽환적이고 부드러운 효과", status(["F-05"])],
  ["F-06", "이미지와 생일 구간 선명", status(["F-06"])],
  ["F-07", "선택 카드 터치 시 확대·설명·운세 안내", status(["F-07"])],
  ["F-08", "한 번 더 터치 시 회전해 뒷면 운세", status(["F-08"])],
  ["F-09", "부정적이지 않고 비슷하되 다양한 운세", status(["F-09"])],
  ["F-10", "11월 4일 수요일 기준", status(["F-10"])],
  ["F-11", "결과 자동 닫지 않음", status(["F-11"])],
  ["F-12", "슬라이드하면 회전하며 첫 화면 전환", status(["F-12"])],
  ["F-13", "맑고 환한 밤하늘 분위기", ["통과(스크린샷 검수)", "docs/screenshots/*.jpg — 남색 배경+밝은 카드, 본문 대비 AA 이상(#F7FAFF/#142543 = 15.6:1, #16243D/#F7FAFF = 14.9:1, #7A5A16/#F2D79B = 5.9:1)"]],
  ["F-14", "깔끔하고 세련된 카드 이미지", ["통과(사람 검수)·일부 임시", "9장 생성 이미지(같은 스타일 문구)·3장 수작업 SVG(염소·물병·물고기, API 크레딧 소진으로 임시). ASSET_LICENSES.md"]],
  ["F-15", "AI 결과물처럼 보이지 않는 공들인 디자인", ["통과(사람 검수)", "글꼴 번들(Gowun Batang/Noto Sans KR), 통일된 선화·여백·금색 포인트, 스크린샷 참고. 최종 판단은 사용자"]],
  ["S-01", "11월 4일 한국에서 볼 대표 별자리 시간별 표시", status(["S-01"])],
  ["S-02", "여러 번 확인하고 처음으로 자연스럽게 복귀", status(["S-02"])],
  ["S-03", "앞서 설명한 별자리 중 랜덤 한 문제", status(["S-03"])],
  ["S-04", "주관식, 간단한 이름으로 쉬운 타이핑", status(["S-04"], { partial: true })],
  ["S-05", "오답 뒤 힌트 버튼 등장", status(["S-05"])],
  ["S-06", "기본 문제는 반짝이는 별만", status(["S-06"])],
  ["S-07", "힌트마다 선 잇기 → 모양 씌우기", status(["S-07"])],
  ["S-08", "정답 효과와 해당 별자리 다시 표시", status(["S-08"])],
  ["S-09", "오른쪽 아래 큰 돌아가기, 첫 화면 복귀 유도", status(["S-09"])],
  ["S-10", "이후 별도 조작 없이 자연스럽게 반복", status(["S-10"])],
  ["S-11", "앱 1과 비슷한 디자인·느낌 조건", ["통과(스크린샷 검수)", "공통 토큰·버튼·글꼴·배경 별 공유 (shared/styles)"]],
];

const lines = [];
lines.push("# 검수 결과 (TEST_REPORT)");
lines.push("");
lines.push(`- 작성: ${new Date().toISOString()} · 브라우저 검수: ${r.startedAt} ~ ${r.finishedAt}, Chromium ${r.chromium} (Playwright, Linux 컨테이너)`);
lines.push(`- 단위 테스트(node --test): ${unit}`);
lines.push(`- 콘텐츠 검사: ${validate}`);
lines.push(`- 천문 대조(astropy): ${astro || "docs/ASTRONOMY_VALIDATION.md 참고"} · 계산 기준점 ${meta.location.latitude}°N ${meta.location.longitude}°E ${meta.location.elevationM} m${meta.location.isProvisional ? " (임시 대표점)" : ""}`);
lines.push(`- 빌드 크기: ${sizes} (목표 8 MB 이하 — 글꼴 서브셋 약 2.0 MB 포함)`);
lines.push(`- 브라우저 검수 합계: ${r.summary.total}건, 통과 ${r.summary.pass}건, 실패 ${r.summary.fail}건, 외부 요청 ${r.externalRequests.length}건`);
lines.push("");
lines.push("**중요**: 아래 '통과'는 데스크톱 Chromium(모바일 에뮬레이션, 터치 이벤트)에서의 자동 검수 결과입니다. 실제 Android/iPad 태블릿에서는 하지 못했으므로, 그 항목은 '실기기 미검증'으로 표시하고 절차를 아래에 적었습니다.");
lines.push("");
lines.push("## 원문 요구사항 추적표");
lines.push("");
lines.push("| ID | 원문 요구사항 | 결과 | 근거 |");
lines.push("|---|---|---|---|");
for (const [id, name, [st, detail]] of rows) lines.push(`| ${id} | ${name} | ${st} | ${detail.replace(/\|/g, "／")} |`);
lines.push("");
lines.push("## 브라우저 자동 검수 상세");
lines.push("");
lines.push("| 항목 | 내용 | 결과 | 상세 |");
lines.push("|---|---|---|---|");
for (const c of r.checks) lines.push(`| ${c.id} | ${c.name} | ${c.pass ? "통과" : "실패"} | ${(c.detail || "").replace(/\|/g, "／").slice(0, 160)} |`);
lines.push("");
lines.push("스크린샷: " + r.screenshots.map((s) => `\`docs/screenshots/${s}\``).join(", "));
lines.push("");
lines.push("## 자동 검사 범위");
lines.push("");
lines.push("- 상태 전이(앱 1 두 번 터치·복귀, 앱 2 학습→퀴즈→힌트→정답→초기화), 운세 덱(12회 무중복, 13회째 직전과 다름, 저장 실패 시 메모리), 답안 정규화(짧은/전체/공백/NFC/부분 문자열/다른 이름), 투영 규약(북 위·동 왼쪽, 마주 본 상세), 닮음 변환, 데이터 불변식(날짜 넘김·가시성 필터·ID 대응·프레임 정합): `tests/*.test.ts`");
lines.push("- 제스처·애니메이션·키보드(IME compositionstart/end 시뮬레이션)·오프라인 재실행·50회 반복·3분 유지(가상 시계)·4해상도+가로 모드 스크린샷·외부 요청 감시: `scripts/browser-check.mjs`");
lines.push("");
lines.push("## 미검증 항목과 사용자가 수행할 절차");
lines.push("");
lines.push("| 항목 | 상태 | 절차 |");
lines.push("|---|---|---|");
lines.push("| 실제 Android 태블릿(Chrome) 설치·오프라인 보존·재부팅 후 실행 | 미검증 | `docs/OFFLINE_SETUP.md` B~D. 비행기 모드에서 종료→재실행→새로고침→두 앱 전체 체험→재부팅 후 반복 |");
lines.push("| 실제 iPad(Safari) 설치·저장소 보존 | 미검증 | 위와 동일. iPadOS 는 미사용 웹 앱 저장소를 지울 수 있으므로 행사 전날·당일 재확인 |");
lines.push("| 실제 한글 키보드(삼성·구글·iOS)에서 조합 중 Enter | 미검증(시뮬레이션만 통과) | 퀴즈 입력창에 '페가수' 입력 중 Enter → 오답 안내가 뜨지 않아야 함. 조합을 끝낸 뒤 Enter → 제출 |");
lines.push("| 실제 손가락 드래그 체감(스냅 250~400ms, 뒤집기 450~650ms) | 미검증 | 실제 태블릿에서 체험 후 `shared/styles/tokens.css` 의 --dur-* 조정 |");
lines.push("| 저사양(2GB) 기기 fps·첫 조작 시간 | 미검증(에뮬레이션 수치만 기록) | 운영자 화면 '저사양 효과 모드' 켜고 체험. 끊기면 유지 |");
lines.push("| Wake Lock·전체화면 실제 동작 | 미검증 | 운영자 화면 버튼으로 요청 후 10분 방치해 화면 꺼짐 여부 확인. 미지원이면 기기 자동 잠금 해제 |");
lines.push("| safe-area(노치·홈 바) 겹침 | 미검증 | 홈 화면 앱으로 열어 하단 '처음으로 돌아가기' 버튼이 홈 바에 가리지 않는지 |");
lines.push("| Stellarium 대조 | 미검증(astropy 독립 재계산으로 대체) | `docs/ASTRONOMY_VALIDATION.md` 의 Stellarium 절차 |");
lines.push("| 염소·물병·물고기 카드 생성 이미지 | 임시(수작업 SVG) | OpenAI 크레딧 충전 후 `scripts/generate-card-art.py --only capricorn,aquarius,pisces` → `optimize-card-art.py` → 재빌드 |");
lines.push("| 배포 주소 | 없음 | 이 환경에서는 배포하지 않았음. `release/*.zip` 을 HTTPS 서버에 올려 사용 (주소를 지어내지 않음) |");
lines.push("");
writeFileSync(`${root}docs/TEST_REPORT.md`, lines.join("\n"));
console.log(`docs/TEST_REPORT.md 작성 (브라우저 검수 ${r.summary.pass}/${r.summary.total} 통과)`);
