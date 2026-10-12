#!/usr/bin/env python3
"""HYG 별 데이터베이스에서 앱 2에 필요한 별만 추출해 scripts/catalog/stars.csv 로 저장한다.

사용법:
    python3 scripts/extract-stars.py <hyg_v38.csv.gz 경로>

- 입력: HYG Database v3.8 (https://github.com/astronexus/HYG-Database, CC BY-SA 2.5)
  Hipparcos·Yale BSC·Gliese 를 합친 공개 별 목록. 좌표는 ICRS/J2000, epoch 2000.0.
- 출력 컬럼: hip, bayer, flam, con, proper, ra_deg, dec_deg, pmra_mas_yr, pmdec_mas_yr, mag
- 추출 대상 HIP 번호는 data/constellations.json 의 starIds 에서 읽는다.
"""
import csv
import gzip
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "scripts" / "catalog" / "stars.csv"


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    src = Path(sys.argv[1])
    cons = json.loads((ROOT / "data" / "constellations.json").read_text("utf-8"))
    wanted: set[int] = set()
    for c in cons["constellations"]:
        for sid in c["starIds"]:
            wanted.add(int(sid.removeprefix("hip")))
    rows = {}
    opener = gzip.open if src.suffix == ".gz" else open
    with opener(src, "rt", encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            if not r["hip"]:
                continue
            hip = int(float(r["hip"]))
            if hip in wanted:
                # HYG v3: ra 는 시간(hours), dec 는 도(deg); pmra/pmdec 는 mas/yr
                rows[hip] = {
                    "hip": hip,
                    "bayer": r["bayer"],
                    "flam": r["flam"],
                    "con": r["con"],
                    "proper": r["proper"],
                    "ra_deg": f"{float(r['ra']) * 15.0:.6f}",
                    "dec_deg": f"{float(r['dec']):.6f}",
                    "pmra_mas_yr": r["pmra"],
                    "pmdec_mas_yr": r["pmdec"],
                    "mag": r["mag"],
                }
    missing = sorted(wanted - set(rows))
    if missing:
        print("경고: HYG 에서 찾지 못한 HIP:", missing)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(next(iter(rows.values())).keys()))
        w.writeheader()
        for hip in sorted(rows):
            w.writerow(rows[hip])
    print(f"{len(rows)}개 별을 {OUT.relative_to(ROOT)} 에 저장했습니다.")


if __name__ == "__main__":
    main()
