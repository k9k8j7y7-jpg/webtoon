"""말풍선/대사 조판 엔진 — 12종 말풍선 SVG-스타일 렌더링.

이미지 모델이 생성한 컷 위에 말풍선·대사를 Pillow로 합성한다.
이미지 재생성 없이 대사만 수정 가능(과금 없음).

말풍선 12종:
  기본 4: round, narration, thought, whisper
  감정 8: shout, angry, happy, sad, surprised, shy, flustered, realize
"""

import io
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app.storage import upload_image, LOCAL_STORAGE_DIR
from app.composition.bubble_mapping import resolve_bubble_style

# ── 폰트 설정 ──
FONT_PATHS = [
    "/usr/share/fonts/truetype/nanum/NanumSquareRoundB.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
    "C:/Windows/Fonts/malgun.ttf",
]

FONT_SIZE = 28
FONT_SIZE_NARRATION = 24
FONT_SIZE_SHOUT = 32
FONT_SIZE_WHISPER = 24
LINE_SPACING = 8
BUBBLE_PADDING_X = 28
BUBBLE_PADDING_Y = 18
BUBBLE_GAP = 12
BUBBLE_MARGIN = 20
TAIL_HEIGHT = 16


def _get_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_PATHS:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def _wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    """텍스트를 max_width에 맞게 줄바꿈 (한글 글자 단위)."""
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
#  12종 말풍선 렌더러
# ═══════════════════════════════════════════════════════════

def _draw_round(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int):
    """기본 라운드 말풍선 — 둥근 사각형 + 삼각형 꼬리."""
    r = 20
    draw.rounded_rectangle([x, y, x + w, y + h], radius=r,
                           fill=(255, 255, 255, 230), outline=(50, 50, 50), width=2)
    # 꼬리 (하단 좌측)
    tx = x + 40
    draw.polygon([(tx, y + h - 1), (tx + 12, y + h + TAIL_HEIGHT), (tx + 24, y + h - 1)],
                 fill=(255, 255, 255, 230), outline=(50, 50, 50))
    draw.rectangle([tx + 1, y + h - 2, tx + 23, y + h + 1], fill=(255, 255, 255, 230))


def _draw_narration(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int):
    """나레이션 박스 — 반투명 검정, 꼬리 없음."""
    draw.rectangle([x, y, x + w, y + h], fill=(0, 0, 0, 160))


def _draw_thought(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int):
    """생각 말풍선 — 구름형 둥근 사각형 + 점 꼬리."""
    r = 24
    draw.rounded_rectangle([x, y, x + w, y + h], radius=r,
                           fill=(255, 255, 255, 200), outline=(150, 150, 150), width=2)
    cx = x + 40
    draw.ellipse([cx, y + h + 4, cx + 10, y + h + 14],
                 fill=(255, 255, 255, 200), outline=(150, 150, 150), width=1)
    draw.ellipse([cx + 6, y + h + 16, cx + 12, y + h + 22],
                 fill=(255, 255, 255, 200), outline=(150, 150, 150), width=1)


def _draw_whisper(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int):
    """속삭임 — 타원 + 점선 테두리 + 작은 꼬리."""
    # 타원 배경
    draw.ellipse([x, y, x + w, y + h], fill=(255, 255, 255, 180))
    # 점선 테두리 (짧은 호 세그먼트로 구현)
    cx, cy = x + w / 2, y + h / 2
    rx, ry = w / 2, h / 2
    num_dashes = 36
    for i in range(num_dashes):
        if i % 2 == 0:
            a1 = (360 / num_dashes) * i
            a2 = (360 / num_dashes) * (i + 1)
            draw.arc([x, y, x + w, y + h], start=a1, end=a2, fill=(140, 140, 140), width=2)
    # 작은 꼬리
    tx = x + 40
    draw.polygon([(tx, y + h - 2), (tx + 8, y + h + 10), (tx + 16, y + h - 2)],
                 fill=(255, 255, 255, 180))


