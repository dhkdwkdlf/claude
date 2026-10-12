#!/usr/bin/env python3
"""앱에 번들할 한글 글꼴 서브셋(woff2)을 만든다.

사용법:
    python3 scripts/build-fonts.py <글꼴 원본 폴더>

원본 폴더에 아래 파일이 있어야 한다 (Google Fonts 저장소, SIL OFL 1.1):
    NotoSansKR-VF.ttf            https://github.com/google/fonts/tree/main/ofl/notosanskr
    GowunBatang-Regular.ttf      https://github.com/google/fonts/tree/main/ofl/gowunbatang
    GowunBatang-Bold.ttf

출력: shared/fonts/*.subset.woff2
서브셋 범위: KS X 1001 한글 2,350자 + 기본 라틴·문장부호·°·· 등. 앱 문구와 데이터 전체를 덮는다.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "shared" / "fonts"


def unicode_set() -> list[str]:
    cps: set[int] = set()
    for cp in range(0xAC00, 0xD7A4):  # 한글 음절 중 KS X 1001 수록 2,350자
        try:
            chr(cp).encode("euc_kr")
            cps.add(cp)
        except UnicodeEncodeError:
            pass
    cps.update(range(0x20, 0x7F))        # 기본 라틴
    cps.update(range(0xA0, 0x100))       # 라틴-1 보충 (°, ·, ×, ÷ 등)
    cps.update(range(0x2010, 0x2027))    # 대시·따옴표·점·말줄임
    cps.update([0x2030, 0x2032, 0x2033, 0x203B, 0x2190, 0x2191, 0x2192, 0x2193, 0x2194])
    cps.update([0x2022, 0x2026, 0x2605, 0x2606, 0x2715, 0x2713, 0x3000, 0x3001, 0x3002, 0x300C, 0x300D, 0x300E, 0x300F, 0x3131, 0x3134, 0x3137, 0x3139, 0x3141, 0x3142, 0x3145, 0x3147, 0x3148, 0x314A, 0x314B, 0x314C, 0x314D, 0x314E, 0x314F, 0x3151, 0x3153, 0x3155, 0x3157, 0x315B, 0x315C, 0x3160, 0x3161, 0x3163, 0xFF5E])
    return [f"U+{cp:04X}" for cp in sorted(cps)]


def run(cmd: list[str]) -> None:
    print("$", " ".join(cmd))
    subprocess.run(cmd, check=True)


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    src = Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmpd = Path(tmp)
        unicodes = tmpd / "unicodes.txt"
        unicodes.write_text("\n".join(unicode_set()), "utf-8")

        # 가변 글꼴을 400/700 고정 인스턴스로 만든다.
        instances = []
        for weight, name in ((400, "Regular"), (700, "Bold")):
            inst = tmpd / f"NotoSansKR-{name}.ttf"
            run([sys.executable, "-m", "fontTools.varLib.instancer", str(src / "NotoSansKR-VF.ttf"), f"wght={weight}", "-o", str(inst), "-q"])
            instances.append((inst, f"NotoSansKR-{name}"))
        instances.append((src / "GowunBatang-Regular.ttf", "GowunBatang-Regular"))
        instances.append((src / "GowunBatang-Bold.ttf", "GowunBatang-Bold"))

        for path, name in instances:
            out = OUT / f"{name}.subset.woff2"
            run([
                sys.executable, "-m", "fontTools.subset", str(path),
                f"--unicodes-file={unicodes}", "--flavor=woff2", "--layout-features=*",
                "--no-hinting", "--desubroutinize", f"--output-file={out}",
            ])
            print(f"  → {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
