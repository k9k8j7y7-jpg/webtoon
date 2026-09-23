#!/usr/bin/env python3
"""GPT Image 품질 실험 — Gemini vs OpenAI 비교.

앱 코드 수정 없이, 동일 프롬프트·참조 이미지로 OpenAI GPT Image를 호출해
Gemini 결과와 나란히 비교한다.

사용법 (서버에서 실행):
  cd /home/bitnami/project-t/backend
  pip install openai
  python ../scripts/gpt_image_test.py --title "여름날의 작은 기적"

또는 로컬에서 SSH 터널 사용:
  ssh -L 3307:localhost:3306 bitnami@52.79.94.122 -N &
  DB_HOST=127.0.0.1 DB_PORT=3307 python scripts/gpt_image_test.py --title "..."
"""

import sys
import os
import io
import argparse
import base64
import logging
from pathlib import Path
from datetime import datetime

# ── backend/ 를 import path 에 추가 ──
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")

# ── app 모듈 import ──
from app.config import get_settings
from app.database import SessionLocal
from app.storyboard.models import Cut
from app.characters.models import Character, CharacterImage, EpisodeCharacter
from app.locations.models import Location, LocationImage
from app.styles.models import Style, STYLE_PRESETS
from app.projects.models import Episode, ProjectMemory
from app.prompts.service import build_cut_prompt
from app.workflow.gate import get_aspect_ratio
import app.images.service as img_svc

logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")
logger = logging.getLogger("gpt_image_test")

# ── 상수 ──
QUALITY = "high"
RUNS_PER_CUT = 2
MAX_REF_IMAGES = 5
SERVER_BASE = "https://ssagda.com/WEBTOON"

ASPECT_RATIO_MAP = {
    "9:16": "1024x1536",
    "16:9": "1536x1024",
    "3:4":  "1024x1360",
    "4:3":  "1360x1024",
    "1:1":  "1024x1024",
}

OUTPUT_DIR = SCRIPT_DIR / "gpt_test_out"

# 대상 컷 번호 (cut_number 기준, 1-indexed)
TARGET_CUT_NUMBERS = [1, 4, 5]


# ── 이미지 로더 패치 (서버 /storage/ → HTTPS 또는 로컬) ──
def _load_image_bytes_auto(url: str) -> bytes | None:
    """로컬 존재 시 로컬, 아니면 서버에서 가져온다."""
    import httpx

    # 로컬 파일 시스템 (서버에서 실행 시)
    if url.startswith("/storage/"):
        local_path = Path(img_svc.LOCAL_STORAGE_DIR) / url.replace("/storage/", "")
        if local_path.exists():
            return local_path.read_bytes()
        # 로컬 없으면 서버 HTTPS
        full_url = f"{SERVER_BASE}/storage/{url.replace('/storage/', '')}"
    elif url.startswith("https://"):
        full_url = url
    else:
        logger.warning("Unknown URL format: %s", url)
        return None

    try:
        resp = httpx.get(full_url, timeout=30.0, follow_redirects=True)
        if resp.status_code == 200:
            return resp.content
        logger.warning("HTTP %d for %s", resp.status_code, full_url)
    except Exception as e:
        logger.warning("Failed to load %s: %s", full_url, e)
    return None


def patch_image_loader():
    """app.images.service._load_image_bytes 를 자동 감지 버전으로 교체."""
    img_svc._load_image_bytes = _load_image_bytes_auto


# ── 에피소드 검색 ──
def find_episode(title: str, db) -> Episode:
    """episodes.title로 에피소드를 찾는다. LIKE 검색."""
    episode = db.query(Episode).filter(Episode.title.like(f"%{title}%")).first()
    if not episode:
        # 전체 목록 출력 후 종료
        all_eps = db.query(Episode).filter(Episode.title.isnot(None)).all()
        print(f"ERROR: '{title}' 포함 에피소드 없음. 전체 목록:")
        for e in all_eps:
            cut_count = db.query(Cut).filter(Cut.episode_id == e.id).count()
            print(f"  id={e.id} proj={e.project_id} title=\"{e.title}\" cuts={cut_count}")
        sys.exit(1)
    return episode