def _make_spiky_polygon(x: int, y: int, w: int, h: int, num_spikes: int = 12, spike_depth: float = 0.15):
    """스파이크(폭발형) 다각형 꼭짓점 생성."""
    cx, cy = x + w / 2, y + h / 2
    rx_outer, ry_outer = w / 2, h / 2
    rx_inner = rx_outer * (1 - spike_depth)
    ry_inner = ry_outer * (1 - spike_depth)
    points = []
    total = num_spikes * 2
    for i in range(total):
        angle = (2 * math.pi / total) * i - math.pi / 2
        if i % 2 == 0:
            px = cx + rx_outer * math.cos(angle)
            py = cy + ry_outer * math.sin(angle)
        else:
            px = cx + rx_inner * math.cos(angle)
            py = cy + ry_inner * math.sin(angle)
        points.append((px, py))
    return points


def _draw_shout(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int):
    """외침 — 뾰족한 폭발형 테두리."""
    # 여유 공간 확보
    margin = 12
    points = _make_spiky_polygon(x - margin, y - margin, w + margin * 2, h + margin * 2,
                                 num_spikes=14, spike_depth=0.18)
    draw.polygon(points, fill=(255, 255, 255, 240), outline=(30, 30, 30), width=3)


def _draw_angry(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int):
    """화남 — 빨간 뾰족 폭발형 + 번개 아이콘."""
    margin = 12
    points = _make_spiky_polygon(x - margin, y - margin, w + margin * 2, h + margin * 2,
                                 num_spikes=14, spike_depth=0.2)
    draw.polygon(points, fill=(255, 235, 235, 240), outline=(200, 40, 40), width=3)
    # 번개 아이콘 (우상단)
    ix, iy = x + w - 8, y + 4
    draw.polygon([(ix, iy), (ix - 6, iy + 10), (ix - 2, iy + 10),
                  (ix - 8, iy + 20), (ix + 2, iy + 8), (ix - 2, iy + 8)],
                 fill=(220, 60, 60))


def _draw_happy(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int):
    """기쁨 — 핑크 둥근 타원 + 꼬리."""
    r = 24
    draw.rounded_rectangle([x, y, x + w, y + h], radius=r,
                           fill=(255, 235, 243, 230), outline=(230, 100, 150), width=2)
    # 꼬리
    tx = x + 40
    draw.polygon([(tx, y + h - 1), (tx + 12, y + h + TAIL_HEIGHT), (tx + 24, y + h - 1)],
                 fill=(255, 235, 243, 230), outline=(230, 100, 150))
    draw.rectangle([tx + 1, y + h - 2, tx + 23, y + h + 1], fill=(255, 235, 243, 230))


def _draw_sad(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int):
    """슬픔 — 파란 타원 + 물방울 아이콘."""
    draw.ellipse([x, y, x + w, y + h], fill=(225, 235, 255, 230), outline=(80, 110, 180), width=2)
    # 물방울 아이콘 (우상단)
    ix, iy = x + w - 12, y + 4
    draw.ellipse([ix, iy + 6, ix + 10, iy + 16], fill=(80, 130, 200))
    draw.polygon([(ix + 5, iy), (ix, iy + 10), (ix + 10, iy + 10)], fill=(80, 130, 200))


def _draw_surprised(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int):
    """놀람 — 뾰족형 + 별 아이콘."""
    margin = 10
    points = _make_spiky_polygon(x - margin, y - margin, w + margin * 2, h + margin * 2,
                                 num_spikes=12, spike_depth=0.15)
    draw.polygon(points, fill=(255, 248, 225, 240), outline=(200, 140, 30), width=2)
    # 별 아이콘 (우상단)
    ix, iy = x + w - 8, y + 6
    star = []
    for i in range(10):
        angle = (2 * math.pi / 10) * i - math.pi / 2
        r = 7 if i % 2 == 0 else 3
        star.append((ix + r * math.cos(angle), iy + r * math.sin(angle)))
    draw.polygon(star, fill=(220, 160, 30))


def _draw_shy(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int):
    """부끄 — 분홍 타원."""
    draw.ellipse([x, y, x + w, y + h], fill=(255, 225, 235, 220), outline=(200, 100, 140), width=2)
    # 꼬리
    tx = x + 40
    draw.polygon([(tx, y + h - 2), (tx + 10, y + h + 12), (tx + 20, y + h - 2)],
                 fill=(255, 225, 235, 220))


