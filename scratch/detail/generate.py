"""scratch/detail/generate.py — 상세페이지 섹션 이미지 가능성 테스트.

운영 코드·DB 변경 없음. 제품·캐릭터 데이터는 운영 API에서 SELECT 읽기만.
GPT(openai_image) 어댑터로 4:5 세로 이미지 8장 생성 → 검사 → grid/stack.

사용법:
  cd backend && python -m scratch.detail.generate
"""

import asyncio
import json
import sys
import time
from io import BytesIO
from pathlib import Path

# ── 경로 설정: backend/ 를 sys.path에 추가 ──
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# ── 콘솔 인코딩 ──
import os
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
import sys as _sys
if _sys.stdout.encoding != "utf-8":
    _sys.stdout.reconfigure(encoding="utf-8")
    _sys.stderr.reconfigure(encoding="utf-8")

# ── .env 로드 ──
from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")

OUT_DIR = Path(__file__).resolve().parent / "out"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ── 운영 모듈 임포트 (변경 없이 재사용) ──
from app.adapters.openai_image import get_openai_image_adapter
from app.prompts.explain import build_explain_clause
from app.prompts.copy_render import build_copy_clause, check_copy_text, check_anatomy
from app.prompts.product import build_product_clause
from app.styles.models import STYLE_PRESETS

# ── 서버에서 제품·캐릭터 데이터 가져오기 ──
import httpx

API_BASE = "https://ssagda.com/WEBTOON"


def _fetch_product_and_character():
    """운영 서버에서 제품 사진·캐릭터 시트 다운로드 (SELECT 읽기만)."""
    # 도도 계정 JWT 필요 — env에서 가져오거나 수동
    import os
    token = os.environ.get("SCRATCH_JWT", "")
    headers = {"Authorization": f"Bearer {token}"} if token else {}

    # 에피소드 71 (테스트 에피소드, project 12) 에서 제품·캐릭터 조회
    # 실제로는 도도툰 제품이 여러 에피소드에 걸쳐 있을 수 있음
    # 직접 API 대신, 운영 DB SSH 터널 SELECT 사용
    print("⚠ 제품·캐릭터 데이터는 로컬 파일 또는 SSH로 준비해야 합니다.")
    print("  scratch/detail/product_photo.png — 제품 사진 (투명 PNG)")
    print("  scratch/detail/char_sheet.png    — 김정신 정면 시트")
    print()

    product_path = Path(__file__).parent / "product_photo.jpg"
    if not product_path.exists():
        product_path = Path(__file__).parent / "product_photo.png"
    char_path = Path(__file__).parent / "char_sheet.png"

    product_bytes = product_path.read_bytes() if product_path.exists() else None
    char_bytes = char_path.read_bytes() if char_path.exists() else None

    return product_bytes, char_bytes


# ── 제품 정보 (운영 DB SELECT 기반 — 하드코딩) ──
class ProductInfo:
    """운영 DB products id=28 (ep155) 행의 읽기 전용 스냅샷."""
    name = "AROMA Herb Pack Green Tea Spa"
    name_ko = "자연바람 아로마 그린티 스파 스캘프 허브팩"
    shape = "bottle"      # 펌프 병
    description = (
        "A large, light green plastic bottle with a dark green pump dispenser. "
        "The label is a light cream color, featuring a prominent green wreath design "
        'enclosing the text "Natural Wind Herb Pack Green Tea Spa". '
        'The brand "AROMA" is at the top of the label.'
    )
    label_text = (
        "AROMA\nHerb Pack\nGreen Tea Spa\n"
        "아로마 그린티 스파 스칼프 허브 팩(두피팩)\nNATURAL WIND"
    )
    size_hint = "two_hands"
    size_ratio = 3.06       # DB 값
    palette = ["#2d5a27", "#c9a63c", "#ffffff"]  # 녹색·금색·흰색


PRODUCT = ProductInfo()

# ── 스타일 ──
STYLE_PROMPT = STYLE_PRESETS["korean_webtoon"]["prompt"]
DETAIL_STYLE = (
    f"{STYLE_PROMPT}, product detail page panel, clean composition, "
    "one focal element, negative space at top for the headline"
)

