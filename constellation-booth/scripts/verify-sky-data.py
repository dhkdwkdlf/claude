#!/usr/bin/env python3
"""독립 도구(astropy)로 data/sky-slots.json 의 별 방위각·고도를 재계산해 대조한다.

사용법:
    python3 scripts/verify-sky-data.py [--tolerance 1.0] [--report docs/ASTRONOMY_VALIDATION.md]

- Skyfield(생성)와 astropy(검증)는 서로 다른 구현이다. 같은 입력(HYG J2000 좌표·고유운동, 봉화 좌표,
  KST→UTC 변환)으로 각 별의 방위각·고도를 계산해 차이가 허용 오차(기본 1°) 이내인지 확인한다.
- astropy 는 오프라인으로 동작하도록 IERS 자동 다운로드를 끈다. 2026년은 번들 IERS-B 범위 밖이므로
  극운동·UT1-UTC 를 0 으로 근사한다(오차 < 0.01°).
- 둘 다 대기 굴절은 적용하지 않는다.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import sys
import warnings
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CATALOG = ROOT / "scripts" / "catalog" / "stars.csv"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tolerance", type=float, default=1.0)
    ap.add_argument("--report", default=str(ROOT / "docs" / "ASTRONOMY_VALIDATION.md"))
    args = ap.parse_args()

    import astropy
    import astropy.units as u
    from astropy.coordinates import AltAz, EarthLocation, SkyCoord, get_body, get_sun
    from astropy.time import Time
    from astropy.utils import iers

    iers.conf.auto_download = False
    iers.conf.iers_degraded_accuracy = "ignore"
    warnings.simplefilter("ignore")

    cfg = json.loads((DATA / "event-config.json").read_text("utf-8"))
    slots_doc = json.loads((DATA / "sky-slots.json").read_text("utf-8"))
    meta = json.loads((DATA / "sky-data-metadata.json").read_text("utf-8"))
    cons = json.loads((DATA / "constellations.json").read_text("utf-8"))["constellations"]
    stars = {}
    with CATALOG.open(encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            stars[f"hip{r['hip']}"] = r

    loc = cfg["location"]
    site = EarthLocation(lat=loc["latitude"] * u.deg, lon=loc["longitude"] * u.deg, height=loc["elevationM"] * u.m)

    ids = sorted(stars)
    coords = SkyCoord(
        ra=[float(stars[i]["ra_deg"]) for i in ids] * u.deg,
        dec=[float(stars[i]["dec_deg"]) for i in ids] * u.deg,
        pm_ra_cosdec=[float(stars[i]["pmra_mas_yr"] or 0) for i in ids] * u.mas / u.yr,
        pm_dec=[float(stars[i]["pmdec_mas_yr"] or 0) for i in ids] * u.mas / u.yr,
        distance=[1000.0] * len(ids) * u.pc,  # 시차 무시(HYG 거리 미사용) — 1° 검증에는 영향 없음
        frame="icrs",
        obstime=Time("J2000"),
    )

    lines = []
    lines.append("# 천문 데이터 검증 기록 (ASTRONOMY_VALIDATION)")
    lines.append("")
    lines.append(f"- 검증 실행 시각(UTC): {datetime.utcnow().isoformat(timespec='seconds')}Z")
    lines.append(f"- 생성 도구: Skyfield {meta['tools']['skyfield']} + {meta['tools']['ephemeris']} (`scripts/generate-sky-data.py`)")
    lines.append(f"- 독립 검증 도구: astropy {astropy.__version__} (`scripts/verify-sky-data.py`, ERFA 기반 ICRS→AltAz 변환)")
    lines.append(f"- 별 목록: {meta['catalog']['name']} — {meta['catalog']['coordinateSystem']}, 고유운동 {meta['catalog']['properMotion']}")
    lines.append(f"- 관측 기준점: {loc['label']} (위도 {loc['latitude']}°, 경도 {loc['longitude']}°, 고도 {loc['elevationM']} m){' — 임시 대표점' if loc.get('isProvisional') else ''}")
    lines.append(f"- 시간대: {cfg['timeZone']} (UTC+{cfg['utcOffsetMinutes'] // 60}). '다음 날 0시'는 {cfg['eventDate']} 다음 날 00:00 KST")
    lines.append(f"- 대기 굴절: 두 도구 모두 미적용. 방위각 규약: {meta['method']['azimuthConvention']}")
    lines.append(f"- 허용 오차: 방위각·고도 각 {args.tolerance}° (방위각 차이는 cos(고도) 를 곱해 하늘 위 실제 각거리로 환산)")
    lines.append(f"- 설정 지문: `{meta['configFingerprint']}`")
    lines.append("")
    lines.append("## 박명 (Skyfield almanac, 봉화 기준)")
    lines.append("")
    for k, v in meta.get("twilight", {}).items():
        lines.append(f"- {k}: {v}")
    lines.append("")

    worst = 0.0
    failures = 0
    total = 0
    per_slot_rows = []
    for slot in slots_doc["slots"]:
        t = Time(slot["utcISO"], scale="utc")
        frame = AltAz(obstime=t, location=site, pressure=0 * u.bar)
        aa = coords.apply_space_motion(new_obstime=t).transform_to(frame)
        gen = {s["id"]: s for s in slot["stars"]}
        sun_alt = get_sun(t).transform_to(frame).alt.deg
        moon_alt = get_body("moon", t, site).transform_to(frame).alt.deg
        slot_worst = 0.0
        slot_rows = []
        for i, sid in enumerate(ids):
            g = gen[sid]
            alt_a, az_a = aa.alt.deg[i], aa.az.deg[i] % 360
            d_alt = alt_a - g["altitudeDeg"]
            d_az = ((az_a - g["azimuthDeg"] + 180) % 360) - 180
            sep = math.hypot(d_alt, d_az * math.cos(math.radians(alt_a)))
            total += 1
            if abs(d_alt) > args.tolerance or abs(d_az * math.cos(math.radians(alt_a))) > args.tolerance:
                failures += 1
            slot_worst = max(slot_worst, sep)
            slot_rows.append((sid, g, alt_a, az_a, sep))
        worst = max(worst, slot_worst)
        per_slot_rows.append((slot, slot_rows, sun_alt, moon_alt, slot_worst))

    lines.append("## 요약")
    lines.append("")
    lines.append(f"- 대조한 별 × 시각: {total}건, 허용 오차 초과: {failures}건, 최대 각거리 차이: {worst:.4f}°")
    lines.append(f"- 판정: {'통과' if failures == 0 else '실패'}")
    lines.append("")

    for slot, rows, sun_alt, moon_alt, slot_worst in per_slot_rows:
        lines.append(f"## {slot['labelKo']} — {slot['localISO']} (UTC {slot['utcISO']})")
        lines.append("")
        lines.append(f"- 태양 고도: Skyfield {slot['sunAltitudeDeg']:+.2f}° / astropy {sun_alt:+.2f}° → {slot['twilight']}")
        lines.append(f"- 달 고도: Skyfield {slot['moon']['altitudeDeg']:+.2f}° / astropy {moon_alt:+.2f}°, 조도 {slot['moon']['fractionIlluminated']:.2f}")
        lines.append(f"- 이 시각 최대 각거리 차이: {slot_worst:.4f}°")
        lines.append(f"- 표시 후보: {', '.join(slot['visibleConstellationIds'])}")
        lines.append(f"- 지평선 가까이(출제 제외): {', '.join(slot['nearHorizonConstellationIds']) or '-'}")
        lines.append("")
        lines.append("| 별자리 | 별 (HIP) | Skyfield 고도 | Skyfield 방위 | astropy 고도 | astropy 방위 | 각거리 차 |")
        lines.append("|---|---|---|---|---|---|---|")
        rowmap = {r[0]: r for r in rows}
        for c in cons:
            # 수록 별자리마다 대표 별 2개 이상 (필수 별 중 밝은 순 3개)
            picks = sorted(c["requiredStarIds"], key=lambda s: float(stars[s]["mag"]))[:3]
            for sid in picks:
                _, g, alt_a, az_a, sep = rowmap[sid]
                name = stars[sid]["proper"] or f"{stars[sid]['bayer']} {stars[sid]['con']}"
                lines.append(f"| {c['nameKo']} | {name} ({stars[sid]['hip']}) | {g['altitudeDeg']:+.2f}° | {g['azimuthDeg']:.2f}° | {alt_a:+.2f}° | {az_a:.2f}° | {sep:.3f}° |")
        lines.append("")

    lines.append("## 미검증 항목")
    lines.append("")
    lines.append("- Stellarium 등 GUI 천문 프로그램과의 화면 대조는 이 환경에서 수행하지 못했다. 아래 절차로 사용자가 확인할 수 있다.")
    lines.append("  1. Stellarium 을 열고 위치를 위도 36.9°N, 경도 128.73°E, 고도 0 m 로 설정한다 (F6).")
    lines.append("  2. 날짜·시각을 2026-11-04 20:00 (UTC+9) 로 맞춘다 (F5). '다음 날 0시'는 2026-11-05 00:00.")
    lines.append("  3. 대기 굴절을 끄거나(F4 → 조망 → 대기 끄기) 고도 15° 이상 별만 비교한다.")
    lines.append("  4. 별을 클릭해 표시되는 방위각/고도(Az/Alt) 를 위 표와 비교한다. 1° 이내면 통과.")
    lines.append("- 실제 행사장 좌표가 확정되면 `data/event-config.json` 을 수정하고 `python3 scripts/generate-sky-data.py && python3 scripts/verify-sky-data.py` 를 다시 실행한다.")
    lines.append("")

    report = Path(args.report)
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text("\n".join(lines), "utf-8")
    print(f"대조 {total}건, 초과 {failures}건, 최대 차이 {worst:.4f}° → {'통과' if failures == 0 else '실패'}; 보고서: {report.relative_to(ROOT)}")
    sys.exit(0 if failures == 0 else 1)


if __name__ == "__main__":
    main()
