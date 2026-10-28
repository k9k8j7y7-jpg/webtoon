"""게이트 3 — 제품 자산 엔드포인트."""

import os
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User
from app.projects.models import Project, Episode
from app.products.models import Product
from app.storage import upload_image, LOCAL_STORAGE_DIR
from app.adapters.gemini_image import get_image_adapter
from app.styles.models import Style, STYLE_PRESETS
from app.packets.service import require_packets, charge_packets
from app.storyboard.models import GenerationLog

router = APIRouter(tags=["gate3-products"])
logger = logging.getLogger(__name__)

VALID_SHAPES = {"bottle", "can", "box", "tube", "flat", "pouch", "other"}
VALID_SIZE_HINTS = {"palm", "one_hand", "two_hands", "tabletop", "large"}


class ProductCreate(BaseModel):
    name: str
    features: str | None = None


class ProductUpdate(BaseModel):
    name: str | None = None
    name_ko: str | None = None
    features: str | None = None
    description: str | None = None
    shape: str | None = None
    size_hint: str | None = None
    size_ratio: float | None = None
    label_text: str | None = None


@router.get("/projects/{project_id}/episodes/{episode_id}/products")
async def list_products(
    project_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_episode_for_user(db, project_id, episode_id, current_user.id)
    products = db.query(Product).filter(Product.episode_id == episode_id).all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "name_ko": p.name_ko,
            "features": p.features,
            "description": p.description,
            "shape": p.shape,
            "size_hint": p.size_hint,
            "size_ratio": p.size_ratio,
            "label_text": p.label_text,
            "holding_photo_url": p.holding_photo_url,
            "photo_url": p.photo_url,
            "sheet_url": p.sheet_url,
            "status": p.status,
            "photo_newer_than_sheet": _is_photo_newer(p),
        }
        for p in products
    ]


