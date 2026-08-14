"""말풍선/대사 조판 엔진 — 12종 말풍선 Pillow 렌더링.

이미지 모델이 생성한 컷 위에 말풍선·대사를 Pillow로 합성한다.
이미지 재생성 없이 대사만 수정 가능(과금 없음).

말풍선 12종:
  기본 4: round, narration, thought, whisper
  감정 8: shout, angry, happy, sad, surprised, shy, flustered, realize

레이아웃 규칙: bubble_spec.json (프론트와 공유)
"""

import io
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app.storage import upload_image, LOCAL_STORAGE_DIR
from app.composition.bubble_mapping import resolve_bubble_style

# ── 렌더러 버전 — 말풍선 모양·레이아웃 로직이 바뀔 때마다 올린다 ──
# Export 시 stale 판정에 사용. 이 값이 다르면 composed_image_url을 재생성한다.
RENDERER_VERSION = "v2-oval-2026-08"

# ── 공유 스펙 로드 ──
_SPEC_PATH = Path(__file__).parent / "bubble_spec.json"
_SPEC = json.loads(_SPEC_PATH.read_text(encoding="utf-8"))

BASE_FONT_SIZE: int = _SPEC["baseFontSize"]      # 14
CHAR_WIDTH: float  = _SPEC["charWidth"]          # 0.72
LINE_H_RATIO: float = _SPEC["lineHeightRatio"]   # 1.45
OVAL_EXTRA: int    = _SPEC["ovalExtra"]           # 12
SPIKE_MARGIN: int  = _SPEC["spikeMargin"]         # 8

def _spec(style: str) -> dict:
    return _SPEC["styles"].get(style, _SPEC["styles"]["round"])

# ── 폰트 설정 ──
FONT_PATHS = [
    "/usr/share/fonts/truetype/nanum/NanumSquareRoundB.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
    "C:/Windows/Fonts/malgun.ttf",
]
LINE_SPACING = 8
BUBBLE_GAP   = 12
BUBBLE_MARGIN = 20
TAIL_HEIGHT  = 16


def _get_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_PATHS:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def _wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    """텍스트를 max_width에 맞게 줄바꿈 (한글 글자 단위, 픽셀 측정)."""
    lines = []
    for paragraph in text.split('\n'):
        if not paragraph.strip():
            lines.append('')
            continue
        current = ''
        for char in paragraph:
            test = current + char
            bbox = font.getbbox(test)
            if bbox[2] - bbox[0] > max_width:
                if current:
                    lines.append(current)
                current = char
            else:
                current = test
        if current:
            lines.append(current)
    return lines


# ═══════════════════════════════════════════════════════════
#  스타일별 색상 정의 (렌더러 분리를 위해 중앙화)
# ═══════════════════════════════════════════════════════════

STYLE_FILL = {
    "round":     (255, 255, 255, 242),
    "narration": (0,   0,   0,   166),
    "thought":   (255, 255, 255, 200),
    "whisper":   (255, 255, 255, 180),
    "shout":     (255, 255, 255, 242),
    "angry":     (255, 230, 230, 242),
    "happy":     (255, 230, 242, 242),
    "sad":       (225, 235, 255, 230),
    "surprised": (255, 248, 220, 242),
    "shy":       (255, 220, 235, 220),
    "flustered": (255, 230, 238, 220),
    "realize":   (255, 255, 220, 230),
}
STYLE_STROKE = {
    "round":     (26,  26,  26),
    "narration": None,
    "thought":   (150, 150, 150),
    "whisper":   (140, 140, 140),
    "shout":     (30,  30,  30),
    "angry":     (200, 40,  40),
    "happy":     (224, 96,  144),
    "sad":       (80,  110, 180),
    "surprised": (200, 136, 0),
    "shy":       (200, 96,  144),
    "flustered": (190, 80,  120),
    "realize":   (176, 160, 48),
}
TEXT_COLORS = {
    "round":     (26,  26,  26),
    "narration": (255, 255, 255),
    "thought":   (80,  80,  80),
    "whisper":   (120, 120, 120),
    "shout":     (20,  20,  20),
    "angry":     (170, 30,  30),
    "happy":     (170, 50,  90),
    "sad":       (50,  70,  120),
    "surprised": (160, 100, 20),
    "shy":       (150, 60,  90),
    "flustered": (140, 50,  80),
    "realize":   (90,  80,  20),
}
FONT_SIZE_MULT = {
    "shout": 1.15, "angry": 1.15,
    "whisper": 0.85,
    "narration": 0.90,
}

