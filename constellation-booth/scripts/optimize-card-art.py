#!/usr/bin/env python3
"""생성된 카드 일러스트 원본(PNG)을 검수 후 앱용 WebP 로 변환한다.

사용법:
    python3 scripts/optimize-card-art.py <원본 폴더> [--width 900] [--quality 82]

- 12장 모두 같은 크기(기본 900×1350, 2:3)로 맞추고 가장자리 배경색을 카드 남색(#142543)으로 통일한다.
- 출력: apps/fortune/public/art/<id>.webp
"""
import argparse
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "apps" / "fortune" / "public" / "art"
IDS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]
NAVY = (20, 37, 67)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--width", type=int, default=900)
    ap.add_argument("--quality", type=int, default=82)
    args = ap.parse_args()
    src = Path(args.src)
    OUT.mkdir(parents=True, exist_ok=True)
    w = args.width
    h = int(w * 1.5)
    total = 0
    for zid in IDS:
        im = Image.open(src / f"{zid}.png").convert("RGB")
        # 모서리 4곳의 평균색이 남색에서 크게 벗어나면 보고 (배경 통일 검수)
        corners = [im.getpixel((2, 2)), im.getpixel((im.width - 3, 2)), im.getpixel((2, im.height - 3)), im.getpixel((im.width - 3, im.height - 3))]
        drift = max(sum(abs(c[i] - NAVY[i]) for i in range(3)) for c in corners)
        im = im.resize((w, h), Image.LANCZOS)
        # 가장자리 1.5% 를 남색으로 부드럽게 섞어 카드 안에서 경계가 보이지 않게 한다.
        bg = Image.new("RGB", (w, h), NAVY)
        mask = Image.new("L", (w, h), 0)
        m = int(w * 0.015)
        mask.paste(255, (m, m, w - m, h - m))
        mask = mask.filter(__import__("PIL.ImageFilter", fromlist=["GaussianBlur"]).GaussianBlur(m))
        im = Image.composite(im, bg, mask)
        out = OUT / f"{zid}.webp"
        im.save(out, "WEBP", quality=args.quality, method=6)
        size = out.stat().st_size
        total += size
        print(f"{zid:12} {size // 1024:4d} KB  배경 편차 {drift:3d}")
    print(f"합계 {total // 1024} KB")


if __name__ == "__main__":
    main()
