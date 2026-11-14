"""scratch/detail2/generate.py — 상세페이지 scratch 2차.

섹션 타입 3종(char / product_hero / product_mech) + 본문 A/B + B안 완성 스택.
운영 코드·DB 변경 없음. 1차 스크립트(scratch/detail/generate.py)를 import해
SECTIONS·PRODUCT·프롬프트 빌더 재사용. 바꿀 문장은 이 파일 안에서만.

사용법 (WEBTOON 루트에서):
  backend/venv/Scripts/python scratch/detail2/generate.py          # 생성+검사+합성
  backend/venv/Scripts/python scratch/detail2/generate.py --compose  # 합성만(생성 결과 재사용)
"""

import asyncio
import copy
import json
import re
import sys
import time
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent  # WEBTOON/
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# 1차 스크립트 재사용 (backend path·.env·콘솔 인코딩도 여기서 세팅됨)
import scratch.detail.generate as g1  # noqa: E402

from app.adapters.openai_image import get_openai_image_adapter  # noqa: E402
from app.prompts.explain import _COMMON_HEAD, _visual_details_block, _palette_block  # noqa: E402
from app.prompts.copy_render import build_copy_clause, check_copy_text, check_anatomy  # noqa: E402
from app.prompts.product import build_product_clause  # noqa: E402

D1 = ROOT / "scratch" / "detail"          # 1차 결과 (out/ 없이 바로 아래)
OUT = Path(__file__).resolve().parent / "out"
OUT.mkdir(parents=True, exist_ok=True)

# ── 입력 조정 (지시서) ──
g1.PRODUCT.label_text = "Herb Pack · GREEN TEA SPA"   # 1차 잔글자 원인 → 축약
SEC = {s["id"]: copy.deepcopy(s) for s in g1.SECTIONS}
for s in SEC.values():
    s["head"] = re.sub(r"\s*[\U0001F300-\U0001FAFF\u2600-\u27BF]+", "", s["head"]).strip()

NO_EMOJI = "Do NOT draw any emoji or emoji-like symbols."

# ── 본문 전문 (도도 기획안 원문이 repo에 없어 1차 body_text를 지시서 분량으로 확장) ──
# 블록 형식: ("para", [문장...]) / ("checks", [항목...]) / ("steps", [(라벨, 설명)...]) / ("cta", 문장)
BODY = {
    1: {"title": "두피 스트레스, 그냥 두지 마세요",
        "blocks": [("para", ["하루 종일 기름진 두피, 가려움, 냄새… 혹시 나도?",
                             "두피 스트레스는 방치하면 탈모로 이어질 수 있습니다."])]},
    2: {"title": "자연바람 아로마 그린티 스파 허브팩",
        "blocks": [("para", ["1000g 대용량 두피 팩.", "쿨링 · 클렌징 · 트리트먼트를 한 번에."])]},
    3: {"title": "POINT 1 · 쿨링 & 클렌징",
        "blocks": [("para", ["멘톨 성분이 닿는 순간 두피 온도를 낮춰 열감을 빠르게 식혀 줍니다.",
                             "녹차 추출물이 묵은 각질과 피지를 부드럽게 들어 올려 깨끗하게 정리합니다.",
                             "자극 없이 산뜻한 두피로 하루를 시작하세요."]),
                   ("checks", ["체감 온도 -5도 쿨링", "각질 · 피지 클렌징"])]},
    4: {"title": "POINT 2 · 올인원 케어",
        "blocks": [("para", ["두피 팩 하나로 클렌징 + 트리트먼트 + 두피 케어까지.",
                             "헹구고 나면 손에 감기는 물미역 같은 촉촉함."])]},
    5: {"title": "POINT 3 · 넉넉한 대용량",
        "blocks": [("para", ["1000g 대용량이라 매일 써도 3개월 이상.",
                             "남편도, 아이도, 나도 — 온 가족이 함께 쓰는 넉넉한 설계."])]},
    6: {"title": "HOW TO USE · 홈 스파 5단계",
        "blocks": [("steps", [("덜기", "적당량을 뾰족 공병에 덜어 주세요"),
                              ("도포", "가르마를 따라 두피에 꼼꼼히 발라 주세요"),
                              ("마사지", "지문으로 두피를 3분간 부드럽게 마사지"),
                              ("방치", "헤어캡을 쓰고 5~10분 그대로 두세요"),
                              ("헹굼", "미온수로 깨끗하게 헹궈 주세요")])]},
    7: {"title": "CHECK LIST · 이런 분께 추천",
        "blocks": [("checks", ["오후만 되면 앞머리가 떡지는 분", "두피 냄새가 신경 쓰이는 분",
                               "두피 열감이 심한 분", "두피가 예민해 순한 제품을 찾는 분"])]},
    8: {"title": "",
        "blocks": [("cta", "지금, 자연바람으로 두피에 시원한 휴식을 선물하세요.")]},
}
EMPH = ["-5도", "1000g", "물미역", "3개월", "3분", "5~10분", "온 가족"]


