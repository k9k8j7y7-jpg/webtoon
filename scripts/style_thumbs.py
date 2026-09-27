#!/usr/bin/env python3
"""스타일 썸네일 생성 — 게이트3 스타일 카드용 정사각 이미지.

지시서: docs/지시서-스타일썸네일.md
게이트5와 같은 스타일 프롬프트(STYLE_PRESETS) + 같은 프롬프트 골격(build_cut_prompt)으로
스타일별 대표 장면을 1:1로 생성해 frontend/public/styles/{key}.jpg 로 저장한다.
로컬 Gemini API 직접 호출 — 패킷 차감 없음, DB 접근 없음.

사용법 (저장소 루트에서):
  python scripts/style_thumbs.py --dry-run --all      # 프롬프트만 출력 + docs/스타일썸네일-프롬프트.md 저장
  python scripts/style_thumbs.py --keys korean_webtoon,sd_gag
  python scripts/style_thumbs.py --all                # 기존 파일은 건너뜀
  python scripts/style_thumbs.py --keys anime --force  # 덮어쓰기
"""

import sys
import io
import asyncio
import argparse
from pathlib import Path

# ── backend/ 를 import path 에 추가 + .env 먼저 로드 (IMAGE_MODEL은 import 시점 상수) ──
SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")

# ── app 모듈 import ──
from PIL import Image
from app.config import get_settings
from app.styles.models import STYLE_PRESETS
from app.prompts.service import build_cut_prompt, LOCATION_REFRAME
from app.adapters.gemini_image import get_image_adapter, IMAGE_MODEL

# ── 상수 ──
ASPECT_RATIO = "1:1"
MAX_LONG_SIDE = 768
JPEG_QUALITY = 85
OUTPUT_DIR = ROOT_DIR / "frontend" / "public" / "styles"
PROMPTS_MD = ROOT_DIR / "docs" / "스타일썸네일-프롬프트.md"

# ── 장면 표 (지시서 그대로) — key: (shot, action, location_desc) ──
SCENES = {
    "korean_webtoon": (
        "bust",
        "A young Korean woman in her 20s sits by a cafe window holding a warm coffee cup, soft afternoon sunlight on her face, a gentle relaxed smile",
        "Cozy modern cafe interior, large window, wooden table, potted plant",
    ),
    "romance": (
        "bust",
        "A high-school boy and girl in uniforms face each other shyly under falling cherry blossom petals, she tucks hair behind her ear",
        "Spring school path lined with cherry trees in full bloom, petals in the air",
    ),
    "sd_gag": (
        "medium",
        "A chibi office worker with a tiny body and huge head weeps with joy in front of a steaming pot of ramen, chopsticks raised triumphantly",
        "Tiny kitchen at night, single overhead lamp, steam rising",
    ),
    "kakao_webtoon": (
        "bust",
        "A man in a dark coat glances back over his shoulder under an umbrella on a rainy night, neon reflections on his wet face, intense eyes",
        "Rain-soaked city alley at night, neon signs reflecting on wet pavement",
    ),
    "action_shonen": (
        "medium",
        "A teenage boy lunges forward throwing a punch straight at the viewer, hair and jacket whipping back, gritted teeth, speed lines",
        "Rooftop at dusk, dramatic low angle, clouds streaking",
    ),
    "semi_realistic": (
        "bust",
        "A woman in her 30s in profile, backlit by a window, fine skin texture and loose hair strands catching the light, calm thoughtful expression",
        "Quiet apartment living room, sheer curtain, late morning light",
    ),
    "anime": (
        "bust",
        "A high-school girl on a school rooftop reaches one hand up toward the sky, wind lifting her hair and ribbon, bright hopeful eyes",
        "Bright blue sky with cumulus clouds, rooftop fence, sunny day",
    ),
    "watercolor": (
        "medium",
        "An elderly grandmother in a hanbok-style apron sits on a wooden porch gently patting a small brown dog beside her",
        "Traditional Korean hanok courtyard, persimmon tree with ripe fruit, soft autumn light",
    ),
    "pixel_art": (
        "medium",
        "A girl in a hoodie sits on a bench eating an ice cream bar in front of a small convenience store at evening",
        "Convenience store facade with glowing sign, street lamp, evening sky gradient",
    ),
    "fantasy_rpg": (
        "bust",
        "A female knight in ornate silver armor raises a glowing magic sword, determined gaze, magical light particles swirling around the blade",
        "Castle gate at twilight, banners, mist",
    ),
    "cyberpunk": (
        "bust",
        "A young man in a hooded jacket looks up at holographic signs, neon pink and cyan light on his face, rain drops on his hood",
        "Futuristic city street at night, towering holographic advertisements, rain",
    ),
    "storybook": (
        "medium",
        "A small child and a teddy bear read a picture book together under a blanket by flashlight, both wide-eyed with wonder",
        "Cozy bedroom at night, blanket fort, stars through the window",
    ),
    "emotional_romance": (
        "bust",
        "A young couple on a train: the woman has fallen asleep on the man's shoulder, he glances down at her with a soft smile, golden sunset through the window",
        "Train interior at sunset, warm light streaming through windows",
    ),
    "marvel": (
        "medium",
        "A muscular superheroine in a bold red-and-gold suit and cape leaps off a skyscraper edge toward the viewer, fists clenched, dramatic foreshortening",
        "City skyline at sunset from a rooftop, dramatic clouds",
    ),
    "western_fantasy": (
        "medium",
        "An old bearded wizard in a weathered cloak hands a glowing map to a young farm boy in a bustling medieval market, torchlight on their faces",
        "Medieval European market square at dusk, stone buildings, torches, market stalls",
    ),
}