# 스타일 분류
OVAL_STYLES  = {"round", "happy"}
SPIKY_STYLES = {"shout", "angry", "surprised"}
ELLIPSE_STYLES = {"whisper", "sad", "shy", "flustered", "realize"}
BOTTOM_STYLES  = {"narration"}


# ═══════════════════════════════════════════════════════════
#  도형 그리기 함수
# ═══════════════════════════════════════════════════════════

def _make_spiky_polygon(cx, cy, rx, ry, num_spikes=12, spike_depth=0.15):
    points = []
    total = num_spikes * 2
    for i in range(total):
        angle = (2 * math.pi / total) * i - math.pi / 2
        if i % 2 == 0:
            px = cx + rx * math.cos(angle)
            py = cy + ry * math.sin(angle)
        else:
            px = cx + rx * (1 - spike_depth) * math.cos(angle)
            py = cy + ry * (1 - spike_depth) * math.sin(angle)
        points.append((px, py))
    return points


def _draw_oval(draw: ImageDraw.ImageDraw, cx: float, cy: float,
               erx: float, ery: float, fill: tuple, stroke: tuple,
               stroke_width: int = 3):
    """타원 본체."""
    draw.ellipse([cx - erx, cy - ery, cx + erx, cy + ery],
                 fill=fill, outline=stroke, width=stroke_width)


def _draw_oval_tail(draw: ImageDraw.ImageDraw, cx: float, cy: float,
                    erx: float, ery: float, fill: tuple, stroke: tuple,
                    direction: str = "down", flip: bool = False):
    """타원 꼬리 — 날카로운 삼각형 + 접합부 재그림."""
    f = 1 if flip else -1
    if direction == "none":
        return
    if direction == "down":
        pts = [(cx + f*erx*0.28, cy + ery - 4),
               (cx + f*erx*0.02, cy + ery - 4),
               (cx + f*erx*0.50, cy + ery + 20)]
    elif direction == "up":
        pts = [(cx + f*erx*0.28, cy - ery + 4),
               (cx + f*erx*0.02, cy - ery + 4),
               (cx + f*erx*0.50, cy - ery - 20)]
    elif direction == "left":
        pts = [(cx - erx + 4, cy - ery*0.25),
               (cx - erx + 4, cy + ery*0.05),
               (cx - erx - 20, cy + ery*0.40)]
    elif direction == "right":
        pts = [(cx + erx - 4, cy - ery*0.25),
               (cx + erx - 4, cy + ery*0.05),
               (cx + erx + 20, cy + ery*0.40)]
    else:
        return
    draw.polygon(pts, fill=fill, outline=stroke)
    # 접합부 자연스럽게 처리: 내부를 fill 색으로 재그림 (외곽선 없이)
    draw.ellipse([cx - erx + 2, cy - ery + 2, cx + erx - 2, cy + ery - 2], fill=fill)


