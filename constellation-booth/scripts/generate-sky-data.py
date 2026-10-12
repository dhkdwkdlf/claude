#!/usr/bin/env python3
"""행사일·관측 지역 기준 시간별 별 위치 데이터를 생성한다 (Skyfield).

사용법:
    python3 scripts/generate-sky-data.py            # data/event-config.json 기준으로 생성
    python3 scripts/generate-sky-data.py --check    # 생성 결과가 현재 설정과 일치하는지만 확인

입력:
    data/event-config.json       행사일, 시간대, 관측 지역(위도·경도·고도), 시간 슬롯
    data/constellations.json     별자리 정의(별 ID, 필수 별, 연결선)
    scripts/catalog/stars.csv    HYG v3.8 에서 추출한 별 좌표 (ICRS/J2000, epoch 2000.0, 고유운동 mas/yr)
출력:
    data/sky-slots.json              시간 슬롯별 별 방위각·고도, 가시 별자리, 설명용 방향·높이
    data/constellation-frames.json   모양 오버레이용 정규화 좌표(적도좌표 심사투영, 북쪽 위·동쪽 왼쪽)
    data/sky-data-metadata.json      생성 시각, 도구 버전, 좌표 기준, 보정 방법, 박명 시각, 설정 해시

계산 방법:
    - 별: ICRS/J2000 좌표 + 고유운동 → 관측 시각 기준 → 지심 관측 → 겉보기 위치(광행차·중력 편향 적용)
      → 관측 지점 기준 방위각·고도. 대기 굴절은 적용하지 않는다(고도 15° 이상에서 0.06° 미만).
    - 방위각은 북쪽 0°, 동쪽 90°, 남쪽 180°, 서쪽 270°.
    - 시각: KST(UTC+9) 로컬 시각 → UTC. '다음 날 0시'는 행사 다음 날 00:00 KST 로 계산한다.
    - 태양·달: DE421 (skyfield-data 번들) 로 계산. 태양 고도로 박명 여부를 판정한다.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CATALOG = ROOT / "scripts" / "catalog" / "stars.csv"

DIRECTIONS_16 = ["북", "북북동", "북동", "동북동", "동", "동남동", "남동", "남남동",
                 "남", "남남서", "남서", "서남서", "서", "서북서", "북서", "북북서"]


def direction_ko(az: float) -> str:
    idx = int(((az % 360) + 11.25) // 22.5) % 16
    return DIRECTIONS_16[idx]


def height_ko(alt: float) -> str:
    if alt >= 70:
        return "거의 머리 위"
    if alt >= 45:
        return "높이"
    if alt >= 25:
        return "중간 높이"
    if alt >= 15:
        return "조금 낮게"
    if alt > 0:
        return "지평선 가까이"
    return "지평선 아래"


def where_ko(alt: float, az: float) -> str:
    """참가자용 위치 문장. 예: '남서쪽 하늘에 높이 떠 있어요'"""
    d = direction_ko(az)
    if alt >= 70:
        return "거의 머리 위에 떠 있어요"
    if alt >= 45:
        return f"{d}쪽 하늘에 높이 떠 있어요"
    if alt >= 25:
        return f"{d}쪽 하늘 중간 높이에 떠 있어요"
    if alt >= 15:
        return f"{d}쪽 하늘에 조금 낮게 떠 있어요"
    if alt > 0:
        return f"{d}쪽 지평선 가까이에 있어요"
    return "지평선 아래에 있어요"


def config_fingerprint(cfg: dict) -> str:
    key = {
        "eventDate": cfg["eventDate"],
        "timeZone": cfg["timeZone"],
        "utcOffsetMinutes": cfg["utcOffsetMinutes"],
        "location": {k: cfg["location"][k] for k in ("latitude", "longitude", "elevationM")},
        "slots": [{k: s[k] for k in ("id", "localTime", "localDate")} for s in cfg["slots"]],
        "quizMinAltitudeDeg": cfg["visibility"]["quizMinAltitudeDeg"],
    }
    return hashlib.sha256(json.dumps(key, sort_keys=True).encode("utf-8")).hexdigest()[:16]


def load_stars() -> dict[str, dict]:
    stars = {}
    with CATALOG.open(encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            stars[f"hip{r['hip']}"] = {
                "hip": int(r["hip"]),
                "ra_deg": float(r["ra_deg"]),
                "dec_deg": float(r["dec_deg"]),
                "pmra": float(r["pmra_mas_yr"] or 0),
                "pmdec": float(r["pmdec_mas_yr"] or 0),
                "mag": float(r["mag"]),
                "name": r["proper"],
                "bayer": r["bayer"],
                "con": r["con"],
            }
    return stars


def unit(alt: float, az: float) -> tuple[float, float, float]:
    a, z = math.radians(alt), math.radians(az)
    return (math.cos(a) * math.cos(z), math.cos(a) * math.sin(z), math.sin(a))


def mean_altaz(points: list[tuple[float, float]]) -> tuple[float, float]:
    x = y = z = 0.0
    for alt, az in points:
        ux, uy, uz = unit(alt, az)
        x += ux
        y += uy
        z += uz
    n = len(points)
    x, y, z = x / n, y / n, z / n
    alt = math.degrees(math.atan2(z, math.hypot(x, y)))
    az = math.degrees(math.atan2(y, x)) % 360
    return alt, az


def gnomonic(ra_deg: float, dec_deg: float, ra0: float, dec0: float) -> tuple[float, float]:
    """적도좌표 심사(gnomonic) 투영. 반환: (xi 동쪽+, eta 북쪽+) 단위 라디안."""
    ra, dec, a0, d0 = map(math.radians, (ra_deg, dec_deg, ra0, dec0))
    cosc = math.sin(d0) * math.sin(dec) + math.cos(d0) * math.cos(dec) * math.cos(ra - a0)
    xi = math.cos(dec) * math.sin(ra - a0) / cosc
    eta = (math.cos(d0) * math.sin(dec) - math.sin(d0) * math.cos(dec) * math.cos(ra - a0)) / cosc
    return xi, eta


def build_frames(cons: list[dict], stars: dict[str, dict]) -> dict:
    """모양 오버레이 기준 프레임: 북쪽 위, 동쪽 왼쪽(하늘을 올려다본 방향), 1000×1000 상자."""
    frames = {}
    for c in cons:
        req = c["requiredStarIds"]
        # 중심: 필수 별의 단위벡터 평균
        x = y = z = 0.0
        for sid in req:
            s = stars[sid]
            ra, dec = math.radians(s["ra_deg"]), math.radians(s["dec_deg"])
            x += math.cos(dec) * math.cos(ra)
            y += math.cos(dec) * math.sin(ra)
            z += math.sin(dec)
        ra0 = math.degrees(math.atan2(y, x)) % 360
        dec0 = math.degrees(math.atan2(z, math.hypot(x, y)))
        pts = {}
        for sid in c["starIds"]:
            s = stars[sid]
            xi, eta = gnomonic(s["ra_deg"], s["dec_deg"], ra0, dec0)
            pts[sid] = (-xi, -eta)  # 동쪽을 왼쪽으로, 북쪽을 위로(화면 y 아래 증가)
        xs = [p[0] for p in pts.values()]
        ys = [p[1] for p in pts.values()]
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        extent = max(max(xs) - min(xs), max(ys) - min(ys)) or 1.0
        scale = 760.0 / extent
        frames[c["id"]] = {
            "centerRaDeg": round(ra0, 4),
            "centerDecDeg": round(dec0, 4),
            "viewBox": [0, 0, 1000, 1000],
            "unitsPerRadian": round(scale, 3),
            "stars": {sid: [round(500 + (p[0] - cx) * scale, 1), round(500 + (p[1] - cy) * scale, 1)] for sid, p in pts.items()},
        }
    return frames


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    cfg = json.loads((DATA / "event-config.json").read_text("utf-8"))
    cons_doc = json.loads((DATA / "constellations.json").read_text("utf-8"))
    cons = cons_doc["constellations"]
    fingerprint = config_fingerprint(cfg)

    if args.check:
        meta_path = DATA / "sky-data-metadata.json"
        if not meta_path.exists():
            print("sky-data-metadata.json 이 없습니다. 먼저 생성하세요.")
            sys.exit(1)
        meta = json.loads(meta_path.read_text("utf-8"))
        ok = meta.get("configFingerprint") == fingerprint
        print("설정 일치" if ok else "설정 불일치: 데이터를 다시 생성해야 합니다.")
        sys.exit(0 if ok else 1)

    from skyfield import VERSION as SKYFIELD_VERSION
    from skyfield.api import Loader, Star, wgs84
    from skyfield import almanac
    import skyfield_data

    load = Loader(skyfield_data.get_skyfield_data_path(), expire=False, verbose=False)
    ts = load.timescale(builtin=True)
    eph = load("de421.bsp")
    earth, sun, moon = eph["earth"], eph["sun"], eph["moon"]
    loc = cfg["location"]
    site = wgs84.latlon(loc["latitude"], loc["longitude"], elevation_m=loc["elevationM"])
    observer = earth + site

    stars = load_stars()
    min_alt = cfg["visibility"]["quizMinAltitudeDeg"]
    tz = timezone(timedelta(minutes=cfg["utcOffsetMinutes"]))

    star_objs = {
        sid: Star(ra_hours=s["ra_deg"] / 15.0, dec_degrees=s["dec_deg"],
                  ra_mas_per_year=s["pmra"], dec_mas_per_year=s["pmdec"], epoch=ts.J(2000.0))
        for sid, s in stars.items()
    }

    slots_out = []
    for slot in cfg["slots"]:
        local_dt = datetime.fromisoformat(f"{slot['localDate']}T{slot['localTime']}:00").replace(tzinfo=tz)
        t = ts.from_datetime(local_dt)
        obs = observer.at(t)
        sun_alt = obs.observe(sun).apparent().altaz()[0].degrees
        moon_alt, moon_az, _ = obs.observe(moon).apparent().altaz()
        moon_frac = almanac.fraction_illuminated(eph, "moon", t)

        star_rows = []
        altaz = {}
        for sid, so in star_objs.items():
            alt, az, _ = obs.observe(so).apparent().altaz()
            altaz[sid] = (alt.degrees, az.degrees)
            star_rows.append({
                "id": sid,
                "altitudeDeg": round(alt.degrees, 3),
                "azimuthDeg": round(az.degrees % 360, 3),
                "magnitude": stars[sid]["mag"],
            })

        visible, near, hidden, views = [], [], [], {}
        for c in cons:
            req_alts = [altaz[sid][0] for sid in c["requiredStarIds"]]
            lowest = min(req_alts)
            calt, caz = mean_altaz([altaz[sid] for sid in c["requiredStarIds"]])
            if lowest >= min_alt:
                status = "visible"
                visible.append(c["id"])
            elif lowest > 0:
                status = "nearHorizon"
                near.append(c["id"])
            else:
                status = "belowHorizon"
                hidden.append(c["id"])
            views[c["id"]] = {
                "status": status,
                "centerAltitudeDeg": round(calt, 2),
                "centerAzimuthDeg": round(caz, 2),
                "lowestRequiredAltitudeDeg": round(lowest, 2),
                "directionKo": direction_ko(caz),
                "heightKo": height_ko(calt),
                "whereKo": where_ko(calt, caz),
            }

        if sun_alt > -6:
            twilight = "civil"
            twilight_ko = "해가 진 직후라 아직 하늘이 밝아요. 밝은 별부터 보여요."
        elif sun_alt > -12:
            twilight = "nautical"
            twilight_ko = "하늘이 어두워지는 중이에요. 밝은 별부터 차례로 나타나요."
        elif sun_alt > -18:
            twilight = "astronomical"
            twilight_ko = "거의 어두워졌어요. 조금 더 지나면 희미한 별도 보여요."
        else:
            twilight = "night"
            twilight_ko = "완전히 어두운 밤하늘이에요."

        slots_out.append({
            "id": slot["id"],
            "labelKo": slot["labelKo"],
            "localISO": local_dt.isoformat(),
            "utcISO": local_dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "isNextDay": slot["localDate"] != cfg["eventDate"],
            "sunAltitudeDeg": round(sun_alt, 2),
            "twilight": twilight,
            "twilightKo": twilight_ko,
            "moon": {
                "altitudeDeg": round(moon_alt.degrees, 2),
                "azimuthDeg": round(moon_az.degrees % 360, 2),
                "fractionIlluminated": round(float(moon_frac), 3),
            },
            "stars": star_rows,
            "visibleConstellationIds": visible,
            "nearHorizonConstellationIds": near,
            "belowHorizonConstellationIds": hidden,
            "quizEligibleConstellationIds": list(visible),
            "constellationViews": views,
        })

    # 박명 시각 (행사일 정오 ~ 다음 날 정오)
    t0 = ts.from_datetime(datetime.fromisoformat(f"{cfg['eventDate']}T12:00:00").replace(tzinfo=tz))
    t1 = ts.from_datetime(datetime.fromisoformat(f"{cfg['eventDate']}T12:00:00").replace(tzinfo=tz) + timedelta(days=1))
    times, events = almanac.find_discrete(t0, t1, almanac.dark_twilight_day(eph, site))
    names = {0: "astronomicalTwilightEnd", 1: "nauticalTwilightEnd", 2: "civilTwilightEnd", 3: "sunset"}
    twilight_times = {}
    prev = int(almanac.dark_twilight_day(eph, site)(t0))
    for ti, ev in zip(times, events):
        ev = int(ev)
        if ev < prev:
            # 어두워지는 방향의 전이
            twilight_times[names[ev]] = ti.astimezone(tz).isoformat(timespec="minutes")
        prev = ev

    now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    meta = {
        "generatedAt": now,
        "configFingerprint": fingerprint,
        "eventDate": cfg["eventDate"],
        "timeZone": cfg["timeZone"],
        "location": loc,
        "slots": [{"id": s["id"], "localISO": s["localISO"], "utcISO": s["utcISO"]} for s in slots_out],
        "tools": {
            "skyfield": SKYFIELD_VERSION if isinstance(SKYFIELD_VERSION, str) else ".".join(map(str, SKYFIELD_VERSION)),
            "ephemeris": "DE421 (skyfield-data 7.0.0 번들)",
            "timescale": "Skyfield builtin (내장 윤초·ΔT 표)",
        },
        "catalog": {
            "name": "HYG Database v3.8 (hyg_v38.csv.gz)",
            "url": "https://github.com/astronexus/HYG-Database",
            "license": "CC BY-SA 2.5",
            "coordinateSystem": "ICRS (J2000 적도좌표), epoch 2000.0",
            "properMotion": "mas/yr (RA 성분은 cos δ 포함, Hipparcos 규약)",
            "extractedFile": "scripts/catalog/stars.csv",
            "starCount": len(stars),
        },
        "method": {
            "position": "observer.at(t).observe(star).apparent().altaz() — 지심 관측 후 광행차·중력 편향 적용한 겉보기 위치",
            "refraction": "적용하지 않음 (고도 15° 이상에서 0.06° 미만)",
            "azimuthConvention": "북 0°, 동 90°, 남 180°, 서 270°",
            "visibility": f"대표 도형의 필수 별이 모두 고도 {min_alt}° 이상이면 표시·출제 후보, 0°~{min_alt}° 는 '지평선 가까이', 0° 미만은 제외",
        },
        "twilight": twilight_times,
        "lineFigureSource": cons_doc["lineFigureSource"],
    }

    (DATA / "sky-slots.json").write_text(json.dumps({"configFingerprint": fingerprint, "slots": slots_out}, ensure_ascii=False, indent=1), "utf-8")
    (DATA / "constellation-frames.json").write_text(json.dumps({"configFingerprint": fingerprint, "frames": build_frames(cons, stars)}, ensure_ascii=False, indent=1), "utf-8")
    (DATA / "sky-data-metadata.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), "utf-8")

    print(f"생성 완료: {len(slots_out)}개 시간 슬롯, {len(stars)}개 별, 설정 지문 {fingerprint}")
    for s in slots_out:
        print(f"  {s['id']} {s['localISO']} 태양고도 {s['sunAltitudeDeg']:+.1f}° ({s['twilight']}) "
              f"달 {s['moon']['altitudeDeg']:+.1f}° 조도 {s['moon']['fractionIlluminated']:.2f}")
        print(f"     표시: {', '.join(s['visibleConstellationIds'])}")
        print(f"     지평선 가까이: {', '.join(s['nearHorizonConstellationIds']) or '-'}")
    print("박명:", twilight_times)


if __name__ == "__main__":
    main()
