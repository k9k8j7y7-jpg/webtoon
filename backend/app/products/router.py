"""게이트 3 — 제품 자산 엔드포인트 (광고 에피소드용)."""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User
from app.projects.models import Project, Episode
from app.products.models import Product
from app.storage import upload_image
from app.adapters.gemini_image import get_image_adapter
from app.styles.models import Style, STYLE_PRESETS
from app.packets.service import require_packets, charge_packets
from app.storyboard.models import GenerationLog
from app.workflow.gate import is_ad_episode

router = APIRouter(tags=["gate3-products"])


class ProductCreate(BaseModel):
    name: str
    features: str | None = None


class ProductUpdate(BaseModel):
    name: str | None = None
    features: str | None = None


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
            "features": p.features,
            "photo_url": p.photo_url,
            "sheet_url": p.sheet_url,
            "status": p.status,
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
    if body.features is not None:
        product.features = body.features
    db.commit()
    return {"id": product.id, "name": product.name, "features": product.features}


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
    """제품 참고 사진 업로드."""
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

    url = upload_image(
        image_bytes=processed,
        path_prefix=f"episodes/{product.episode_id}/products/{product.id}",
        filename="photo.jpg",
        mime_type=mime,
    )
    product.photo_url = url
    product.sheet_url = None  # 새 사진 업로드 시 기존 시트 초기화
    db.commit()

    return {"id": product.id, "photo_url": url}


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
    photo_bytes = _load_image_bytes(product.photo_url)
    if not photo_bytes:
        raise HTTPException(status_code=400, detail="제품 사진을 읽을 수 없습니다")

    from google.genai import types
    from app.adapters.gemini import get_client, AI_TOKENS_SHORT

    client = get_client()
    vision_response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            types.Part.from_bytes(data=photo_bytes, mime_type="image/jpeg"),
            (
                "Describe this product's visual appearance in English, under 100 words. "
                "Focus on: shape, color, material, distinctive features, brand text if visible, "
                "size proportions. Describe as if telling an illustrator what to draw."
            ),
        ],
        config=types.GenerateContentConfig(
            temperature=0.3,
            max_output_tokens=AI_TOKENS_SHORT,
        ),
    )
    product_desc = vision_response.text.strip()

    # 2단계: 텍스트→일러스트 생성 (사진 미참조 — 플랜C 패턴)
    adapter = get_image_adapter()
    features_text = f" Features: {product.features}." if product.features else ""
    gen_prompt = (
        f"Product illustration sheet, single item centered on white background. "
        f"{product_desc}.{features_text} "
        f"{style_prompt}. "
        f"Clean line art, detailed product illustration, no characters, no text, "
        f"white background, product design reference sheet."
    )
    result = await adapter.generate_image(prompt=gen_prompt, aspect_ratio="1:1")

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