def _draw_directional_tail(draw: ImageDraw.ImageDraw,
                            bx: int, by: int, bw: int, bh: int,
                            direction: str, fill: tuple, stroke: tuple,
                            flip: bool = False):
    """직사각·타원 기반 말풍선의 방향별 꼬리."""
    if direction == "none":
        return
    offset = min(40, int(bw * 0.3))
    # flip 여부에 따라 x 기준점 결정
    if flip:
        base_x = bx + bw - offset - 16
        sign = -1
    else:
        base_x = bx + offset
        sign = 1

    if direction == "down":
        ty = by + bh
        draw.polygon([(base_x, ty-1), (base_x + sign*8, ty+TAIL_HEIGHT),
                      (base_x + sign*16, ty-1)], fill=fill, outline=stroke)
        # 접합부 덮기
        draw.rectangle([min(base_x, base_x+sign*16)+1, ty-2,
                        max(base_x, base_x+sign*16)-1, ty+1], fill=fill)
    elif direction == "up":
        draw.polygon([(base_x, by+1), (base_x + sign*8, by-TAIL_HEIGHT),
                      (base_x + sign*16, by+1)], fill=fill, outline=stroke)
        draw.rectangle([min(base_x, base_x+sign*16)+1, by-1,
                        max(base_x, base_x+sign*16)-1, by+2], fill=fill)
    elif direction == "left":
        lty = by + min(40, int(bh * 0.4))
        draw.polygon([(bx+1, lty), (bx-TAIL_HEIGHT, lty+12), (bx+1, lty+24)],
                     fill=fill, outline=stroke)
        draw.rectangle([bx-2, lty+1, bx+2, lty+23], fill=fill)
    elif direction == "right":
        rty = by + min(40, int(bh * 0.4))
        draw.polygon([(bx+bw-1, rty), (bx+bw+TAIL_HEIGHT, rty+12), (bx+bw-1, rty+24)],
                     fill=fill, outline=stroke)
        draw.rectangle([bx+bw-2, rty+1, bx+bw+2, rty+23], fill=fill)


# ═══════════════════════════════════════════════════════════
#  12종 기존 렌더러 (자동배치 경로에서 사용, auto-layout only)
# ═══════════════════════════════════════════════════════════

def _draw_narration(draw, x, y, w, h):
    draw.rectangle([x, y, x + w, y + h], fill=(0, 0, 0, 160))


def _draw_thought(draw, x, y, w, h):
    sp = _spec("thought")
    fill, stroke = STYLE_FILL["thought"], STYLE_STROKE["thought"]
    draw.rounded_rectangle([x, y, x + w, y + h], radius=24, fill=fill, outline=stroke, width=2)
    cx = x + sp["paddingX"] + 10
    draw.ellipse([cx, y + h + 4, cx + 10, y + h + 14], fill=fill, outline=stroke, width=1)
    draw.ellipse([cx + 6, y + h + 16, cx + 12, y + h + 22], fill=fill, outline=stroke, width=1)


def _draw_whisper(draw, x, y, w, h):
    fill, stroke = STYLE_FILL["whisper"], STYLE_STROKE["whisper"]
    draw.ellipse([x, y, x + w, y + h], fill=fill)
    for i in range(36):
        if i % 2 == 0:
            draw.arc([x, y, x + w, y + h], start=(360/36)*i, end=(360/36)*(i+1),
                     fill=stroke, width=2)
    tx = x + 40
    draw.polygon([(tx, y + h - 2), (tx + 8, y + h + 10), (tx + 16, y + h - 2)], fill=fill)


def _draw_shout(draw, x, y, w, h):
    m = SPIKE_MARGIN
    pts = _make_spiky_polygon(x + w/2, y + h/2, w/2 + m, h/2 + m, num_spikes=14, spike_depth=0.16)
    draw.polygon(pts, fill=STYLE_FILL["shout"], outline=STYLE_STROKE["shout"], width=3)


def _draw_angry(draw, x, y, w, h):
    m = SPIKE_MARGIN
    pts = _make_spiky_polygon(x + w/2, y + h/2, w/2 + m, h/2 + m, num_spikes=14, spike_depth=0.18)
    draw.polygon(pts, fill=STYLE_FILL["angry"], outline=STYLE_STROKE["angry"], width=3)
    ix, iy = x + w - 8, y + 4
    draw.polygon([(ix, iy), (ix-6, iy+10), (ix-2, iy+10), (ix-8, iy+20),
                  (ix+2, iy+8), (ix-2, iy+8)], fill=(220, 60, 60))


def _draw_sad(draw, x, y, w, h):
    fill, stroke = STYLE_FILL["sad"], STYLE_STROKE["sad"]
    draw.ellipse([x, y, x + w, y + h], fill=fill, outline=stroke, width=2)
    ix, iy = x + w - 12, y + 4
    draw.ellipse([ix, iy + 6, ix + 10, iy + 16], fill=(80, 130, 200))
    draw.polygon([(ix + 5, iy), (ix, iy + 10), (ix + 10, iy + 10)], fill=(80, 130, 200))