def body_plain(sid: int) -> list[str]:
    """A안 렌더용 문장 목록 (검사 단위)."""
    out = []
    for kind, data in BODY[sid]["blocks"]:
        if kind == "para":
            out += data
        elif kind == "checks":
            out += [f"☑ {x}" for x in data]
        elif kind == "steps":
            circ = "①②③④⑤"
            out += [f"{circ[i]} {lbl}: {desc}" for i, (lbl, desc) in enumerate(data)]
        elif kind == "cta":
            out.append(data)
    return out


# ── 프롬프트: 캐릭터 없는 템플릿 2종 ──
_NOCHAR_HEAD = (
    _COMMON_HEAD
    .replace("The character is the guide — holding or pointing at the product. ",
             "There are NO people in this panel — the product and the infographic tell the story. ")
    .replace("No other text, slogans, signs, or posters with words anywhere in the image. ", "")
)


def _nochar_product_clause(hero: bool) -> str:
    pc = build_product_clause(g1.PRODUCT, anatomy_hint=False)
    pc = pc.replace("Show it naturally held, placed on a surface, or used by a character. ",
                    "Show it standing on a surface; nobody holds it. ")
    pc = pc.replace("a character's hand length (wrist to fingertip)", "an adult hand length (for scale only, no hand drawn)")
    if hero:
        pc = pc.replace("NEVER make the product giant or background-sized. ",
                        "Draw it LARGE as the hero of the panel (about 60% of the frame height). ")
    return pc


def _common_tail(sec: dict, avoid_en: str) -> list[str]:
    return [
        build_copy_clause(head=sec["head"], sub="", copy_design={"font": "bold_gothic", "position": "top"}),
        "Keep the top 25% of the frame clean and uncluttered for the headline.",
        f"AVOID drawing: {sec['avoid']} ({avoid_en}).",
        NO_EMOJI,
        "Do NOT use photorealistic, 3D render, 8K, or hyperdetailed styles. "
        "Keep everything in webtoon illustration style.",
    ]


def prompt_hero(sec: dict) -> str:
    device = (
        "DEVICE: Product hero shot — the 1000g pump bottle stands upright on a bathroom shelf, "
        "drawn LARGE, filling at least 60% of the frame height, centered slightly below the middle. "
        "Props only: ice cubes, fresh green tea leaves, a rolled white towel, the bathroom shelf. "
        f"A round badge near the bottle with the label '{sec['labels'][0]}' in bold Korean text. "
        "NO people, no hands, no faces — product only."
    )
    parts = [g1.DETAIL_STYLE, _NOCHAR_HEAD, device,
             _visual_details_block(sec["elements"]), _palette_block(g1.PRODUCT.palette),
             _nochar_product_clause(hero=True)]
    parts += _common_tail(sec, "people, hands, faces, other bottles, extra text")
    return "\n\n".join(p for p in parts if p)


