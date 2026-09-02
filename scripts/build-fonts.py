#!/usr/bin/env python3
"""
build-fonts.py — TTF/OTF → WOFF2 + 한글 서브셋 변환
KS X 1001 완성형 2,350자 + ASCII + 문장부호
재실행 가능: docs/fonts-src/*.ttf|otf → frontend/public/fonts/*.woff2
"""
import subprocess, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "docs" / "fonts-src"
OUT_DIR = ROOT / "frontend" / "public" / "fonts"

# 소스 → 출력 파일명 매핑
FONTS = {
    "NanumBrush.ttf":           "nanum-brush.woff2",
    "나눔손글씨 비상체.ttf":      "nanum-bisang.woff2",
    "나눔손글씨 부장님 눈치체.ttf": "nanum-nunchi.woff2",
    "chab.otf":                 "chab.woff2",
    "정선아리랑뿌리체OTF.otf":    "jeongseon.woff2",
    "Recipekorea 레코체 FONT.otf": "recipekorea.woff2",
    "BMJUA_ttf.ttf":            "bmjua.woff2",
}

def _build_unicodes():
    """KS X 1001 완성형 2,350자 + ASCII + 문장부호 (정확한 코드포인트)"""
    sys.path.insert(0, str(ROOT / "scripts"))
    from ksx1001_chars import get_unicode_points
    return get_unicode_points()

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    unicodes = _build_unicodes()
    results = []

    for src_name, out_name in FONTS.items():
        src_path = SRC_DIR / src_name
        out_path = OUT_DIR / out_name

        if not src_path.exists():
            print(f"  SKIP  {src_name} (not found)")
            continue

        src_size = src_path.stat().st_size
        cmd = [
            sys.executable, "-m", "fontTools.subset",
            str(src_path),
            f"--output-file={out_path}",
            "--flavor=woff2",
            f"--unicodes={unicodes}",
            "--layout-features=*",
            "--no-hinting",
            "--desubroutinize",
        ]
        print(f"  CONV  {src_name} ({src_size/1024:.0f} KB) → {out_name}")
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"  FAIL  {result.stderr.strip()}")
            continue

        out_size = out_path.stat().st_size
        ratio = out_size / src_size * 100
        status = "OK" if out_size <= 300 * 1024 else "OVER 300KB"
        results.append((out_name, src_size, out_size, status))
        print(f"        → {out_size/1024:.0f} KB ({ratio:.0f}%) [{status}]")

    print("\n=== 변환 결과 ===")
    print(f"{'파일':<25} {'원본':>10} {'woff2':>10} {'비율':>6}  상태")
    print("-" * 65)
    for name, src_s, out_s, status in results:
        print(f"{name:<25} {src_s/1024:>8.0f}KB {out_s/1024:>8.0f}KB {out_s/src_s*100:>5.0f}%  {status}")

if __name__ == "__main__":
    main()