# "medium"은 SHOT_SCALE_GUIDE에 없어 full로 폴백되므로 스크립트에서 명시 매핑 (도도 결정 2026-09-27)
SHOT_OVERRIDE = {
    "action_shonen": "bust",
    "western_fantasy": "bust",
    "sd_gag": "full",
    "watercolor": "full",
    "pixel_art": "full",
    "storybook": "full",
    "marvel": "full",
}


def resolve_shot(key: str) -> str:
    return SHOT_OVERRIDE.get(key, SCENES[key][0])


def build_prompt(key: str) -> str:
    """게이트5 컷과 같은 골격의 프롬프트를 조립한다."""
    _, action, location_desc = SCENES[key]
    prompt = build_cut_prompt(
        cut_spec={"characters": [], "action": action, "shot": resolve_shot(key)},
        character_descs={},
        location_desc=location_desc,
        style_prompt=STYLE_PRESETS[key]["prompt"],
        aspect_ratio=ASPECT_RATIO,
    )
    # 썸네일은 장소 이미지를 첨부하지 않으므로 첨부 이미지 전제 문장(LOCATION_REFRAME) 제거.
    # build_cut_prompt에 끄는 플래그가 없어 조립 결과에서 해당 part만 뺀다.
    stripped = prompt.replace(f"{LOCATION_REFRAME}. ", "")
    if stripped == prompt:
        raise RuntimeError(f"{key}: LOCATION_REFRAME 제거 실패 — prompts/service.py 문구 변경 확인")
    return stripped


def save_jpeg(image_bytes: bytes, mime_type: str, out_path: Path) -> tuple[int, int]:
    """mime과 무관하게 Pillow로 열어 RGB·긴 변 768px·JPEG q85로 저장한다."""
    img = Image.open(io.BytesIO(image_bytes))
    if img.mode != "RGB":
        img = img.convert("RGB")
    img.thumbnail((MAX_LONG_SIDE, MAX_LONG_SIDE), Image.LANCZOS)
    img.save(out_path, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return img.size


def write_prompts_md(keys: list[str]) -> None:
    lines = [
        "# 스타일 썸네일 프롬프트 (dry-run)",
        "",
        f"> `scripts/style_thumbs.py --dry-run` 출력. 비율 {ASPECT_RATIO}, "
        "`build_cut_prompt(characters=[], character_descs={})` 골격.",
        "",
    ]
    for key in keys:
        shot = resolve_shot(key)
        preset = STYLE_PRESETS[key]
        lines += [
            f"## {key} — {preset['label']} ({preset['tier']}, shot={shot})",
            "",
            "```",
            build_prompt(key),
            "```",
            "",
        ]
    PROMPTS_MD.write_text("\n".join(lines), encoding="utf-8")


async def generate(keys: list[str], force: bool) -> None:
    adapter = get_image_adapter()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    done, skipped, failed = [], [], []

    for key in keys:
        out_path = OUTPUT_DIR / f"{key}.jpg"
        if out_path.exists() and not force:
            print(f"[skip] {key} — 기존 파일 있음 (--force로 덮어쓰기)")
            skipped.append(key)
            continue
        print(f"[gen ] {key} ...", flush=True)
        try:
            result = await adapter.generate_image(prompt=build_prompt(key), aspect_ratio=ASPECT_RATIO)
            size = save_jpeg(result.image_bytes, result.mime_type, out_path)
            kb = out_path.stat().st_size / 1024
            print(f"[ ok ] {key} → {out_path.relative_to(ROOT_DIR)} ({size[0]}x{size[1]}, {kb:.0f}KB, src {result.mime_type})")
            done.append(key)
        except Exception as e:
            print(f"[FAIL] {key}: {e}")
            failed.append(key)

    print(f"\n완료 {len(done)} / 건너뜀 {len(skipped)} / 실패 {len(failed)}")
    if failed:
        print("실패 키: " + ",".join(failed))


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    parser = argparse.ArgumentParser(description="스타일 썸네일 생성")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--keys", help="쉼표 구분 스타일 키 (예: korean_webtoon,sd_gag)")
    group.add_argument("--all", action="store_true", help="15종 전체")
    parser.add_argument("--dry-run", action="store_true", help="프롬프트만 출력 (생성 안 함)")
    parser.add_argument("--force", action="store_true", help="기존 파일 덮어쓰기")
    args = parser.parse_args()

    if args.all:
        keys = list(STYLE_PRESETS.keys())
    else:
        keys = [k.strip() for k in args.keys.split(",") if k.strip()]

    unknown = [k for k in keys if k not in STYLE_PRESETS or k not in SCENES]
    if unknown:
        print(f"ERROR: 알 수 없는 키: {', '.join(unknown)}")
        sys.exit(1)

    print(f"IMAGE_MODEL={IMAGE_MODEL}, 키 {len(keys)}개")

    if args.dry_run:
        for key in keys:
            print(f"\n## {key} (shot={resolve_shot(key)})\n{build_prompt(key)}")
        if args.all:
            write_prompts_md(keys)
            print(f"\n저장: {PROMPTS_MD.relative_to(ROOT_DIR)}")
        return

    if not get_settings().GEMINI_API_KEY:
        print("ERROR: GEMINI_API_KEY 없음 (backend/.env)")
        sys.exit(1)

    asyncio.run(generate(keys, args.force))


if __name__ == "__main__":
    main()