# ── 섹션 정의 (지시서 표 그대로) ──
SECTIONS = [
    {
        "id": 1,
        "name": "Intro 페인포인트",
        "head": "오후 3시, 두피에 불났다 🔥",
        "device": None,  # scene, 장치 없음
        "labels": [],
        "mechanism": "",
        "elements": ["오후 사무실", "떡진 앞머리", "붉어진 정수리 만지는 여성", "땀", "열기 표시"],
        "avoid": "과장된 혐오 표현, 비듬 덩어리",
        "has_char": True,
        "body_text": "하루 종일 기름진 두피, 가려움, 냄새… 혹시 나도? 두피 스트레스는 방치하면 탈모로 이어질 수 있습니다.",
    },
    {
        "id": 2,
        "name": "Hero 메인",
        "head": "두피는 시원하게, 모발은 찰랑이게",
        "device": "size_compare",
        "labels": ["1000g 대용량"],
        "mechanism": "",
        "elements": ["1000g 본품 크게", "얼음 조각", "녹차잎 연출", "욕실 선반"],
        "avoid": "다른 병, 글자 많음",
        "has_char": False,
        "body_text": "자연바람 아로마 그린티 스파 스캘프 허브팩 1000g. 쿨링 · 클렌징 · 트리트먼트를 한 번에.",
    },
    {
        "id": 3,
        "name": "Point 1 쿨링·클렌징",
        "head": "닿자마자 체감 -5도",
        "device": "zoom_inset",
        "labels": ["쿨링 · 각질 제거"],
        "mechanism": "파란 쿨링 입자가 열을 식히고 녹차 성분이 각질·피지를 들어올림",
        "elements": ["두피 단면 원형 인셋", "파란 쿨링 입자", "녹차 성분", "각질 피지"],
        "avoid": "붉은 염증 과장, 기름 웅덩이",
        "has_char": False,
        "body_text": "멘톨 성분이 두피 온도를 낮추고, 녹차 추출물이 묵은 각질과 피지를 부드럽게 제거합니다.",
    },
    {
        "id": 4,
        "name": "Point 2 올인원",
        "head": "뻣뻣함 NO, 물미역 머릿결",
        "device": "before_after",
        "labels": ["사용 전", "사용 후"],
        "mechanism": "",
        "elements": ["왼쪽 뻣뻣 푸석 모발 단면", "오른쪽 수분 코팅막 감싼 매끈 모발"],
        "avoid": "캐릭터 얼굴 두 번 다르게",
        "has_char": True,
        "body_text": "두피 팩 하나로 클렌징 + 트리트먼트 + 두피 케어까지. 헹구고 나면 손에 감기는 촉촉함.",
    },
    {
        "id": 5,
        "name": "Point 3 대용량",
        "head": "온 가족이 써도 1000g",
        "device": "icon_badges",
        "labels": ["남편", "자녀", "나"],
        "mechanism": "",
        "elements": ["가족 3인 아이콘 배지", "펌프 누르는 손"],
        "avoid": "인물 3명 풀샷(복잡)",
        "has_char": False,
        "body_text": "매일 써도 3개월 이상. 온 가족이 함께 쓰는 대용량 설계.",
    },
    {
        "id": 6,
        "name": "How to Use",
        "head": "홈 스파 5단계",
        "device": "steps",
        "labels": ["덜기", "도포", "마사지", "방치", "헹굼"],  # 5개 — 템플릿 4제한 오버라이드
        "mechanism": "",
        "elements": ["뾰족 공병에 덜기", "가르마 따라 도포", "지문 마사지", "헤어캡", "미온수"],
        "avoid": "손 3개, 패널 글자 깨짐",
        "has_char": True,
        "body_text": "① 적당량 덜기 → ② 가르마 따라 도포 → ③ 지문으로 두피 마사지 3분 → ④ 헤어캡 쓰고 5~10분 방치 → ⑤ 미온수로 깨끗이 헹굼.",
    },
    {
        "id": 7,
        "name": "Check List",
        "head": "이런 분께 추천",
        "device": "icon_badges",
        "labels": ["떡짐", "냄새", "열감", "예민"],
        "mechanism": "",
        "elements": ["체크 아이콘 4개", "공감 표정 캐릭터"],
        "avoid": "긴 문장",
        "has_char": True,
        "body_text": "✓ 오후만 되면 앞머리 떡지는 분 ✓ 두피 냄새가 신경 쓰이는 분 ✓ 두피 열감이 심한 분 ✓ 두피가 예민해 순한 제품을 찾는 분",
    },
    {
        "id": 8,
        "name": "Outro",
        "head": "오늘부터 자연바람만 남기세요 🍃",
        "device": None,  # scene + 카피 렌더
        "labels": [],
        "mechanism": "",
        "elements": ["상쾌한 표정", "제품 들고", "녹차잎 바람"],
        "avoid": "CTA 버튼 그림",
        "has_char": True,
        "body_text": "",
    },
]


