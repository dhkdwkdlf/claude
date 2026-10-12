# 별자리 부스 태블릿 앱 2종

2026년 11월 4일(수) 별자리 체험 부스용, 세로 태블릿 전용 오프라인 PWA 두 개.

| 앱 | 경로 | 내용 |
|---|---|---|
| **앱 1 — 별빛이 전하는 오늘의 한마디** | `/fortune/` | 12별자리 회전 카드 → 두 번 터치 → 뒷면 운세 → 슬라이드 복귀. 운세 156개(별자리당 13개) 로컬 문안 |
| **앱 2 — 11월 4일의 별자리 여행** | `/sky/` | 봉화 기준 시간별(18·20·22·다음 날 0시) 실제 별 위치 → 별자리 설명 → 한 문제 주관식 퀴즈(오답 뒤 선 잇기 → 모양 씌우기 힌트) → 정답 효과 → 처음으로 |

두 앱은 서로 독립적으로 설치·실행되며(각자 manifest·서비스 워커·캐시), 행사 중 외부 네트워크를 전혀 쓰지 않습니다.

## 빠른 시작

```bash
cd constellation-booth
npm ci                      # Node 22 이상
npm run build               # dist/fortune, dist/sky 생성 (+ sw.js, precache-manifest.json)
npm run preview             # http://localhost:4173/fortune/  http://localhost:4173/sky/
```

개발 서버: `npm run dev:fortune` (5173), `npm run dev:sky` (5174).

검사:

```bash
npm run typecheck           # tsc
npm test                    # node --test (상태 기계·덱·정규화·투영·데이터 불변식, 42건)
npm run validate            # 콘텐츠·스키마 검사 (ID·이미지·좌표·운세 수·금지 표현)
npm run test:browser        # Playwright 자동 검수 → docs/test-results.json, docs/screenshots/
npm run package             # release/fortune.zip, sky.zip, both.zip
```

## 폴더

```
apps/fortune/     앱 1 (index.html, src/, public/art·icons·manifest)
apps/sky/         앱 2
shared/           디자인 토큰·공통 CSS·PWA 등록·운영자 패널·글꼴 서브셋·프리캐시 플러그인
data/             event-config.json, zodiac.json, fortunes.json, constellations.json,
                  sky-slots.json(생성), constellation-frames.json(생성), sky-data-metadata.json(생성)
scripts/          generate-sky-data.py, verify-sky-data.py, extract-stars.py, validate-content.ts,
                  browser-check.mjs, preview-server.mjs, make-icons.mjs, build-fonts.py,
                  generate-card-art.py, optimize-card-art.py, fallback-card-art.mjs, package-release.mjs
docs/             OFFLINE_SETUP.md, BOOTH_OPERATION.md, ASTRONOMY_VALIDATION.md, TEST_REPORT.md, screenshots/
dist/             실행 가능한 빌드 (앱별 독립)
release/          ZIP 묶음
```

## 행사 설정 바꾸기

`data/event-config.json` 에 행사일, 시간대, 관측 지점(위도·경도·고도), 시간 슬롯, 기본 시간, 저사양 모드, 운세 제목이 있습니다.

- 앱 1: 날짜 문구만 쓰므로 수정 후 `npm run build`.
- 앱 2: **별 위치 데이터를 다시 생성해야 합니다.** 수정 후 아래 순서로 실행합니다. 재생성 없이 빌드하면 앱이 설정 불일치를 감지해 운영자 확인 경고를 띄웁니다(예전 데이터를 새 설정의 결과처럼 보여주지 않음).

```bash
pip install skyfield skyfield-data astropy          # 빌드 머신에서 1회
python3 scripts/generate-sky-data.py                 # Skyfield 로 생성 → data/sky-slots.json 등
python3 scripts/verify-sky-data.py                   # astropy 로 독립 재계산·대조 → docs/ASTRONOMY_VALIDATION.md
npm run validate && npm test && npm run build
```

현재 계산 기준점은 봉화읍 인근 대표점 **36.90°N, 128.73°E, 고도 0 m** (교육용 임시값, `isProvisional: true`)입니다. 실제 행사장 좌표가 확정되면 바꾸고 위 절차를 다시 실행하세요.

별 목록을 바꾸려면 `data/constellations.json` 의 starIds 를 고친 뒤 `python3 scripts/extract-stars.py <hyg_v38.csv.gz>` 로 `scripts/catalog/stars.csv` 를 다시 뽑습니다 (HYG 원본은 저장소에 없음, `ASSET_LICENSES.md` 참고).

## 카드 일러스트 재생성

```bash
OPENAI_API_KEY=... python3 scripts/generate-card-art.py [--only capricorn,aquarius,pisces] --out <원본 폴더>
python3 scripts/optimize-card-art.py <원본 폴더>     # → apps/fortune/public/art/*.webp
```

API 를 쓸 수 없으면 `node scripts/fallback-card-art.mjs <폴더> capricorn,aquarius,pisces` 로 수작업 선화를 렌더합니다.

## 운영자 화면

참가자 화면에는 설정 버튼이 없습니다. 첫 화면의 작은 날짜 글자를 2.5초 안에 5번 두드리거나 주소에 `#operator` 를 붙이면 열립니다. 오프라인 준비 상태·누락 파일·버전, 업데이트 적용, 전체화면·화면 켜짐 유지, 저사양 모드, 참가자 화면 초기화, (앱 1) 덱 초기화, (앱 2) 기본 시간·행사 설정.

## 설계 메모

- 상태 전이는 `apps/fortune/src/state.ts`, `apps/sky/src/session.ts` 의 순수 함수에 모여 있고 테스트로 고정되어 있습니다.
- 제스처: Pointer Events, 이동 10px 초과 = 드래그, 카드 전환은 50px 또는 너비 12% 중 작은 값, 좌우 우세일 때만 슬라이드, 드래그 후 click 억제.
- 앱 2 투영: 전체 지도는 방위각 등거리 투영(올려다본 하늘, 북 위·동 왼쪽), 상세는 별자리를 마주 본 심사투영(위 = 천정). 모양 오버레이는 적도좌표 기준 프레임에서 그린 선화를 최소제곱 닮음 변환으로 얹습니다(`projection.ts`).
- 오프라인: 빌드 시 `shared/build/vite-plugin-precache.ts` 가 dist 전체 목록으로 `sw.js` 를 생성하고 설치 시 한 번에 전부 캐시합니다. 캐시 이름 = `앱ID-v버전-내용해시`. 새 워커는 운영자가 적용할 때까지 대기합니다.
- 용량: 앱당 약 2.4 MB (그중 글꼴 서브셋 4개 ≈ 2.0 MB, 카드 그림 12장 ≈ 0.4 MB). 사용자 지시로 8 MB 목표 안에서 글꼴을 번들했습니다.

자세한 내용: `docs/OFFLINE_SETUP.md`, `docs/BOOTH_OPERATION.md`, `docs/ASTRONOMY_VALIDATION.md`, `docs/TEST_REPORT.md`, `ASSET_LICENSES.md`.