def _draw_flustered(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int):
    """당황 — 타원 + 소용돌이 아이콘."""
    draw.ellipse([x, y, x + w, y + h], fill=(255, 230, 238, 220), outline=(190, 80, 120), width=2)
    # 소용돌이 아이콘 (우상단)
    ix, iy = x + w - 10, y + 6
    draw.arc([ix - 4, iy - 4, ix + 8, iy + 8], start=0, end=270, fill=(180, 70, 110), width=2)
    draw.arc([ix - 1, iy - 1, ix + 5, iy + 5], start=90, end=360, fill=(180, 70, 110), width=2)


def _draw_realize(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int):
    """깨달음 — 타원 + 전구 아이콘."""
    draw.ellipse([x, y, x + w, y + h], fill=(255, 255, 225, 230), outline=(180, 160, 40), width=2)
    # 전구 아이콘 (우상단)
    ix, iy = x + w - 10, y + 4
    draw.ellipse([ix - 2, iy, ix + 8, iy + 10], fill=(250, 220, 50), outline=(180, 160, 40), width=1)
    draw.rectangle([ix + 1, iy + 10, ix + 5, iy + 14], fill=(180, 160, 40))


# ── 렌더러 매핑 + 스타일별 설정 ──

BUBBLE_RENDERERS = {
    "round": _draw_round,
    "narration": _draw_narration,
    "thought": _draw_thought,
    "whisper": _draw_whisper,
    "shout": _draw_shout,
    "angry": _draw_angry,
    "happy": _draw_happy,
    "sad": _draw_sad,
    "surprised": _draw_surprised,
    "shy": _draw_shy,
    "flustered": _draw_flustered,
    "realize": _draw_realize,
}

# 스타일별 텍스트 색상
TEXT_COLORS = {
    "round": (30, 30, 30),
    "narration": (255, 255, 255),
    "thought": (80, 80, 80),
    "whisper": (120, 120, 120),
    "shout": (20, 20, 20),
    "angry": (170, 30, 30),
    "happy": (170, 50, 90),
    "sad": (50, 70, 120),
    "surprised": (160, 100, 20),
    "shy": (150, 60, 90),
    "flustered": (140, 50, 80),
    "realize": (90, 80, 20),
}

# 스타일별 폰트 크기
FONT_SIZES = {
    "shout": FONT_SIZE_SHOUT,
    "angry": FONT_SIZE_SHOUT,
    "whisper": FONT_SIZE_WHISPER,
    "narration": FONT_SIZE_NARRATION,
}

# 스파이크형 말풍선은 꼬리 공간 불필요 (꼬리가 스파이크에 포함)
SPIKY_STYLES = {"shout", "angry", "surprised"}

# 하단 배치 스타일 (나레이션만)
BOTTOM_STYLES = {"narration"}


# ═══════════════════════════════════════════════════════════
#  조판 엔진
# ═══════════════════════════════════════════════════════════