@router.post("/projects/{project_id}/episodes/{episode_id}/products")
async def create_product(
    project_id: int,
    episode_id: int,
    body: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_episode_for_user(db, project_id, episode_id, current_user.id)
    product = Product(
        episode_id=episode_id,
        name=body.name,
        features=body.features,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return {"id": product.id, "name": product.name, "features": product.features}


@router.put("/products/{product_id}")
async def update_product(
    product_id: int,
    body: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if body.name is not None:
        product.name = body.name
    if body.name_ko is not None:
        product.name_ko = body.name_ko
    if body.features is not None:
        product.features = body.features
    if body.description is not None:
        product.description = body.description
    if body.shape is not None and body.shape in VALID_SHAPES:
        product.shape = body.shape
    if body.size_hint is not None and body.size_hint in VALID_SIZE_HINTS:
        product.size_hint = body.size_hint
    if body.size_ratio is not None:
        product.size_ratio = body.size_ratio
    if body.label_text is not None:
        product.label_text = body.label_text
    db.commit()
    return {
        "id": product.id, "name": product.name, "name_ko": product.name_ko,
        "features": product.features, "description": product.description,
        "shape": product.shape, "size_hint": product.size_hint,
        "size_ratio": product.size_ratio, "label_text": product.label_text,
    }


@router.delete("/products/{product_id}")
async def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(product)
    db.commit()
    return {"deleted": True}


@router.post("/products/{product_id}/photo")
async def upload_product_photo(
    product_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """제품 참고 사진 업로드 (일반 이미지 — 참조 생성용)."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    from app.image_util import validate_and_process

    raw = await file.read()
    try:
        processed, mime = validate_and_process(
            raw,
            original_content_type=file.content_type or "",
            original_filename=file.filename or "",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    ext = "jpg" if "jpeg" in mime else "png"
    url = upload_image(
        image_bytes=processed,
        path_prefix=f"episodes/{product.episode_id}/products/{product.id}",
        filename=f"photo.{ext}",
        mime_type=mime,
    )
    product.photo_url = url
    db.commit()

    return {"id": product.id, "photo_url": url}


@router.post("/products/{product_id}/holding-photo")
async def upload_holding_photo(
    product_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """들고 찍은 사진 업로드 (크기 비율 측정용, 일반 이미지)."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    from app.image_util import validate_and_process
    raw = await file.read()
    try:
        processed, mime = validate_and_process(
            raw, original_content_type=file.content_type or "",
            original_filename=file.filename or "",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    url = upload_image(
        image_bytes=processed,
        path_prefix=f"episodes/{product.episode_id}/products/{product.id}",
        filename="holding.jpg",
        mime_type=mime,
    )
    product.holding_photo_url = url
    db.commit()
    return {"id": product.id, "holding_photo_url": url}


@router.post("/products/{product_id}/analyze")
async def analyze_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """제품 사진 비전 분석 (0패킷). 결과를 제안으로 반환, 저장은 PUT으로."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if not product.photo_url:
        raise HTTPException(status_code=400, detail="제품 사진을 먼저 업로드해주세요")

    from app.images.service import _load_image_bytes
    from app.image_util import composite_on_white
    from google.genai import types
    from app.adapters.gemini import get_client, AI_TOKENS_SHORT

    photo_bytes = _load_image_bytes(product.photo_url)
    if not photo_bytes:
        raise HTTPException(status_code=400, detail="제품 사진을 읽을 수 없습니다")

    ref_bytes = composite_on_white(photo_bytes)
    client = get_client()

    # 1. 제품 사진 분석
    vision_resp = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            types.Part.from_bytes(data=ref_bytes, mime_type="image/jpeg"),
            (
                "Analyze this product image. Return a JSON object with these fields:\n"
                "- name: product name visible on the label (in its original language)\n"
                "- name_ko: product name in Korean (translate if label is in another language, "
                "or Korean brand alias if commonly known — e.g. '밀본 엘루쥬다' for 'MILBON Elujuda')\n"
                "- colors: comma-separated list of dominant colors IN KOREAN (예: 흰색, 주황색, 베이지)\n"
                "- label_text: ALL text visible on the product label, transcribed exactly as printed "
                "(line breaks as \\n)\n"
                "- shape: one of: bottle, can, box, tube, flat, pouch, other\n"
                "- size_hint: estimated size category: palm (fits in palm), one_hand (gripped in one hand), "
                "two_hands (needs both hands), tabletop (sits on table, too big to hold), large (bigger)\n"
                "- description: visual description in English under 100 words — shape silhouette, "
                "material/finish, cap/nozzle type, color zones, distinctive design elements\n"
                "Return ONLY the JSON object, no markdown."
            ),
        ],
        config=types.GenerateContentConfig(
            temperature=0.2,
            max_output_tokens=AI_TOKENS_SHORT,
        ),
    )

    from app.adapters.gemini import parse_ai_json
    analysis = parse_ai_json(vision_resp.text)

    # 2. 들고 사진 있으면 size_ratio 추정
    size_ratio = None
    if product.holding_photo_url:
        holding_bytes = _load_image_bytes(product.holding_photo_url)
        if holding_bytes:
            ratio_resp = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    types.Part.from_bytes(data=holding_bytes, mime_type="image/jpeg"),
                    (
                        "A person is holding a product in this photo.\n"
                        "1. Measure the PRODUCT HEIGHT in pixels (top to bottom of the product).\n"
                        "2. Measure the HAND LENGTH in pixels (wrist to middle fingertip).\n"
                        "3. Compute ratio = product_px / hand_px.\n"
                        "A typical hand-held bottle is ratio 1.0~1.5 (product is TALLER than the hand).\n"
                        "A small lip balm is ratio 0.3~0.5 (product is shorter than the hand).\n"
                        "Return ONLY: {\"product_px\": N, \"hand_px\": N, \"ratio\": R}\n"
                        "No other keys or text."
                    ),
                ],
                config=types.GenerateContentConfig(
                    temperature=0.2,
                    max_output_tokens=1024,
                ),
            )
            try:
                import json as _json
                import re as _re
                raw_text = ratio_resp.text.strip()
                # parse_ai_json 시도, 실패 시 정규식 폴백
                try:
                    ratio_data = parse_ai_json(raw_text)
                except Exception:
                    # JSON 블록 직접 추출
                    m = _re.search(r'\{[^}]+\}', raw_text)
                    ratio_data = _json.loads(m.group()) if m else {}

                product_px = float(ratio_data.get("product_px", 0))
                hand_px = float(ratio_data.get("hand_px", 0))
                raw_ratio = float(ratio_data.get("ratio", 0))

                # 교차검증: product_px/hand_px 직접 계산
                if product_px > 0 and hand_px > 0:
                    computed = product_px / hand_px
                    # 모델의 ratio와 직접 계산이 크게 다르면 직접 계산 우선
                    if raw_ratio > 0 and abs(computed - raw_ratio) / max(computed, raw_ratio) > 0.3:
                        logger.warning("ratio mismatch: model=%.2f computed=%.2f, using computed",
                                       raw_ratio, computed)
                    size_ratio = round(computed, 2)
                elif raw_ratio > 0:
                    size_ratio = round(raw_ratio, 2)
                else:
                    size_ratio = None

                logger.info("size_ratio raw: product_px=%s hand_px=%s model_ratio=%s → final=%s",
                            product_px, hand_px, raw_ratio, size_ratio)

                if size_ratio and size_ratio > 0:
                    # size_hint 보정
                    if size_ratio < 0.5:
                        analysis["size_hint"] = "palm"
                    elif size_ratio <= 1.3:
                        analysis["size_hint"] = "one_hand"
                    elif size_ratio <= 2.5:
                        analysis["size_hint"] = "two_hands"
                    else:
                        analysis["size_hint"] = "tabletop"
                else:
                    size_ratio = None
            except Exception as e:
                logger.warning("size_ratio extraction failed: %s", e)

    result = {
        "name": analysis.get("name", product.name),
        "name_ko": analysis.get("name_ko", ""),
        "colors": analysis.get("colors", ""),
        "label_text": analysis.get("label_text", ""),
        "shape": analysis.get("shape", "other"),
        "size_hint": analysis.get("size_hint", "one_hand"),
        "description": analysis.get("description", ""),
        "size_ratio": size_ratio,
    }
    logger.info("Product %d analyzed: shape=%s size=%s ratio=%s name_ko=%s",
                product_id, result["shape"], result["size_hint"], size_ratio, result["name_ko"])
    return result


@router.post("/products/{product_id}/generate-sheet")
async def generate_product_sheet(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """제품 사진 → 스타일 변환 시트 생성 (1패킷)."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if not product.photo_url:
        raise HTTPException(status_code=400, detail="제품 사진을 먼저 업로드해주세요")

    require_packets(current_user.id, 1, db)

    episode = db.query(Episode).filter(Episode.id == product.episode_id).first()
    style = db.query(Style).filter(Style.episode_id == product.episode_id).first()
    style_prompt = style.prompt_snippet if style else STYLE_PRESETS["korean_webtoon"]["prompt"]

    # 1단계: 사진에서 제품 외형 텍스트 추출 (비전)
    from app.images.service import _load_image_bytes
    from app.image_util import composite_on_white
    photo_bytes = _load_image_bytes(product.photo_url)
    if not photo_bytes:
        raise HTTPException(status_code=400, detail="제품 사진을 읽을 수 없습니다")

    # 투명 PNG → 흰 배경 합성본을 비전·참조용으로 사용 (원본 미변경)
    ref_bytes = composite_on_white(photo_bytes)

    from google.genai import types
    from app.adapters.gemini import get_client, AI_TOKENS_SHORT

    client = get_client()
    vision_response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            types.Part.from_bytes(data=ref_bytes, mime_type="image/jpeg"),
            (
                "Describe this product's visual appearance in English, under 150 words. "
                "Focus on EXACT SHAPE first: silhouette outline (angular/rounded shoulders, "
                "straight/tapered/curved body, neck width vs body width ratio), cap/pump/nozzle "
                "type and proportions, height-to-width aspect ratio. "
                "Then: color, material/finish (matte/glossy/transparent), label layout, "
                "brand text if visible, distinctive design elements. "
                "Describe as precise technical reference for an illustrator who must match "
                "the exact bottle/package silhouette."
            ),
        ],
        config=types.GenerateContentConfig(
            temperature=0.3,
            max_output_tokens=AI_TOKENS_SHORT,
        ),
    )
    product_desc = vision_response.text.strip()

    # 2단계: 텍스트+참조사진→일러스트 생성
    adapter = get_image_adapter()
    features_text = f" Features: {product.features}." if product.features else ""
    gen_prompt = (
        f"Product illustration, single item centered on white background. "
        f"CRITICAL: Match the reference photo's exact silhouette — bottle/package outline, "
        f"shoulder shape, body proportions, cap/pump structure, height-to-width ratio. "
        f"Only change the rendering style to illustration. "
        f"{product_desc}.{features_text} "
        f"{style_prompt}. "
        f"Clean detailed product illustration, no characters, no extra text, "
        f"white background."
    )
    result = await adapter.generate_image(
        prompt=gen_prompt,
        reference_images=[ref_bytes],
        reference_labels=["Product photo — match this exact silhouette and proportions"],
        aspect_ratio="1:1",
    )

    url = upload_image(
        image_bytes=result.image_bytes,
        path_prefix=f"episodes/{product.episode_id}/products/{product.id}",
        filename="sheet.png",
        mime_type=result.mime_type,
    )
    product.sheet_url = url
    product.status = "approved"

    # 패킷 차감
    project = db.query(Project).filter(Project.id == episode.project_id).first()
    gen_log = GenerationLog(
        episode_id=product.episode_id,
        project_id=episode.project_id,
        user_id=current_user.id,
        kind="product",
        model=result.model,
        model_tier="flash",
        cost_usd=0.02,
        credits_charged=0,
        packets_charged=1,
    )
    db.add(gen_log)
    db.flush()
    charge_packets(current_user.id, 1, "generation", gen_log.id, db)

    db.commit()

    return {"id": product.id, "sheet_url": url, "status": "approved"}


def _is_photo_newer(product: Product) -> bool:
    """사진이 시트보다 새로운지 mtime 비교. 시트 없으면 False."""
    if not product.photo_url or not product.sheet_url:
        return False
    try:
        def _local_path(url: str) -> Path:
            return Path(LOCAL_STORAGE_DIR) / url.replace("/storage/", "")
        photo_path = _local_path(product.photo_url)
        sheet_path = _local_path(product.sheet_url)
        if photo_path.exists() and sheet_path.exists():
            return photo_path.stat().st_mtime > sheet_path.stat().st_mtime
    except Exception:
        pass
    return False


def _get_episode_for_user(db, project_id, episode_id, user_id):
    project = db.query(Project).filter(
        Project.id == project_id, Project.user_id == user_id, Project.deleted_at.is_(None)
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    episode = db.query(Episode).filter(
        Episode.id == episode_id, Episode.project_id == project_id, Episode.deleted_at.is_(None)
    ).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    return episode