def _draw_surprised(draw, x, y, w, h):
    m = SPIKE_MARGIN
    pts = _make_spiky_polygon(x + w/2, y + h/2, w/2 + m, h/2 + m, num_spikes=12, spike_depth=0.14)
    draw.polygon(pts, fill=STYLE_FILL["surprised"], outline=STYLE_STROKE["surprised"], width=2)
    ix, iy = x + w - 8, y + 6
    star = []
    for i in range(10):
        angle = (2 * math.pi / 10) * i - math.pi / 2
        r = 7 if i % 2 == 0 else 3
        star.append((ix + r * math.cos(angle), iy + r * math.sin(angle)))
    draw.polygon(star, fill=(220, 160, 30))


def _draw_shy(draw, x, y, w, h):
    fill, stroke = STYLE_FILL["shy"], STYLE_STROKE["shy"]
    draw.ellipse([x, y, x + w, y + h], fill=fill, outline=stroke, width=2)
    tx = x + 40
    draw.polygon([(tx, y + h - 2), (tx + 10, y + h + 12), (tx + 20, y + h - 2)], fill=fill)


def _draw_flustered(draw, x, y, w, h):
    fill, stroke = STYLE_FILL["flustered"], STYLE_STROKE["flustered"]
    draw.ellipse([x, y, x + w, y + h], fill=fill, outline=stroke, width=2)
    ix, iy = x + w - 10, y + 6
    draw.arc([ix-4, iy-4, ix+8, iy+8], start=0, end=270, fill=(180, 70, 110), width=2)
    draw.arc([ix-1, iy-1, ix+5, iy+5], start=90, end=360, fill=(180, 70, 110), width=2)


def _draw_realize(draw, x, y, w, h):
    fill, stroke = STYLE_FILL["realize"], STYLE_STROKE["realize"]
    draw.ellipse([x, y, x + w, y + h], fill=fill, outline=stroke, width=2)
    ix, iy = x + w - 10, y + 4
    draw.ellipse([ix-2, iy, ix+8, iy+10], fill=(250, 220, 50), outline=(180, 160, 40), width=1)
    draw.rectangle([ix+1, iy+10, ix+5, iy+14], fill=(180, 160, 40))


# 자동배치 경로 렌더러 매핑 (round/happy 제외 — 별도 처리)
AUTO_RENDERERS = {
    "narration": _draw_narration,
    "thought":   _draw_thought,
    "whisper":   _draw_whisper,
    "shout":     _draw_shout,
    "angry":     _draw_angry,
    "sad":       _draw_sad,
    "surprised": _draw_surprised,
    "shy":       _draw_shy,
    "flustered": _draw_flustered,
    "realize":   _draw_realize,
}


# ═══════════════════════════════════════════════════════════
#  공통 렌더링 엔진 — bubble_layout 경로 (위치·꼬리·flip 지원)
# ═══════════════════════════════════════════════════════════

