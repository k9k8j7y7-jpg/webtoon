"""scratch/detail3/generate.py — 상세페이지 scratch 3차: 템플릿·장치·레이아웃 지시 전부 제거.

입력 = 제품 사진 + korean_webtoon 스타일 문구 + 요청문(+본문 전문)만.
3장: ① 그대로 ② +주인공 여성 캐릭터(첨부 시트) ③ +캐릭터 없이 제품과 인포그래픽만.
본문 전문은 scratch/detail3/body.txt (도도 기획안 원문 그대로, 첫 줄 = 제목).
운영 코드·DB 변경 없음.

사용법 (WEBTOON 루트): backend/venv/Scripts/python scratch/detail3/generate.py
"""

import asyncio
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))
if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

from dotenv import load_dotenv  # noqa: E402
load_dotenv(BACKEND / ".env")

from PIL import Image, ImageDraw, ImageFont  # noqa: E402
from io import BytesIO  # noqa: E402
from app.adapters.openai_image import get_openai_image_adapter  # noqa: E402
from app.styles.models import STYLE_PRESETS  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
OUT.mkdir(parents=True, exist_ok=True)
D1 = ROOT / "scratch" / "detail"

BODY = (HERE / "body.txt").read_text(encoding="utf-8").strip()
STYLE = STYLE_PRESETS["korean_webtoon"]["prompt"]

REQUEST = (
    "다음 내용을 한국 웹툰 스타일의 상품 상세페이지 한 섹션(세로 2:3)으로 디자인해줘. "
    "제목·본문·포인트를 그림 안에 상세페이지답게 레이아웃하고, 한글은 정확히 그대로 쓰고, "
    "그 외 글자는 넣지 마. 제품은 첨부 사진과 똑같이."
)
VARIANTS = [
    ("v1_plain", "", False),
    ("v2_char", "주인공 여성 캐릭터(첨부 시트)가 등장", True),
    ("v3_nochar", "캐릭터 없이 제품과 인포그래픽만", False),
]


def build_prompt(extra: str) -> str:
    parts = [f"Style: {STYLE}", REQUEST]
    if extra:
        parts.append(extra)
    parts.append(BODY)
    return "\n\n".join(parts)


def to_png_white(b: bytes, max_side=768) -> bytes:
    im = Image.open(BytesIO(b))
    if im.mode == "RGBA":
        bg = Image.new("RGB", im.size, (255, 255, 255)); bg.paste(im, mask=im.split()[3]); im = bg
    im = im.convert("RGB")
    if max(im.size) > max_side:
        r = max_side / max(im.size); im = im.resize((int(im.width * r), int(im.height * r)), Image.LANCZOS)
    buf = BytesIO(); im.save(buf, format="PNG"); return buf.getvalue()


def sentences() -> list[str]:
    """검사 단위: 줄 단위 → 문장부호 기준 분할. 첫 줄 = 제목(헤드)."""
    out = []
    for line in BODY.splitlines():
        line = line.strip()
        if not line:
            continue
        out += [s.strip() for s in re.split(r"(?<=[.!?。])\s+", line) if s.strip()]
    return out


def _norm(t: str) -> str:
    return re.sub(r"[\s·•・∙.,!?…~:\-—–'\"“”‘’☑✓✔①②③④⑤()\[\]+#*/|]", "", t)


def ocr(img: bytes) -> str:
    try:
        from google.genai import types
        from app.adapters.gemini import get_client, AI_TOKENS_MEDIUM
        resp = get_client().models.generate_content(
            model="gemini-2.5-flash",
            contents=[types.Part.from_bytes(data=img, mime_type="image/png"),
                      "Transcribe ALL text visible in this image exactly as written, line by line, "
                      "including small text on product labels. Output plain text only."],
            config=types.GenerateContentConfig(temperature=0.0, max_output_tokens=AI_TOKENS_MEDIUM))
        return resp.text or ""
    except Exception as e:
        return f"ocr_error: {e}"


def inspect(img: bytes) -> dict:
    found = ocr(img)
    f = _norm(found)
    sents = sentences()
    head = sents[0]
    hits = [s for s in sents[1:] if _norm(s) in f]
    # 원문에 없는 줄(잔글자) — 제품 라벨 영문 등 포함, 참고용
    body_norm = _norm(BODY)
    extra = [ln.strip() for ln in found.splitlines() if ln.strip() and _norm(ln) and _norm(ln) not in body_norm]
    return {"head": head, "head_ok": _norm(head) in f,
            "body_exact": f"{len(hits)}/{len(sents) - 1}",
            "body_miss": [s for s in sents[1:] if s not in hits],
            "extra_lines": extra, "found_text": found}


async def run(key, extra, with_char, adapter, prod, char, sem):
    async with sem:
        prompt = build_prompt(extra)
        (OUT / f"{key}_prompt.txt").write_text(prompt, encoding="utf-8")
        refs, labels = [to_png_white(prod)], ["Product photo (attached)"]
        if with_char:
            refs.append(to_png_white(char)); labels.append("Character sheet: main female character (attached)")
        t0 = time.time()
        print(f"  [{key}] 생성 시작")
        try:
            r = await adapter.generate_image(prompt=prompt, reference_images=refs,
                                             reference_labels=labels, aspect_ratio="9:16")  # 1024x1536 = 2:3
        except Exception as e:
            print(f"  ❌ [{key}] {e}"); return {"key": key, "error": str(e)}
        el = round(time.time() - t0, 1)
        (OUT / f"{key}.png").write_bytes(r.image_bytes)
        print(f"  [{key}] 저장 ({el}s) → 검사")
        chk = await asyncio.to_thread(inspect, r.image_bytes)
        return {"key": key, "extra_instruction": extra, "elapsed_s": el, **chk}


def grid():
    ims = [Image.open(OUT / f"{k}.png").convert("RGB") for k, _, _ in VARIANTS if (OUT / f"{k}.png").exists()]
    if not ims:
        return
    w, h, lab = 768, round(ims[0].height * 768 / ims[0].width), 56
    g = Image.new("RGB", (w * len(ims), h + lab), (255, 255, 255))
    d = ImageDraw.Draw(g)
    try:
        f = ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf", 28)
    except OSError:
        f = ImageFont.load_default()
    for i, (im, (k, ex, _)) in enumerate(zip(ims, VARIANTS)):
        d.text((i * w + 16, 12), f"{i + 1}. {ex or '그대로'}", font=f, fill=(30, 30, 30))
        g.paste(im.resize((w, h), Image.LANCZOS), (i * w, lab))
    g.save(OUT / "grid.png", optimize=True)


async def main():
    prod = (D1 / "product_photo.jpg").read_bytes()
    char = (D1 / "char_sheet.png").read_bytes()
    adapter = get_openai_image_adapter()
    sem = asyncio.Semaphore(3)
    t0 = time.time()
    res = await asyncio.gather(*[run(k, ex, wc, adapter, prod, char, sem) for k, ex, wc in VARIANTS])
    summary = {"total_elapsed_s": round(time.time() - t0, 1),
               "model": "gpt-image-2.5-sunburst, quality=high, 1024x1536 (2:3)",
               "inputs": "제품 사진 + korean_webtoon 스타일 문구 + 요청문 + 본문 전문 (템플릿·장치·레이아웃 지시 없음)",
               "results": res}
    (OUT / "results.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    grid()
    print(f"완료 {summary['total_elapsed_s']}s")


if __name__ == "__main__":
    asyncio.run(main())
