from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.jwt import create_access_token
from app.auth.oauth import EXCHANGE_HANDLERS
from app.users.models import User
from app.packets.service import grant_packets

router = APIRouter(prefix="/auth", tags=["auth"])


class OAuthCallbackRequest(BaseModel):
    code: str


class AuthResponse(BaseModel):
    access_token: str
    user: dict


@router.post("/{provider}/callback")
async def oauth_callback(
    provider: str,
    body: OAuthCallbackRequest,
    db: Session = Depends(get_db),
):
    if provider not in EXCHANGE_HANDLERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider: {provider}",
        )

    handler = EXCHANGE_HANDLERS[provider]
    try:
        oauth_info = await handler(body.code)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"OAuth exchange failed: {str(e)}",
        )

    # Find or create user
    user = (
        db.query(User)
        .filter(User.provider == oauth_info.provider, User.provider_uid == oauth_info.provider_uid)
        .first()
    )

    is_new = False
    if user is None:
        user = User(
            provider=oauth_info.provider,
            provider_uid=oauth_info.provider_uid,
            email=oauth_info.email,
            display_name=oauth_info.display_name,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        # 환영 패킷 3개 지급
        try:
            grant_packets(user.id, 3, db)
            db.commit()
        except Exception:
            pass  # 지급 실패해도 가입은 진행
        is_new = True
    else:
        # Update profile on login
        if oauth_info.email:
            user.email = oauth_info.email
        if oauth_info.display_name:
            user.display_name = oauth_info.display_name
        db.commit()
        db.refresh(user)

    access_token = create_access_token(user.id)

    return {
        "access_token": access_token,
        "user": {
            "id": user.id,
            "display_name": user.display_name,
            "email": user.email,
            "provider": user.provider,
        },
        "welcome_packets": 3 if is_new else 0,
    }
