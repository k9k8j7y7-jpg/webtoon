import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.database import get_db
from app.image_util import validate_and_process
from app.social.service import normalize_nickname, validate_nickname
from app.storage import upload_image
from app.users.models import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["users"])

AVATAR_SIZE = 512


def _me_dict(user: User) -> dict:
    return {
        "id": user.id,
        "display_name": user.display_name,
        "email": user.email,
        "provider": user.provider,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "is_admin": bool(user.is_admin),
        "nickname": user.nickname,
        "bio": user.bio,
        "avatar": user.avatar_path,
    }


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return _me_dict(current_user)


class ProfileUpdate(BaseModel):
    nickname: str
    bio: str | None = None


@router.put("/me/profile")
def update_profile(
    body: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """닉네임(필수·중복 불가, 대소문자 무시)·한 줄 소개 저장."""
    nickname = normalize_nickname(body.nickname)
    error = validate_nickname(nickname)
    if error:
        raise HTTPException(status_code=400, detail=error)

    bio = (body.bio or "").strip() or None
    if bio and len(bio) > 100:
        raise HTTPException(status_code=400, detail="소개는 100자 이내로 입력해 주세요")

    # 컬럼 collation(utf8mb4_unicode_ci)이 대소문자를 무시하므로 같은 규칙으로 사전 조회
    taken = db.query(User.id).filter(User.nickname == nickname, User.id != current_user.id).first()
    if taken:
        raise HTTPException(status_code=400, detail="이미 사용 중인 닉네임이에요")

    current_user.nickname = nickname
    current_user.bio = bio
    try:
        db.commit()
    except IntegrityError:  # 동시 저장 경합
        db.rollback()
        raise HTTPException(status_code=400, detail="이미 사용 중인 닉네임이에요")
    db.refresh(current_user)
    logger.info("profile updated user=%s nickname=%s", current_user.id, nickname)
    return _me_dict(current_user)


@router.post("/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """프로필 이미지 — 공용 검증(JPEG/PNG/WEBP·20MB) 후 가운데 정사각 512px."""
    raw = await file.read()
    try:
        processed, mime = validate_and_process(
            raw,
            original_content_type=file.content_type or "",
            original_filename=file.filename or "",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    processed = _square_thumb(processed)
    url = upload_image(processed, f"avatars/{current_user.id}", mime_type="image/jpeg")
    current_user.avatar_path = url
    db.commit()
    db.refresh(current_user)
    return _me_dict(current_user)


def _square_thumb(jpeg_bytes: bytes) -> bytes:
    import io
    from PIL import Image

    img = Image.open(io.BytesIO(jpeg_bytes)).convert("RGB")
    side = min(img.size)
    left = (img.width - side) // 2
    top = (img.height - side) // 2
    img = img.crop((left, top, left + side, top + side))
    if side > AVATAR_SIZE:
        img = img.resize((AVATAR_SIZE, AVATAR_SIZE), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=88)
    return out.getvalue()

# /me/packets → packets/router.py로 이동 (3단계)
