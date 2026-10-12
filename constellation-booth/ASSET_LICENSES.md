# 자산 출처와 사용 조건 (ASSET_LICENSES)

## 천문 데이터

| 자산 | 출처 | 라이선스 | 사용 방식 |
|---|---|---|---|
| 별 좌표·등급·고유운동 (`scripts/catalog/stars.csv`, 126개) | [HYG Database v3.8](https://github.com/astronexus/HYG-Database) (Hipparcos·Yale BSC·Gliese 통합) | CC BY-SA 2.5 | `scripts/extract-stars.py` 로 필요한 별만 추출. ICRS/J2000, epoch 2000.0 |
| 행성·태양·달 천체력 | JPL DE421 ([skyfield-data 7.0.0](https://pypi.org/project/skyfield-data/) 번들) | 공공 자료(NASA/JPL) | 빌드 시 Skyfield 계산에만 사용. 앱에는 포함하지 않음 |
| 계산 라이브러리 | [Skyfield 1.55](https://rhodesmill.org/skyfield/) (생성), [astropy 8.0.1](https://www.astropy.org/) (검증) | MIT / BSD-3 | 빌드·검증 시에만 사용 |
| 별자리 연결선 | [Stellarium 'Modern (IAU)' sky culture](https://github.com/Stellarium/stellarium/tree/master/skycultures/modern_iau) (edges source: pbarbier.com) | CC BY-SA 4.0 | 연결선을 참고해 교육용으로 단순화(일부 선 생략·추가). `data/constellations.json` 에 기록 |
| 별자리 한글 이름·계절 분류 | 한국천문연구원 가을철 별자리 안내 등 일반 지식 | — | 설명 문안은 자체 작성 |

IAU 공식 별자리 경계는 사용하지 않는다(별을 잇는 교육용 그림과 다른 개념).

## 그림

| 자산 | 제작 | 비고 |
|---|---|---|
| 12별자리 카드 일러스트 `apps/fortune/public/art/*.webp` — 양·황소·쌍둥이·게·사자·처녀·천칭·전갈·사수 (9장) | OpenAI 이미지 API(`gpt-image-2`)로 생성 후 검수·WebP 변환 (`scripts/generate-card-art.py`, `scripts/optimize-card-art.py`) | 같은 스타일 문구로 생성해 선 굵기·여백·색 수를 통일. 생성 이미지의 권리는 OpenAI 이용약관에 따라 생성한 사용자에게 귀속 |
| 염소·물병·물고기 (3장) | 수작업 SVG 선화 (`scripts/fallback-card-art.mjs`) | API 크레딧 소진으로 생성하지 못해 같은 규칙으로 직접 그림. 크레딧 충전 후 `OPENAI_API_KEY=... python3 scripts/generate-card-art.py --only capricorn,aquarius,pisces` 로 재생성·교체 가능 |
| 앱 2 '모양 씌우기' 실루엣 (`apps/sky/src/shapes.ts`) | 자체 제작 (실제 별 좌표 프레임 위에 그린 선화) | 천문 좌표·연결 데이터를 생성 이미지로 대신하지 않음 |
| PWA 아이콘 (`apps/*/public/icons/*.png`) | 자체 제작 SVG → `scripts/make-icons.mjs` 로 렌더 | — |
| 배경 별·반짝임·별가루 | 코드로 그림 (Canvas/CSS) | — |

## 글꼴 (`shared/fonts/*.subset.woff2`)

| 글꼴 | 출처 | 라이선스 | 비고 |
|---|---|---|---|
| Noto Sans KR (Regular/Bold) | [Google Fonts / notosanskr](https://github.com/google/fonts/tree/main/ofl/notosanskr) | SIL Open Font License 1.1 (`shared/fonts/OFL-NotoSansKR.txt`) | 가변 글꼴을 400/700 으로 고정하고 KS X 1001 한글 2,350자 + 라틴·문장부호로 서브셋 (`scripts/build-fonts.py`) |
| Gowun Batang (Regular/Bold) | [Google Fonts / gowunbatang](https://github.com/google/fonts/tree/main/ofl/gowunbatang) | SIL Open Font License 1.1 (`shared/fonts/OFL-GowunBatang.txt`) | 제목용. 같은 범위로 서브셋 |

OFL 글꼴은 서브셋·번들 배포가 허용되며, 글꼴 자체를 판매하지 않는다.

## 소프트웨어

| 패키지 | 버전 | 라이선스 |
|---|---|---|
| vite | 8.3.4 | MIT |
| typescript | 7.0.2 | Apache-2.0 |
| playwright (검수 전용) | 1.64.0 | Apache-2.0 |
| @types/node | 22.19.1 | MIT |

행사 앱의 런타임 번들에는 외부 라이브러리가 포함되지 않는다(순수 TypeScript + CSS + SVG/Canvas).