def _render_bubble_item(
    draw: ImageDraw.ImageDraw,
    item: dict,
    bx: int, by: int, bubble_w: int,
    img_w: int, img_h: int,
    style: str,
    tail_direction: str = "down",
    tail_flip: bool = False,
    min_height_px: int = 0,
) -> int:
    """단일 말풍선 + 텍스트를 그린다. bubble_layout 렌더링에 사용."""
    sp = _spec(style)
    padding_x = sp["paddingX"]
    padding_y = sp["paddingY"]
    font_mult  = FONT_SIZE_MULT.get(style, 1.0)
    font_size  = int(BASE_FONT_SIZE * font_mult)

    # 폰트 크기 배율 (bubble_layout에서 font_scale 지원)
    font_scale = item.get("bubble_layout", {}).get("font_scale", 1.0)
    font_size  = max(8, int(font_size * font_scale))

    font = _get_font(font_size)
    text = item.get("text", "")

    text_area_w = bubble_w - padding_x * 2
    lines = _wrap_text(text, font, text_area_w)
    if not lines:
        return 0

    line_h = font_size + LINE_SPACING
    text_h = line_h * len(lines)

    # 실제 사용 너비 (텍스트에 맞춤, narration은 전체)
    if style in BOTTOM_STYLES:
        used_w = bubble_w
    else:
        max_line_w = max(
            (font.getbbox(l)[2] - font.getbbox(l)[0]) for l in lines
        )
        used_w = min(bubble_w, max_line_w + padding_x * 2)

    bubble_h = max(text_h + padding_y * 2, min_height_px)
    actual_bx = bx + (bubble_w - used_w) // 2
    cx = actual_bx + used_w / 2
    cy = by + bubble_h / 2
    fill   = STYLE_FILL.get(style, STYLE_FILL["round"])
    stroke = STYLE_STROKE.get(style, STYLE_STROKE["round"])

    # ── 도형 그리기 ──
    if style in OVAL_STYLES:
        erx = used_w / 2 + OVAL_EXTRA
        ery = bubble_h / 2 + OVAL_EXTRA
        _draw_oval_tail(draw, cx, cy, erx, ery, fill, stroke, tail_direction, tail_flip)
        _draw_oval(draw, cx, cy, erx, ery, fill, stroke, stroke_width=3)

    elif style in SPIKY_STYLES:
        m = SPIKE_MARGIN
        depths = {"shout": 0.16, "angry": 0.18, "surprised": 0.14}
        spikes = {"shout": 14, "angry": 14, "surprised": 12}
        pts = _make_spiky_polygon(cx, cy, used_w/2 + m, bubble_h/2 + m,
                                  num_spikes=spikes.get(style, 12),
                                  spike_depth=depths.get(style, 0.15))
        draw.polygon(pts, fill=fill, outline=stroke, width=2)
        if style == "angry":
            ix, iy = actual_bx + used_w - 8, by + 4
            draw.polygon([(ix, iy), (ix-6, iy+10), (ix-2, iy+10), (ix-8, iy+20),
                          (ix+2, iy+8), (ix-2, iy+8)], fill=(220, 60, 60))
        if style == "surprised":
            ix, iy = actual_bx + used_w - 8, by + 6
            star = []
            for i in range(10):
                a = (2*math.pi/10)*i - math.pi/2
                r = 7 if i % 2 == 0 else 3
                star.append((ix + r*math.cos(a), iy + r*math.sin(a)))
            draw.polygon(star, fill=(220, 160, 30))

    elif style in ELLIPSE_STYLES:
        draw.ellipse([actual_bx, by, actual_bx + used_w, by + bubble_h],
                     fill=fill, outline=stroke, width=2)
        if style in {"whisper"}:
            for i in range(36):
                if i % 2 == 0:
                    draw.arc([actual_bx, by, actual_bx + used_w, by + bubble_h],
                             start=(360/36)*i, end=(360/36)*(i+1), fill=stroke, width=2)
        if style == "sad":
            ix, iy = actual_bx + used_w - 12, by + 4
            draw.ellipse([ix, iy+6, ix+10, iy+16], fill=(80, 130, 200))
            draw.polygon([(ix+5, iy), (ix, iy+10), (ix+10, iy+10)], fill=(80, 130, 200))
        if style in {"flustered"}:
            ix, iy = actual_bx + used_w - 10, by + 6
            draw.arc([ix-4, iy-4, ix+8, iy+8], start=0, end=270, fill=(180, 70, 110), width=2)
            draw.arc([ix-1, iy-1, ix+5, iy+5], start=90, end=360, fill=(180, 70, 110), width=2)
        if style == "realize":
            ix, iy = actual_bx + used_w - 10, by + 4
            draw.ellipse([ix-2, iy, ix+8, iy+10], fill=(250, 220, 50), outline=(180, 160, 40))
            draw.rectangle([ix+1, iy+10, ix+5, iy+14], fill=(180, 160, 40))
        # 꼬리 (whisper/shy)
        if style in {"thought", "whisper", "shy"}:
            _draw_directional_tail(draw, actual_bx, by, used_w, bubble_h,
                                   tail_direction, fill, stroke or (100, 100, 100), tail_flip)

    elif style == "narration":
        draw.rectangle([actual_bx, by, actual_bx + used_w, by + bubble_h], fill=fill)

    elif style == "thought":
        draw.rounded_rectangle([actual_bx, by, actual_bx + used_w, by + bubble_h],
                               radius=24, fill=fill, outline=stroke, width=2)
        tcx = actual_bx + padding_x + 10
        draw.ellipse([tcx, by + bubble_h + 4, tcx + 10, by + bubble_h + 14],
                     fill=fill, outline=stroke, width=1)
        draw.ellipse([tcx+6, by + bubble_h + 16, tcx+12, by + bubble_h + 22],
                     fill=fill, outline=stroke, width=1)
    else:
        draw.rounded_rectangle([actual_bx, by, actual_bx + used_w, by + bubble_h],
                               radius=20, fill=fill, outline=stroke, width=2)
        _draw_directional_tail(draw, actual_bx, by, used_w, bubble_h,
                               tail_direction, fill, stroke or (50, 50, 50), tail_flip)

    # ── 텍스트 ──
    text_color = TEXT_COLORS.get(style, (30, 30, 30))
    ty = by + padding_y
    for line in lines:
        lw = font.getbbox(line)[2] - font.getbbox(line)[0]
        tx = actual_bx + (used_w - lw) // 2
        draw.text((tx, ty), line, fill=text_color, font=font)
        ty += line_h

    return bubble_h


