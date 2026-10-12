#!/usr/bin/env python3
"""앱 1 카드용 12별자리 일러스트를 OpenAI 이미지 API로 생성한다.

사용법:
    OPENAI_API_KEY=... python3 scripts/generate-card-art.py [--only aries,leo] [--model gpt-image-2] [--out DIR]

- API 키는 환경변수로만 받는다. 저장소에 키를 넣지 않는다.
- 결과는 scripts/art-raw/<id>.png (원본) 에 저장하고, 검수 후 scripts/optimize-card-art.py 로
  apps/fortune/public/art/<id>.webp 로 변환한다.
- 12장 모두 같은 스타일 문구(STYLE)를 공유해 선 굵기·여백·색 수를 통일한다.
"""
import argparse
import base64
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "scripts" / "art-raw"

STYLE = (
    "Refined minimalist line-art illustration for a children's astronomy booth card. "
    "Subject drawn with a single continuous, even-weight, hand-inked ivory line (#F7FAFF) "
    "with a few delicate interior lines; subtle soft lavender-blue (#DCE8F8) tint fills in two or three areas only; "
    "a small cluster of 5-7 tiny four-pointed gold stars (#F2D79B) placed near the subject like a constellation. "
    "Flat, solid deep-navy background (#142543) with no texture, no vignette and no gradient. "
    "Centered subject with generous empty margins (subject occupies about 60% of the canvas). "
    "Flat vector look, no neon glow, no outlines around the stars, no text, no letters, no numbers, "
    "no frame, no border, no zodiac glyph symbols, no photo realism, calm and elegant mood."
)

SUBJECTS = {
    "aries": "a ram's head and shoulders in profile with softly spiraling horns, gentle eyes, serene expression",
    "taurus": "a bull's head and shoulders facing slightly left with sturdy curved horns, calm dignified expression",
    "gemini": "two youthful faces in profile facing each other, mirrored, with flowing hair meeting in the middle",
    "cancer": "a crab with a rounded shell and two raised claws, drawn with soft round strokes, friendly",
    "leo": "a lion's head with a flowing mane in profile, noble and gentle",
    "virgo": "a young woman in profile holding a sheaf of wheat, long hair, graceful",
    "libra": "a balanced hanging scale with two shallow pans suspended from a slender beam, perfectly level",
    "scorpio": "a scorpion with a curved tail arching over its back and raised pincers, elegant curves",
    "sagittarius": "a drawn bow with an arrow nocked and ready, held by a hand and forearm, pointing up-right",
    "capricorn": "a sea-goat: a goat's head and front legs that flow into a curling fish tail",
    "aquarius": "a tilted water vessel pouring a graceful stream of water that flows in a wave below it",
    "pisces": "two fish swimming in a gentle circle, nose to tail, connected by a thin flowing ribbon",
}


def generate(api_key: str, model: str, prompt: str, size: str, quality: str) -> bytes:
    body = {
        "model": model,
        "prompt": prompt,
        "size": size,
        "quality": quality,
        "output_format": "png",
        "n": 1,
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/images/generations",
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return base64.b64decode(data["data"][0]["b64_json"])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--model", default="gpt-image-2")
    ap.add_argument("--size", default="1024x1536")
    ap.add_argument("--out", default=str(RAW_DIR))
    ap.add_argument("--suffix", default="")
    ap.add_argument("--quality", default="high")
    args = ap.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        print("OPENAI_API_KEY 환경변수가 필요합니다.", file=sys.stderr)
        sys.exit(2)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    ids = [s for s in args.only.split(",") if s] or list(SUBJECTS)
    failed: list[str] = []
    for zid in ids:
        prompt = f"{SUBJECTS[zid]}. {STYLE}"
        target = out / f"{zid}{args.suffix}.png"
        print(f"[{zid}] 생성 중 ({args.model}, {args.size}) ...", flush=True)
        for attempt in range(6):
            try:
                png = generate(api_key, args.model, prompt, args.size, args.quality)
                target.write_bytes(png)
                print(f"[{zid}] 저장: {target} ({len(png) // 1024} KB)", flush=True)
                break
            except Exception as exc:  # noqa: BLE001
                # 429(요청 제한) 등은 간격을 늘려 재시도한다.
                wait = 20 * (attempt + 1)
                print(f"[{zid}] 실패({attempt + 1}/6): {exc} → {wait}초 뒤 재시도", flush=True)
                time.sleep(wait)
        else:
            print(f"[{zid}] 생성을 포기합니다. 나중에 --only {zid} 로 다시 실행하세요.", flush=True)
            failed.append(zid)
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