def prompt_mech(sec: dict, kind: str) -> str:
    if kind == "zoom_inset":
        device = (
            "DEVICE: Product + mechanism diagram. The bottle stands on the LEFT side, about 40% of the width. "
            "The RIGHT side is the focal element: a LARGE circular zoom inset showing a cross-section of scalp skin "
            "with hair follicles — blue cooling particles drawing heat away (wavy heat lines fading out), "
            "green tea essence lifting small flakes of dead skin and sebum off the surface. "
            "A thin leader line connects the bottle's pump nozzle to the inset. "
            f"Label inside or near the inset: '{sec['labels'][0]}' in bold Korean text. "
            "NO people, no hands, no faces; the diagram is the focal element."
        )
        elements = ["두피 단면 원형 인셋", "파란 쿨링 입자", "녹차 성분", "들어 올려지는 각질·피지"]
    else:  # icon_badges + 펌프
        badges = ", ".join(
            f"({i+1}) a simple flat {icon} pictogram, label '{lbl}'"
            for i, (icon, lbl) in enumerate(zip(["man", "child", "woman"], sec["labels"])))
        device = (
            "DEVICE: Product + icon badges. The bottle stands on the LEFT side, about 40% of the width, "
            "its pump head pressed down with a small dollop of green pack coming out of the nozzle (no hand). "
            "The RIGHT side is the focal element: three LARGE circular badges stacked vertically: "
            f"{badges}. The pictograms are flat icons, not drawn people. Each badge has its Korean label below it. "
            "NO people, no hands, no faces; the diagram is the focal element."
        )
        elements = ["가족 3인 픽토그램 원형 배지", "눌린 펌프 헤드", "펌프에서 나오는 녹색 팩"]
    parts = [g1.DETAIL_STYLE, _NOCHAR_HEAD, device]
    if sec["mechanism"]:
        parts.append(f"The key mechanism: {sec['mechanism']}.")
    parts += [_visual_details_block(elements), _palette_block(g1.PRODUCT.palette),
              _nochar_product_clause(hero=False)]
    parts += _common_tail(sec, "people, hands, faces, family full-body figures")
    return "\n\n".join(p for p in parts if p)


def allow_body(prompt: str, sid: int) -> str:
    """A안: '글자 금지' 문장을 본문 허용으로 바꾸고 본문 렌더 지시 추가."""
    p = prompt
    p = p.replace("No other text, slogans, signs, or posters with words anywhere in the image. ", "")
    p = p.replace("No other text anywhere except the product's own label",
                  "No other text anywhere except the product's own label, the labels and the body text block")
    p = p.replace("No text anywhere in the image except the product's own label; no slogans, signs, or posters with words",
                  "No text anywhere except the headline, the labels, the body text block and the product's own label")
    lines = "\n".join(body_plain(sid))
    p += (
        "\n\nBODY TEXT: render this Korean body text exactly, in a clean text block area "
        "(a white rounded panel in the lower part of the image), smaller than the headline, "
        "keeping the same order and line breaks. Spell every Korean character exactly — "
        "even one wrong character is a failure:\n" + lines
    )
    return p


# ── 생성 목록 ──
def jobs() -> list[dict]:
    s2, s3, s5, s6 = SEC[2], SEC[3], SEC[5], SEC[6]
    p3 = prompt_mech(s3, "zoom_inset")
    return [
        {"key": "s02_hero", "sid": 2, "type": "product_hero", "prompt": prompt_hero(s2), "char": False},
        {"key": "s03_mech", "sid": 3, "type": "product_mech", "prompt": p3, "char": False},
        {"key": "s05_mech", "sid": 5, "type": "product_mech", "prompt": prompt_mech(s5, "icon_badges"), "char": False},
        {"key": "s03_A", "sid": 3, "type": "product_mech+A", "prompt": allow_body(p3, 3), "char": False, "A": True},
        {"key": "s06_A", "sid": 6, "type": "char+A", "prompt": allow_body(g1._build_section_prompt(s6), 6),
         "char": True, "A": True, "steps": True},
    ]


def _norm(t: str) -> str:
    return re.sub(r"[\s·•・∙.,!?…~:\-—'\"“”‘’☑✓①②③④⑤()+]", "", t)


def count_people(img: bytes) -> dict:
    try:
        from google.genai import types
        from app.adapters.gemini import get_client, AI_TOKENS_SHORT, parse_ai_json
        resp = get_client().models.generate_content(
            model="gemini-2.5-flash",
            contents=[types.Part.from_bytes(data=img, mime_type="image/png"),
                      "Count humans drawn in this illustration (ignore flat pictogram icons). "
                      'Return JSON only: {"people": <int>, "faces": <int>}.'],
            config=types.GenerateContentConfig(temperature=0.1, max_output_tokens=AI_TOKENS_SHORT))
        r = parse_ai_json(resp.text)
        return {"people": int(r.get("people", -1)), "faces": int(r.get("faces", -1))}
    except Exception as e:
        return {"people": -1, "faces": -1, "error": str(e)}