# ── 컷 컨텍스트 로드 (generate_cut_image 1~5 단계 재현) ──
def load_cut_context(cut_id: str, episode_id: int, db):
    """프롬프트·참조 이미지·비율을 반환한다. DB 읽기만."""
    cut = db.query(Cut).filter(Cut.cut_id == cut_id).first()
    if not cut:
        raise ValueError(f"Cut {cut_id} not found")

    spec = cut.spec

    # 1. 캐릭터 참조
    char_ids = [
        c.get("character_id")
        for c in spec.get("characters", [])
        if c.get("character_id")
    ]
    ref_images, ref_labels, char_descs = img_svc._get_character_references(
        episode_id, char_ids, db, cut_spec=spec,
    )

    # 2. 장소 참조 (샷 타입 분기)
    location_id = spec.get("location_id")
    loc_desc, loc_is_photo = "", False
    shot_type = spec.get("shot", "full")
    TEXT_ONLY_SHOTS = frozenset({"bust", "close_up"})

    if location_id:
        loc_ref, loc_desc, loc_is_photo = img_svc._get_location_reference(
            episode_id, location_id, db,
        )
        if loc_ref and shot_type not in TEXT_ONLY_SHOTS:
            if len(ref_images) < MAX_REF_IMAGES:
                loc_ref = img_svc._downscale_image(loc_ref, max_long_side=768)
                ref_images.append(loc_ref)
                if loc_is_photo:
                    ref_labels.append(
                        "Location reference photograph — use ONLY for spatial layout "
                        "and furniture placement, REDRAW everything in illustration style"
                    )
                else:
                    ref_labels.append(
                        "Location background reference — style guide only, "
                        "do NOT reproduce as a separate image"
                    )

    # 2.5. 제품 참조
    product_desc = ""
    if spec.get("has_product", False):
        from app.products.models import Product
        products = db.query(Product).filter(
            Product.episode_id == episode_id, Product.sheet_url.isnot(None),
        ).all()
        for prod in products:
            if len(ref_images) < MAX_REF_IMAGES:
                prod_bytes = _load_image_bytes_auto(prod.sheet_url)
                if prod_bytes:
                    ref_images.append(prod_bytes)
                    ref_labels.append(
                        f"Product '{prod.name}' — illustration reference sheet"
                    )
            features = f" ({prod.features})" if prod.features else ""
            product_desc += f"Product '{prod.name}'{features} appears in this scene. "

    # 3. 스타일
    style = db.query(Style).filter(Style.episode_id == episode_id).first()
    style_prompt = (
        style.prompt_snippet if style else STYLE_PRESETS["korean_webtoon"]["prompt"]
    )

    # 4. 프로젝트 규칙 + 비율
    episode = db.query(Episode).filter(Episode.id == episode_id).first()
    if not episode:
        raise ValueError(f"Episode {episode_id} not found")

    pm = db.query(ProjectMemory).filter(
        ProjectMemory.project_id == episode.project_id,
    ).first()
    project_rules = pm.rules if pm else None
    aspect_ratio = get_aspect_ratio(episode.gate_status)

    # 5. 프롬프트 조립
    prompt = build_cut_prompt(
        cut_spec=spec,
        character_descs=char_descs,
        location_desc=loc_desc,
        style_prompt=style_prompt,
        project_rules=project_rules,
        loc_is_photo=loc_is_photo,
        aspect_ratio=aspect_ratio,
        product_desc=product_desc,
    )

    return prompt, ref_images, ref_labels, aspect_ratio, cut