def _build_section_prompt(sec: dict) -> str:
    """섹션 데이터 → GPT 이미지 프롬프트 조립."""
    parts = []

    # 1. 기본 스타일
    parts.append(DETAIL_STYLE)

    # 2. 캐릭터 유무
    if sec["has_char"]:
        parts.append(
            "Include the female character (김정신) from the character sheet reference. "
            "She guides the viewer through the product detail page."
        )
    else:
        parts.append(
            "No human character in this panel. Focus on the product, infographic, or abstract illustration."
        )

    # 3. 장치 프롬프트 (explain.py 재사용)
    if sec["device"]:
        # steps 장치는 5개 라벨 — _build_steps가 4개로 자르므로 직접 빌드
        if sec["device"] == "steps" and len(sec["labels"]) > 4:
            explain = _build_steps_5(sec["labels"])
        else:
            explain = build_explain_clause(
                device=sec["device"],
                labels=sec["labels"],
                product_name=PRODUCT.name,
                elements=sec["elements"],
                palette=[c for c in PRODUCT.palette],
                mechanism=sec["mechanism"],
                product_registered=True,
                allow_copy_text=True,  # 헤드 카피를 함께 렌더하므로
            )
        parts.append(explain)
    else:
        # scene (장치 없음)
        if sec["elements"]:
            parts.append("Scene elements: " + ", ".join(sec["elements"]) + ".")

    # 4. 카피 렌더 — 헤드만 (서브 없음, 그림 밖 본문이므로)
    copy_clause = build_copy_clause(
        head=sec["head"],
        sub="",
        copy_design={"font": "bold_gothic", "position": "top"},
    )
    parts.append(copy_clause)

    # 5. 제품 참조 지시
    parts.append(build_product_clause(PRODUCT, anatomy_hint=sec["has_char"]))

    # 6. avoid
    if sec["avoid"]:
        parts.append(f"AVOID drawing: {sec['avoid']}.")

    # 7. 팔레트 강조 (장치 프롬프트에 없을 때)
    if not sec["device"]:
        colors = ", ".join(PRODUCT.palette)
        parts.append(f"Use product palette for accent colors: {colors}.")

    # 8. photoreal·3D·8K 금지
    parts.append(
        "Do NOT use photorealistic, 3D render, 8K, or hyperdetailed styles. "
        "Keep everything in webtoon illustration style."
    )

    return "\n\n".join(parts)


def _build_steps_5(labels: list[str]) -> str:
    """steps 장치 5개 라벨 — explain.py의 4개 제한을 스크립트에서 오버라이드."""
    circled = ["①", "②", "③", "④", "⑤"]
    prefixed = []
    for i, lbl in enumerate(labels):
        prefixed.append(f"{circled[i]} {lbl}" if i < len(circled) else lbl)
    step_lines = [f"Panel {i+1}: {lbl}" for i, lbl in enumerate(prefixed)]
    return (
        "Advertising explainer panel in the same webtoon style. "
        "The character is the guide — holding or pointing at the product. "
        "The infographic element is drawn in the same webtoon line-and-color style, not photo. "
        "All text labels in Korean, spell exactly as specified. "
        "No other text, slogans, signs, or posters with words anywhere in the image. "
        "CRITICAL: reproduce the product label text exactly as on the reference photo. "
        "Clean composition, one focal element, leave negative space for labels. "
        f"DEVICE: Step mini-panels — the character holds the product at the top. "
        f"Below her, {len(prefixed)} small sequential panels showing usage steps: "
        f"{'. '.join(step_lines)}. "
        f"Each panel has its Korean label."
    )