def compose_dialogue_on_image(
    base_image: Image.Image,
    dialogue: list[dict],
    cut_spec: dict | None = None,
) -> Image.Image:
    """베이스 이미지 위에 대사 말풍선을 합성한다.

    Args:
        base_image: 원본 컷 이미지
        dialogue: Cut spec의 dialogue 배열
        cut_spec: 컷 전체 spec (캐릭터 감정 참조용, 자동 매핑에 필요)

    Returns:
        말풍선이 합성된 이미지 (RGB)
    """
    if not dialogue:
        return base_image

    img = base_image.convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    img_w, img_h = img.size
    max_bubble_w = int(img_w * 0.75)

    # 각 대사의 bubble_style 결정 + 상단/하단 분류
    sorted_dialogue = sorted(dialogue, key=lambda d: d.get("order", 0))
    top_items = []
    bottom_items = []

    for item in sorted_dialogue:
        style = resolve_bubble_style(item, cut_spec)
        entry = {**item, "_resolved_style": style}
        if style in BOTTOM_STYLES:
            bottom_items.append(entry)
        else:
            top_items.append(entry)

    # ── 상단 말풍선 (위에서 아래로) ──
    cursor_y = BUBBLE_MARGIN
    for item in top_items:
        text = item.get("text", "")
        style = item["_resolved_style"]

        font_size = FONT_SIZES.get(style, FONT_SIZE)
        font = _get_font(font_size)

        lines = _wrap_text(text, font, max_bubble_w - BUBBLE_PADDING_X * 2)
        if not lines:
            continue

        line_height = font_size + LINE_SPACING
        text_h = line_height * len(lines)
        bubble_w = min(max_bubble_w, max(
            (font.getbbox(line)[2] - font.getbbox(line)[0]) for line in lines
        ) + BUBBLE_PADDING_X * 2)
        bubble_h = text_h + BUBBLE_PADDING_Y * 2

        bx = (img_w - bubble_w) // 2  # 중앙 정렬

        # 말풍선 렌더링
        renderer = BUBBLE_RENDERERS.get(style, _draw_round)
        renderer(draw, bx, cursor_y, bubble_w, bubble_h)

        # 텍스트 렌더링
        text_color = TEXT_COLORS.get(style, (30, 30, 30))
        ty = cursor_y + BUBBLE_PADDING_Y
        for line in lines:
            line_w = font.getbbox(line)[2] - font.getbbox(line)[0]
            tx = bx + (bubble_w - line_w) // 2
            draw.text((tx, ty), line, fill=text_color, font=font)
            ty += line_height

        # 다음 말풍선 위치
        if style in SPIKY_STYLES:
            cursor_y += bubble_h + BUBBLE_GAP + 14  # 스파이크 여백
        elif style == "thought":
            cursor_y += bubble_h + BUBBLE_GAP + 22  # 점 꼬리 공간
        else:
            cursor_y += bubble_h + BUBBLE_GAP + TAIL_HEIGHT

    # ── 하단 나레이션 (아래에서 위로) ──
    cursor_y_bottom = img_h - BUBBLE_MARGIN
    for item in reversed(bottom_items):
        text = item.get("text", "")
        style = item["_resolved_style"]

        font_size = FONT_SIZES.get(style, FONT_SIZE_NARRATION)
        font = _get_font(font_size)

        lines = _wrap_text(text, font, max_bubble_w - BUBBLE_PADDING_X * 2)
        if not lines:
            continue

        line_height = font_size + LINE_SPACING
        text_h = line_height * len(lines)
        bubble_w = min(max_bubble_w, max(
            (font.getbbox(line)[2] - font.getbbox(line)[0]) for line in lines
        ) + BUBBLE_PADDING_X * 2)
        bubble_h = text_h + BUBBLE_PADDING_Y * 2

        bx = (img_w - bubble_w) // 2
        by = cursor_y_bottom - bubble_h

        renderer = BUBBLE_RENDERERS.get(style, _draw_narration)
        renderer(draw, bx, by, bubble_w, bubble_h)

        # 나레이션 텍스트 (흰색)
        text_color = TEXT_COLORS.get(style, (255, 255, 255))
        ty = by + BUBBLE_PADDING_Y
        for line in lines:
            line_w = font.getbbox(line)[2] - font.getbbox(line)[0]
            tx = bx + (bubble_w - line_w) // 2
            draw.text((tx, ty), line, fill=text_color, font=font)
            ty += line_height

        cursor_y_bottom = by - BUBBLE_GAP

    # 합성
    result = Image.alpha_composite(img, overlay)
    return result.convert("RGB")


def compose_cut(
    image_url: str,
    dialogue: list[dict],
    episode_id: int,
    cut_id: str,
    cut_spec: dict | None = None,
) -> str | None:
    """컷의 원본 이미지에 대사를 합성하고 저장한다.

    Args:
        image_url: 원본 이미지 경로
        dialogue: Cut spec의 dialogue 배열
        episode_id: 에피소드 ID
        cut_id: 컷 ID
        cut_spec: 컷 전체 spec (자동 매핑용)

    Returns:
        합성된 이미지 URL 또는 None
    """
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