def inspect(job: dict, img: bytes) -> dict:
    sec = SEC[job["sid"]]
    expected_sub = "\n".join(body_plain(job["sid"])) if job.get("A") else ""
    cc = check_copy_text(img, sec["head"], expected_sub)
    found = _norm(cc.get("found_text", ""))
    labels = sec["labels"]
    res = {
        "head_ok": cc["head_ok"],
        "labels_ok": f"{sum(_norm(l) in found for l in labels)}/{len(labels)}",
        "found_text": cc.get("found_text", ""),
    }
    an = check_anatomy(img)
    if job.get("steps"):
        an["ok"] = an.get("hands", 0) <= 12   # 패널당 2손 예외 (5패널+상단)
        an["rule"] = "steps: ≤2 hands per panel"
    res["anatomy"] = an
    if not job["char"]:
        res["people"] = count_people(img)
        res["no_char_ok"] = res["people"].get("people", 1) == 0 and an.get("hands", 1) == 0
    if job.get("A"):
        sents = body_plain(job["sid"])
        hits = [s for s in sents if _norm(s) in found]
        res["body_exact"] = f"{len(hits)}/{len(sents)}"
        res["body_miss"] = [s for s in sents if s not in hits]
    return res


async def run_job(job, adapter, product_bytes, char_bytes, sem):
    async with sem:
        refs, labels = [], []
        if job["char"] and char_bytes:
            refs.append(g1._downscale(char_bytes))
            labels.append("Character sheet: 김정신 (female, front view)")
        refs.append(g1._downscale(g1._composite_on_white(product_bytes)))
        labels.append(f"Product photo: {g1.PRODUCT.name} ({g1.PRODUCT.label_text})")
        (OUT / f"{job['key']}_prompt.txt").write_text(job["prompt"], encoding="utf-8")
        t0 = time.time()
        print(f"  [{job['key']}] 생성 시작")
        try:
            r = await adapter.generate_image(prompt=job["prompt"], reference_images=refs,
                                             reference_labels=labels, aspect_ratio="3:4")
        except Exception as e:
            print(f"  ❌ [{job['key']}] {e}")
            return {"key": job["key"], "error": str(e)}
        el = round(time.time() - t0, 1)
        (OUT / f"{job['key']}.png").write_bytes(r.image_bytes)
        print(f"  [{job['key']}] 저장 ({el}s) → 검사")
        chk = await asyncio.to_thread(inspect, job, r.image_bytes)
        return {"key": job["key"], "section": job["sid"], "type": job["type"], "elapsed_s": el, **chk}


# ── 합성 (PIL) ──
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

W = 1024
FONT_DIR = Path("C:/Windows/Fonts")


def font(size: int, bold: bool) -> ImageFont.FreeTypeFont:
    noto = FONT_DIR / "NotoSansKR-VF.ttf"
    try:
        f = ImageFont.truetype(str(noto), size)
        f.set_variation_by_axes([700 if bold else 400])
        return f
    except Exception:
        pass
    for name in (["NanumBarunGothicBold.ttf", "malgunbd.ttf"] if bold else ["NanumBarunGothic.ttf", "malgun.ttf"]):
        try:
            return ImageFont.truetype(str(FONT_DIR / name), size)
        except OSError:
            continue
    return ImageFont.load_default()


F_TITLE, F_BODY, F_BODY_B, F_NUM = font(44, True), font(36, False), font(36, True), font(30, True)
F_CTA = font(40, True)
LH = int(36 * 1.6)
MX = 80