def _composite_on_white(image_bytes: bytes) -> bytes:
    """투명 PNG를 흰 배경에 합성."""
    from PIL import Image
    img = Image.open(BytesIO(image_bytes))
    if img.mode == "RGBA":
        bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        buf = BytesIO()
        bg.convert("RGB").save(buf, format="PNG")
        return buf.getvalue()
    return image_bytes


def _downscale(image_bytes: bytes, max_side: int = 768) -> bytes:
    """참조 이미지 다운스케일."""
    from PIL import Image
    img = Image.open(BytesIO(image_bytes))
    w, h = img.size
    if max(w, h) <= max_side:
        return image_bytes
    ratio = max_side / max(w, h)
    img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
    buf = BytesIO()
    fmt = "PNG" if img.mode == "RGBA" else "JPEG"
    img.save(buf, format=fmt, quality=85)
    return buf.getvalue()


async def _generate_section(
    sec: dict,
    adapter,
    product_bytes: bytes | None,
    char_bytes: bytes | None,
) -> dict:
    """섹션 1개 생성 + 검사."""
    t0 = time.time()
    prompt = _build_section_prompt(sec)

    # 참조 이미지 준비
    ref_images = []
    ref_labels = []

    if sec["has_char"] and char_bytes:
        ref_images.append(_downscale(char_bytes))
        ref_labels.append("Character sheet: 김정신 (female, front view)")

    if product_bytes:
        ref_images.append(_downscale(_composite_on_white(product_bytes)))
        ref_labels.append(f"Product photo: {PRODUCT.name} ({PRODUCT.label_text})")

    print(f"  [S{sec['id']:02d}] 생성 시작: {sec['name']}...")
    result = await adapter.generate_image(
        prompt=prompt,
        reference_images=ref_images if ref_images else None,
        reference_labels=ref_labels if ref_labels else None,
        aspect_ratio="3:4",  # 4:5에 가장 가까운 GPT 지원 비율
    )

    img_bytes = result.image_bytes
    elapsed = time.time() - t0

    # 파일 저장
    out_path = OUT_DIR / f"s{sec['id']:02d}.png"
    out_path.write_bytes(img_bytes)
    print(f"  [S{sec['id']:02d}] 저장 완료: {out_path.name} ({elapsed:.1f}s)")

    # 검사
    copy_check = check_copy_text(img_bytes, sec["head"], "")
    anatomy_check = check_anatomy(img_bytes) if sec["has_char"] else {"hands": 0, "arms": 0, "ok": True}

    # 본문 텍스트 저장
    txt_path = OUT_DIR / f"s{sec['id']:02d}.txt"
    txt_path.write_text(
        f"[{sec['name']}]\n"
        f"헤드: {sec['head']}\n"
        f"본문: {sec['body_text']}\n",
        encoding="utf-8",
    )

    return {
        "section": sec["id"],
        "name": sec["name"],
        "head": sec["head"],
        "device": sec["device"],
        "has_char": sec["has_char"],
        "elapsed_s": round(elapsed, 1),
        "copy_check": copy_check,
        "anatomy_check": anatomy_check,
        "file": out_path.name,
    }


def _make_grid(count: int = 8):
    """8장을 4×2 격자로 합성."""
    from PIL import Image

    images = []
    for i in range(1, count + 1):
        p = OUT_DIR / f"s{i:02d}.png"
        if p.exists():
            images.append(Image.open(p))

    if not images:
        print("⚠ 이미지 없음 — grid 생성 건너뜀")
        return

    # 4열 × 2행
    cols, rows = 4, 2
    cell_w = images[0].width
    cell_h = images[0].height
    grid = Image.new("RGB", (cell_w * cols, cell_h * rows), (255, 255, 255))

    for idx, img in enumerate(images):
        r, c = divmod(idx, cols)
        grid.paste(img, (c * cell_w, r * cell_h))

    grid_path = OUT_DIR / "grid.png"
    grid.save(grid_path, format="PNG")
    print(f"  grid.png 저장: {grid_path}")