# ── OpenAI 호출 ──
def generate_with_openai(prompt, ref_images, ref_labels, size_str, client, model):
    """OpenAI images.edit() 호출. (img_bytes, cost_info) 반환."""
    # 프롬프트 앞에 참조 라벨 추가 (Gemini 패턴과 동일)
    labeled_prompt = ""
    for i, label in enumerate(ref_labels):
        labeled_prompt += f"Reference Image {i + 1}: {label}\n"
    labeled_prompt += "\n" + prompt

    # 참조 이미지를 file-like 객체로 변환
    image_files = []
    for i, ref_bytes in enumerate(ref_images):
        buf = io.BytesIO(ref_bytes)
        buf.name = f"ref_{i}.png"
        image_files.append(buf)

    if not image_files:
        # edit은 최소 1장 필요 → generate 폴백
        response = client.images.generate(
            model=model,
            prompt=labeled_prompt,
            size=size_str,
            quality=QUALITY,
            n=1,
        )
    else:
        response = client.images.edit(
            model=model,
            image=image_files,
            prompt=labeled_prompt,
            size=size_str,
            quality=QUALITY,
            n=1,
        )

    img_data = base64.b64decode(response.data[0].b64_json)

    cost_info = {
        "model": model,
        "size": size_str,
        "quality": QUALITY,
        "usage": None,
    }
    if hasattr(response, "usage") and response.usage:
        cost_info["usage"] = {
            "input_tokens": getattr(response.usage, "input_tokens", None),
            "output_tokens": getattr(response.usage, "output_tokens", None),
            "total_tokens": getattr(response.usage, "total_tokens", None),
        }

    return img_data, cost_info


# ── 모델 조회 ──
def list_image_models(client) -> list[str]:
    """OpenAI API에서 image 포함 모델 목록을 가져온다."""
    models = client.models.list()
    return sorted([m.id for m in models if "image" in m.id.lower()])