def hexrgb(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def lum(c): return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255


def sample_bottom(img: Image.Image) -> tuple:
    strip = img.convert("RGB").crop((0, img.height - 24, img.width, img.height)).resize((64, 4))
    px = sorted(strip.getdata(), key=lum)
    return px[len(px) // 2]


def theme(bg):
    light = lum(bg) > 0.55
    return {
        "bg": bg,
        "fg": (34, 34, 34) if light else (250, 250, 250),
        "sub": (90, 90, 90) if light else (220, 220, 220),
        "accent": hexrgb(g1.PRODUCT.palette[0]) if light else hexrgb(g1.PRODUCT.palette[1]),
        "card": tuple(min(255, int(c * 0.94 + 255 * 0.06)) if not light else int(c * 0.95) for c in bg),
    }


def segs(text: str):
    """강조 단어 분리 → [(텍스트, 강조여부)]."""
    pat = "(" + "|".join(re.escape(e) for e in sorted(EMPH, key=len, reverse=True)) + ")"
    return [(p, bool(re.fullmatch(pat, p))) for p in re.split(pat, text) if p]


def wrap(text: str, width: int, f_reg, f_bold) -> list[list[tuple]]:
    """공백 단위 줄바꿈(너무 긴 토큰은 글자 단위). 결과: 줄 = [(텍스트, 강조)]."""
    tokens = []
    for t, e in segs(text):
        for piece in re.split(r"(\s+)", t):
            if piece:
                tokens.append((piece, e))
    lines, cur, cw = [], [], 0
    for t, e in tokens:
        f = f_bold if e else f_reg
        tw = f.getlength(t)
        if t.isspace():
            if cur:
                cur.append((t, e)); cw += tw
            continue
        if cw + tw > width and cur:
            while cur and cur[-1][0].isspace():
                cw -= (f_bold if cur[-1][1] else f_reg).getlength(cur[-1][0]); cur.pop()
            lines.append(cur); cur, cw = [], 0
        if tw > width:  # 글자 단위
            for ch in t:
                cl = f.getlength(ch)
                if cw + cl > width and cur:
                    lines.append(cur); cur, cw = [], 0
                cur.append((ch, e)); cw += cl
        else:
            cur.append((t, e)); cw += tw
    if cur:
        lines.append(cur)
    return lines


def draw_line(d, x, y, line, th, f_reg, f_bold):
    for t, e in line:
        f = f_bold if e else f_reg
        d.text((x, y), t, font=f, fill=th["accent"] if e else th["fg"])
        x += f.getlength(t)


def draw_check(d, x, y, th, size=34):
    d.rounded_rectangle([x, y, x + size, y + size], radius=7, fill=th["accent"])
    d.line([(x + 8, y + size * 0.52), (x + size * 0.42, y + size - 9), (x + size - 7, y + 9)],
           fill=(255, 255, 255), width=5, joint="curve")


def draw_num(d, x, y, n, th, size=48):
    d.ellipse([x, y, x + size, y + size], fill=th["accent"])
    t = str(n)
    tw = F_NUM.getlength(t)
    bb = F_NUM.getbbox(t)
    d.text((x + (size - tw) / 2, y + (size - (bb[3] - bb[1])) / 2 - bb[1]), t, font=F_NUM,
           fill=(255, 255, 255) if lum(th["accent"]) < 0.6 else (30, 30, 30))


def render_block(sid: int, bg) -> Image.Image:
    """본문 블록 1개 — 높이는 내용에 맞춤. 2-pass(측정→그리기)."""
    th = theme(bg)
    spec = BODY[sid]

    def layout(d):
        y = 64
        if spec["title"]:
            if d:
                d.rectangle([MX, y, MX + 56, y + 6], fill=th["accent"])
            y += 26
            for line in wrap(spec["title"], W - 2 * MX, F_TITLE, F_TITLE):
                if d:
                    draw_line(d, MX, y, [(t, False) for t, _ in line], th, F_TITLE, F_TITLE)
                y += int(44 * 1.4)
            y += 22
        for kind, data in spec["blocks"]:
            if kind == "para":
                for sent in data:
                    for line in wrap(sent, W - 2 * MX, F_BODY, F_BODY_B):
                        if d:
                            draw_line(d, MX, y, line, th, F_BODY, F_BODY_B)
                        y += LH
                    y += 14
            elif kind == "checks":
                y += 8
                for item in data:
                    lines = wrap(item, W - 2 * MX - 60, F_BODY_B, F_BODY_B)
                    if d:
                        draw_check(d, MX, y + 12, th)
                    for line in lines:
                        if d:
                            draw_line(d, MX + 60, y, line, th, F_BODY_B, F_BODY_B)
                        y += LH
                    y += 10
            elif kind == "steps":
                y += 6
                for i, (lbl, desc) in enumerate(data):
                    card_top = y
                    lines = wrap(desc, W - 2 * MX - 96, F_BODY, F_BODY_B)
                    h = 28 + LH + len(lines) * LH + 20
                    if d:
                        d.rounded_rectangle([MX - 20, card_top, W - MX + 20, card_top + h], radius=22, fill=th["card"])
                        draw_num(d, MX, card_top + 26, i + 1, th)
                        d.text((MX + 76, card_top + 24), lbl, font=F_BODY_B, fill=th["accent"])
                    yy = card_top + 24 + LH
                    for line in lines:
                        if d:
                            draw_line(d, MX + 76, yy, line, th, F_BODY, F_BODY_B)
                        yy += LH
                    y = card_top + h + 18
            elif kind == "cta":
                y += 10
                for line in wrap(data, W - 2 * MX, F_CTA, F_CTA):
                    lw = sum(F_CTA.getlength(t) for t, _ in line)
                    if d:
                        draw_line(d, (W - lw) / 2, y, [(t, False) for t, _ in line], th, F_CTA, F_CTA)
                    y += int(40 * 1.5)
                y += 70  # 여백
        return y + 72

    h = layout(None)
    blk = Image.new("RGB", (W, h), th["bg"])
    layout(ImageDraw.Draw(blk))
    return blk


def load_w(p: Path) -> Image.Image:
    im = Image.open(p).convert("RGB")
    if im.width != W:
        im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
    return im


def d1(name: str) -> Path:
    return (D1 / "out" / name) if (D1 / "out" / name).exists() else (D1 / name)


B_SOURCES = {1: d1("s01.png"), 2: OUT / "s02_hero.png", 3: OUT / "s03_mech.png", 4: d1("s04.png"),
             5: OUT / "s05_mech.png", 6: d1("s06.png"), 7: d1("s07.png"), 8: d1("s08.png")}


def vstack(imgs, path):
    h = sum(i.height for i in imgs)
    out = Image.new("RGB", (W, h), (255, 255, 255))
    y = 0
    for i in imgs:
        out.paste(i, (0, y)); y += i.height
    out.save(path, optimize=True)
    return out.size


def compose():
    blocks = {}
    for sid, src in B_SOURCES.items():
        img = load_w(src)
        blk = render_block(sid, sample_bottom(img))
        pair = Image.new("RGB", (W, img.height + blk.height))
        pair.paste(img, (0, 0)); pair.paste(blk, (0, img.height))
        pair.save(OUT / f"block_{sid:02d}.png", optimize=True)
        blocks[sid] = pair
    sb = vstack([blocks[i] for i in range(1, 9)], OUT / "stack_B.png")
    a_imgs = [load_w(OUT / "s03_A.png") if i == 3 else load_w(OUT / "s06_A.png") if i == 6 else blocks[i]
              for i in range(1, 9)]
    sa = vstack(a_imgs, OUT / "stack_A.png")

    # grid_types: 위 1차 2·3·5 / 아래 2차 2·3·5
    cw = 512
    cells = [[d1("s02.png"), d1("s03.png"), d1("s05.png")],
             [OUT / "s02_hero.png", OUT / "s03_mech.png", OUT / "s05_mech.png"]]
    ims = [[Image.open(p).convert("RGB") for p in row] for row in cells]
    ch = round(ims[0][0].height * cw / ims[0][0].width)
    lab = 56
    g = Image.new("RGB", (cw * 3, (ch + lab) * 2), (255, 255, 255))
    dg = ImageDraw.Draw(g)
    for r, (row, title) in enumerate(zip(ims, ["1차 (캐릭터 템플릿)", "2차 (product_hero · product_mech)"])):
        y0 = r * (ch + lab)
        dg.text((16, y0 + 10), title + "   —   2 Hero / 3 Point1 / 5 Point3", font=font(30, True), fill=(30, 30, 30))
        for c, im in enumerate(row):
            g.paste(im.resize((cw, ch), Image.LANCZOS), (c * cw, y0 + lab))
    g.save(OUT / "grid_types.png", optimize=True)
    print(f"  stack_B {sb}, stack_A {sa}, grid_types {g.size}")


async def main():
    if "--compose" not in sys.argv:
        product_bytes, char_bytes = g1._fetch_product_and_character()
        assert product_bytes and char_bytes, "scratch/detail/product_photo.jpg·char_sheet.png 필요"
        adapter = get_openai_image_adapter()
        t0 = time.time()
        sem = asyncio.Semaphore(3)
        results = await asyncio.gather(*[run_job(j, adapter, product_bytes, char_bytes, sem) for j in jobs()])
        total = round(time.time() - t0, 1)
        summary = {
            "total_elapsed_s": total,
            "gpt_images": sum(1 for r in results if "error" not in r),
            "model": "gpt-image-2.5-sunburst, quality=high, 1024x1536→crop 1024x1365(3:4)",
            "cost": "GPT 이미지 5장 + Gemini 2.5 Flash 검사 호출 — 단가 미확인(장수만 기록)",
            "label_text_override": g1.PRODUCT.label_text,
            "body_source": "도도 기획안 원문 repo에 없음 → 1차 body_text를 지시서 분량으로 확장",
            "results": results,
        }
        (OUT / "results.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"전체 {total}s → results.json")
    compose()


if __name__ == "__main__":
    asyncio.run(main())
