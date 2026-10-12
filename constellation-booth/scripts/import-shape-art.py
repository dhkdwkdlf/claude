#!/usr/bin/env python3
"""생성된 별자리 선화(모양 씌우기)를 앱에 넣는다.

사용법:
    python3 scripts/import-shape-art.py <입력 폴더> [--only pegasus,orion] [--opacity 0.9]

입력: <입력 폴더>/<id>.png (또는 .webp/.jpg). scripts/shape-refs 의 참고 이미지(1024×1024, 별·선 배치) 위에
      그린 선화. 배경이 남색/흰색/투명 어느 것이든 된다.
처리: 1) 배경색을 모서리에서 추정해 투명하게 만든다 (투명 PNG 면 그대로)
      2) 선 색을 아이보리(#F7FAFF)로 통일한다 (밝기만 알파로 사용)
      3) 1024×1024 WebP(알파) 로 저장: apps/sky/public/shapes/<id>.webp
      4) data/shape-placements.json 에 기준 프레임 전체(0,0,1000,1000) 배치를 기록한다.
         참고 이미지와 같은 캔버스에 그렸다면 이 배치로 별 위치에 맞는다. 미세 조정은 JSON 의 x/y/width/height 수정.
"""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "apps" / "sky" / "public" / "shapes"
PLACEMENTS = ROOT / "data" / "shape-placements.json"
IVORY = (247, 250, 255)


def estimate_bg(im: Image.Image) -> tuple[int, int, int]:
    w, h = im.size
    pts = [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3), (w // 2, 2), (2, h // 2)]
    cols = [im.getpixel(p)[:3] for p in pts]
    return tuple(sum(c[i] for c in cols) // len(cols) for i in range(3))


def to_overlay(src: Image.Image) -> Image.Image:
    """선만 남긴 RGBA (아이보리 선 + 알파)"""
    src = src.convert("RGBA")
    has_alpha = src.getextrema()[3][0] < 255
    if has_alpha:
        alpha = src.getchannel("A")
    else:
        rgb = src.convert("RGB")
        bg = estimate_bg(rgb)
        # 배경과의 색 거리 → 알파. 어두운 배경(남색)이면 밝은 선, 밝은 배경이면 어두운 선
        px = rgb.load()
        w, h = rgb.size
        alpha = Image.new("L", (w, h), 0)
        ap = alpha.load()
        for y in range(h):
            for x in range(w):
                r, g, b = px[x, y]
                d = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
                ap[x, y] = 255 if d > 150 else max(0, min(255, int((d - 40) * 255 / 110)))
    # 선 색은 아이보리로 통일
    out = Image.new("RGBA", src.size, IVORY + (0,))
    out.putalpha(alpha.filter(ImageFilter.GaussianBlur(0.4)))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--only", default="")
    ap.add_argument("--opacity", type=float, default=0.9)
    args = ap.parse_args()
    src = Path(args.src)
    OUT.mkdir(parents=True, exist_ok=True)
    doc = json.loads(PLACEMENTS.read_text("utf-8"))
    ids = [s for s in args.only.split(",") if s]
    files = sorted(p for p in src.iterdir() if p.suffix.lower() in (".png", ".webp", ".jpg", ".jpeg"))
    done = 0
    for f in files:
        cid = f.stem.replace("-stars", "")
        if ids and cid not in ids:
            continue
        if f.stem.endswith("-stars"):
            continue  # 참고 이미지는 건너뜀
        im = Image.open(f)
        if im.size != (1024, 1024):
            im = im.resize((1024, 1024), Image.LANCZOS)
        overlay = to_overlay(im)
        target = OUT / f"{cid}.webp"
        overlay.save(target, "WEBP", quality=90, method=6, lossless=False)
        doc["placements"][cid] = {"asset": f"shapes/{cid}.webp", "x": 0, "y": 0, "width": 1000, "height": 1000, "opacity": args.opacity}
        print(f"{cid:12} → {target.relative_to(ROOT)} ({target.stat().st_size // 1024} KB)")
        done += 1
    PLACEMENTS.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"{done}개 반영. 미세 조정은 data/shape-placements.json 에서.")


if __name__ == "__main__":
    main()