# ── 메인 ──
def main():
    parser = argparse.ArgumentParser(description="GPT Image 품질 실험")
    parser.add_argument("--title", required=True, help="에피소드 제목 (LIKE 검색)")
    parser.add_argument("--cuts", type=str, default=None,
                        help="컷 번호 (쉼표 구분, 예: 1,4,5). 미지정 시 1,4,5")
    parser.add_argument("--model", type=str, default=None,
                        help="OpenAI 모델 ID. 미지정 시 자동 선택")
    args = parser.parse_args()

    settings = get_settings()

    # API 키 확인
    openai_key = os.environ.get("OPENAI_API_KEY") or settings.OPENAI_API_KEY
    if not openai_key:
        print("ERROR: OPENAI_API_KEY 가 .env 또는 환경변수에 없습니다.")
        sys.exit(1)

    from openai import OpenAI
    client = OpenAI(api_key=openai_key)

    # ── 1. 모델 목록 조회 ──
    print("OpenAI image 모델 목록 조회 중...")
    image_models = list_image_models(client)
    print(f"\n사용 가능한 image 모델 ({len(image_models)}개):")
    for m in image_models:
        print(f"  {m}")

    # 모델 선택
    if args.model:
        model = args.model
        if model not in image_models:
            print(f"\nWARNING: '{model}' 이 모델 목록에 없습니다. 그래도 시도합니다.")
    else:
        # images.edit 지원 + 최신 모델 자동 선택
        # gpt-image-2.5-sunburst 가 있으면 우선, 없으면 gpt-image-1 계열
        preferred = [
            "gpt-image-2.5-sunburst",
            "gpt-image-2.5-flare",
            "gpt-image-2",
            "gpt-image-1.5",
            "gpt-image-1",
        ]
        model = None
        for p in preferred:
            if p in image_models:
                model = p
                break
        if not model:
            model = image_models[-1] if image_models else "gpt-image-1"
            print(f"\nWARNING: 선호 모델 없음, 폴백: {model}")

    print(f"\n선택 모델: {model}")

    # ── 2. 에피소드·컷 조회 ──
    patch_image_loader()
    db = SessionLocal()
    try:
        episode = find_episode(args.title, db)
        episode_id = episode.id

        # 컷 목록 조회
        all_cuts = (
            db.query(Cut)
            .filter(Cut.episode_id == episode_id)
            .order_by(Cut.cut_number)
            .all()
        )
        if not all_cuts:
            print(f"ERROR: episode {episode_id} 에 컷이 없습니다.")
            sys.exit(1)

        # 대상 컷 선택
        cut_numbers = [int(x) for x in args.cuts.split(",")] if args.cuts else TARGET_CUT_NUMBERS
        target_cuts = []
        for cn in cut_numbers:
            matching = [c for c in all_cuts if c.cut_number == cn]
            if matching:
                target_cuts.append(matching[0])
            else:
                print(f"  WARNING: cut_number={cn} 없음 (최대 {all_cuts[-1].cut_number})")

        if not target_cuts:
            print("ERROR: 대상 컷이 없습니다.")
            sys.exit(1)

        # 비율 조회
        aspect_ratio = get_aspect_ratio(episode.gate_status)
        size_str = ASPECT_RATIO_MAP.get(aspect_ratio, "1024x1024")

        total_images = len(target_cuts) * RUNS_PER_CUT

        # ── 보고 ──
        print("\n" + "=" * 60)
        print("GPT Image 품질 실험 — 사전 보고")
        print("=" * 60)
        print(f"  에피소드:   id={episode_id}, title=\"{episode.title}\"")
        print(f"             project_id={episode.project_id}, 총 컷 수={len(all_cuts)}")
        print(f"  모델:       {model}")
        print(f"  엔드포인트: images.edit() (참조 이미지 포함)")
        print(f"  비율:       {aspect_ratio} → {size_str}")
        print(f"  품질:       {QUALITY}")
        print(f"  대상 컷:    {len(target_cuts)}개, 각 {RUNS_PER_CUT}회 = 총 {total_images}장")
        for tc in target_cuts:
            spec = tc.spec or {}
            chars = [ch.get("character_id", "?") for ch in spec.get("characters", [])]
            shot = spec.get("shot", "?")
            has_prod = spec.get("has_product", False)
            print(f"    {tc.cut_id} (#{tc.cut_number}): shot={shot}, chars={chars}, has_product={has_prod}")
        print(f"  예상 비용:  미확인 (토큰 기반 과금, 응답의 usage 필드로 확인)")
        print(f"  출력 경로:  {OUTPUT_DIR}")
        print("=" * 60)

        confirm = input('\n"실행해" 를 입력하면 생성을 시작합니다: ').strip()
        if confirm != "실행해":
            print("취소됨.")
            sys.exit(0)

        # ── 실행 ──
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        cost_log_path = OUTPUT_DIR / "cost_log.txt"
        cost_entries = []

        for tc in target_cuts:
            cut_id = tc.cut_id
            print(f"\n--- {cut_id} (#{tc.cut_number}) ---")

            try:
                prompt, ref_images, ref_labels, ar, cut = (
                    load_cut_context(cut_id, episode_id, db)
                )
            except Exception as e:
                print(f"  컨텍스트 로드 실패: {e}")
                continue

            print(f"  참조 이미지: {len(ref_images)}장")
            print(f"  프롬프트: {len(prompt)}자")

            # 프롬프트 저장
            prompt_path = OUTPUT_DIR / f"{cut_id}_prompt.txt"
            prompt_path.write_text(prompt, encoding="utf-8")

            # Gemini 원본 복사
            if cut.image_url:
                gemini_bytes = _load_image_bytes_auto(cut.image_url)
                if gemini_bytes:
                    (OUTPUT_DIR / f"{cut_id}_gemini.png").write_bytes(gemini_bytes)
                    print(f"  Gemini 원본 복사 완료")

            # OpenAI 생성
            for run in range(1, RUNS_PER_CUT + 1):
                print(f"  GPT 생성 #{run}...", end=" ", flush=True)
                try:
                    img_bytes, cost_info = generate_with_openai(
                        prompt, ref_images, ref_labels, size_str, client, model,
                    )
                    out_path = OUTPUT_DIR / f"{cut_id}_gpt_{run}.png"
                    out_path.write_bytes(img_bytes)
                    print(f"OK ({len(img_bytes):,} bytes)")

                    entry = (
                        f"{datetime.now().isoformat()} | {cut_id} run{run} | "
                        f"model={cost_info['model']} size={cost_info['size']} "
                        f"quality={cost_info['quality']} usage={cost_info['usage']}"
                    )
                    cost_entries.append(entry)
                    print(f"    {entry}")

                except Exception as e:
                    print(f"FAILED: {e}")
                    cost_entries.append(
                        f"{datetime.now().isoformat()} | {cut_id} run{run} | ERROR: {e}"
                    )

        # 비용 로그 저장
        cost_log_path.write_text("\n".join(cost_entries), encoding="utf-8")

        print(f"\n완료! 결과: {OUTPUT_DIR}")
        print(f"비용 로그: {cost_log_path}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