def _make_stack(count: int = 8):
    """8장을 세로로 이어붙이고 각 그림 아래에 본문 텍스트 흰 띠."""
    from PIL import Image, ImageDraw, ImageFont

    images = []
    texts = []
    for i in range(1, count + 1):
        p = OUT_DIR / f"s{i:02d}.png"
        t = OUT_DIR / f"s{i:02d}.txt"
        if p.exists():
            images.append(Image.open(p))
            if t.exists():
                content = t.read_text(encoding="utf-8")
                # 본문만 추출
                for line in content.split("\n"):
                    if line.startswith("본문: "):
                        texts.append(line[4:].strip())
                        break
                else:
                    texts.append("")
            else:
                texts.append("")

    if not images:
        print("⚠ 이미지 없음 — stack 생성 건너뜀")
        return

    img_w = images[0].width
    TEXT_BAR_H = 120  # 본문 텍스트 띠 높이
    total_h = sum(img.height + (TEXT_BAR_H if texts[i] else 0) for i, img in enumerate(images))
    stack = Image.new("RGB", (img_w, total_h), (255, 255, 255))
    draw = ImageDraw.Draw(stack)

    # 폰트 — 시스템 기본 사용
    try:
        font = ImageFont.truetype("malgun.ttf", 20)  # Windows 맑은고딕
    except OSError:
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/noto/NotoSansKR-Regular.otf", 20)
        except OSError:
            font = ImageFont.load_default()

    y = 0
    for i, img in enumerate(images):
        stack.paste(img, (0, y))
        y += img.height
        if texts[i]:
            # 흰 띠에 본문 텍스트
            draw.rectangle([(0, y), (img_w, y + TEXT_BAR_H)], fill=(255, 255, 255))
            # 텍스트 줄바꿈 (간단)
            text = texts[i]
            margin = 30
            max_chars = (img_w - margin * 2) // 12  # 대략적인 줄당 글자 수
            lines = []
            while text:
                lines.append(text[:max_chars])
                text = text[max_chars:]
            for li, line in enumerate(lines[:4]):  # 최대 4줄
                draw.text((margin, y + 10 + li * 26), line, fill=(50, 50, 50), font=font)
            y += TEXT_BAR_H

    stack_path = OUT_DIR / "stack.png"
    stack.save(stack_path, format="PNG")
    print(f"  stack.png 저장: {stack_path}")


async def main():
    print("=" * 60)
    print("상세페이지 scratch — 섹션 이미지 생성 테스트")
    print("=" * 60)
    print()

    # 1. 제품·캐릭터 데이터 로드
    product_bytes, char_bytes = _fetch_product_and_character()
    if not product_bytes:
        print("❌ product_photo.png가 없습니다. scratch/detail/ 에 준비해주세요.")
        print("   서버에서: scp bitnami@52.79.94.122:/home/bitnami/project-t/storage/products/<path> scratch/detail/product_photo.png")
        return
    print(f"✓ 제품 사진 로드: {len(product_bytes):,} bytes")
    if char_bytes:
        print(f"✓ 캐릭터 시트 로드: {len(char_bytes):,} bytes")
    else:
        print("⚠ 캐릭터 시트 없음 — 캐릭터 있음 섹션도 참조 없이 생성")
    print()

    # 2. GPT 어댑터
    adapter = get_openai_image_adapter()
    print(f"✓ GPT 어댑터 준비 완료 (model: gpt-image-2.5-sunburst)")
    print()

    # 3. 8장 순차 생성
    results = []
    t_total = time.time()
    for sec in SECTIONS:
        try:
            r = await _generate_section(sec, adapter, product_bytes, char_bytes)
            results.append(r)
        except Exception as e:
            print(f"  ❌ [S{sec['id']:02d}] 실패: {e}")
            results.append({
                "section": sec["id"],
                "name": sec["name"],
                "error": str(e),
            })
    total_elapsed = time.time() - t_total
    print()
    print(f"전체 소요: {total_elapsed:.0f}s")
    print()

    # 4. results.json
    summary = {
        "total_elapsed_s": round(total_elapsed, 1),
        "sections": results,
    }
    results_path = OUT_DIR / "results.json"
    results_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ results.json 저장: {results_path}")

    # 5. grid.png + stack.png
    print()
    _make_grid()
    _make_stack()
    print()
    print("완료!")


if __name__ == "__main__":
    asyncio.run(main())