# ═══════════════════════════════════════════════════════════
#  조판 엔진
# ═══════════════════════════════════════════════════════════

def compose_dialogue_on_image(
    base_image: Image.Image,
    dialogue: list[dict],
    cut_spec: dict | None = None,
) -> Image.Image:
    """베이스 이미지 위에 대사 말풍선을 합성한다.

    bubble_layout이 있는 항목 → 사용자 지정 위치·꼬리·flip 사용
    없는 항목 → 자동 배치 (기존 알고리즘)
    """
    if not dialogue:
        return base_image

    img = base_image.convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    img_w, img_h = img.size
    max_bubble_w = int(img_w * 0.75)

    sorted_dialogue = sorted(dialogue, key=lambda d: d.get("order", 0))
    layout_items = [d for d in sorted_dialogue if d.get("bubble_layout")]
    auto_items   = [d for d in sorted_dialogue if not d.get("bubble_layout")]

    # ── 사용자 지정 위치 렌더링 ──
    for item in layout_items:
        style = resolve_bubble_style(item, cut_spec)
        layout = item["bubble_layout"]
        bx   = int(layout.get("x", 0) * img_w)
        by   = int(layout.get("y", 0) * img_h)
        bw   = int(layout.get("width", 0.75) * img_w)
        tail_dir  = layout.get("tail_direction", "down")
        tail_flip = layout.get("tail_flip", False)
        min_h_px  = int(layout.get("min_height", 0) * img_h)
        _render_bubble_item(draw, item, bx, by, bw, img_w, img_h,
                            style, tail_dir, tail_flip, min_h_px)

    # ── 자동 배치 (기존 알고리즘) ──
    top_items, bottom_items = [], []
    for item in auto_items:
        style = resolve_bubble_style(item, cut_spec)
        entry = {**item, "_resolved_style": style}
        if style in BOTTOM_STYLES:
            bottom_items.append(entry)
        else:
            top_items.append(entry)

    cursor_y = BUBBLE_MARGIN
    for item in top_items:
        style = item["_resolved_style"]
        sp = _spec(style)
        font_mult = FONT_SIZE_MULT.get(style, 1.0)
        font_size = int(BASE_FONT_SIZE * font_mult)
        font = _get_font(font_size)
        text = item.get("text", "")

        lines = _wrap_text(text, font, max_bubble_w - sp["paddingX"] * 2)
        if not lines:
            continue

        line_h   = font_size + LINE_SPACING
        text_h   = line_h * len(lines)
        max_lw   = max((font.getbbox(l)[2] - font.getbbox(l)[0]) for l in lines)
        bubble_w = min(max_bubble_w, max_lw + sp["paddingX"] * 2) if style not in BOTTOM_STYLES else max_bubble_w
        bubble_h = text_h + sp["paddingY"] * 2
        bx = (img_w - bubble_w) // 2

        # 도형 + 꼬리 (자동배치: round/happy도 oval로)
        fill = STYLE_FILL.get(style, STYLE_FILL["round"])
        stroke = STYLE_STROKE.get(style, (50, 50, 50))
        if style in OVAL_STYLES:
            cx, cy = bx + bubble_w / 2, cursor_y + bubble_h / 2
            erx = bubble_w / 2 + OVAL_EXTRA
            ery = bubble_h / 2 + OVAL_EXTRA
            _draw_oval_tail(draw, cx, cy, erx, ery, fill, stroke, "down", False)
            _draw_oval(draw, cx, cy, erx, ery, fill, stroke)
        else:
            renderer = AUTO_RENDERERS.get(style)
            if renderer:
                renderer(draw, bx, cursor_y, bubble_w, bubble_h)
            else:
                draw.rounded_rectangle([bx, cursor_y, bx + bubble_w, cursor_y + bubble_h],
                                       radius=20, fill=fill, outline=stroke, width=2)
                _draw_directional_tail(draw, bx, cursor_y, bubble_w, bubble_h,
                                       "down", fill, stroke or (50, 50, 50))

        # 텍스트
        text_color = TEXT_COLORS.get(style, (30, 30, 30))
        ty = cursor_y + sp["paddingY"]
        for line in lines:
            lw = font.getbbox(line)[2] - font.getbbox(line)[0]
            tx = bx + (bubble_w - lw) // 2
            draw.text((tx, ty), line, fill=text_color, font=font)
            ty += line_h

        if style in SPIKY_STYLES:
            cursor_y += bubble_h + BUBBLE_GAP + 14
        elif style == "thought":
            cursor_y += bubble_h + BUBBLE_GAP + 22
        elif style in OVAL_STYLES:
            cursor_y += bubble_h + BUBBLE_GAP + 20  # oval tail 공간
        else:
            cursor_y += bubble_h + BUBBLE_GAP + TAIL_HEIGHT

    # ── 나레이션 (하단) ──
    cursor_y_bottom = img_h - BUBBLE_MARGIN
    for item in reversed(bottom_items):
        style = item["_resolved_style"]
        sp = _spec(style)
        font_size = int(BASE_FONT_SIZE * FONT_SIZE_MULT.get(style, 0.9))
        font = _get_font(font_size)
        text = item.get("text", "")

        lines = _wrap_text(text, font, max_bubble_w - sp["paddingX"] * 2)
        if not lines:
            continue

        line_h   = font_size + LINE_SPACING
        bubble_w = max_bubble_w
        bubble_h = line_h * len(lines) + sp["paddingY"] * 2
        bx = (img_w - bubble_w) // 2
        by = cursor_y_bottom - bubble_h

        draw.rectangle([bx, by, bx + bubble_w, by + bubble_h], fill=STYLE_FILL["narration"])
        text_color = TEXT_COLORS["narration"]
        ty = by + sp["paddingY"]
        for line in lines:
            lw = font.getbbox(line)[2] - font.getbbox(line)[0]
            tx = bx + (bubble_w - lw) // 2
            draw.text((tx, ty), line, fill=text_color, font=font)
            ty += line_h

        cursor_y_bottom = by - BUBBLE_GAP

    result = Image.alpha_composite(img, overlay)
    return result.convert("RGB")


# ═══════════════════════════════════════════════════════════
#  진입점 — 컷 합성 + 저장
# ═══════════════════════════════════════════════════════════

def compose_cut(
    image_url: str,
    dialogue: list[dict],
    episode_id: int,
    cut_id: str,
    cut_spec: dict | None = None,
) -> str | None:
    """컷의 원본 이미지에 대사를 합성하고 저장한다."""
    if not dialogue or not image_url:
        return None

    base_img = None
    if image_url.startswith("/storage/"):
        local_path = Path(LOCAL_STORAGE_DIR) / image_url.replace("/storage/", "")
        if local_path.exists():
            base_img = Image.open(local_path)

    if not base_img:
        return None

    composed = compose_dialogue_on_image(base_img, dialogue, cut_spec)

    buf = io.BytesIO()
    composed.save(buf, format="PNG")
    composed_bytes = buf.getvalue()

    composed_url = upload_image(
        image_bytes=composed_bytes,
        path_prefix=f"episodes/{episode_id}/cuts",
        filename=f"{cut_id}_composed.png",
        mime_type="image/png",
    )
    return composed_url
