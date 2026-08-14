"""과금 엔드포인트 — API-Spec 9장."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User
from app.billing.service import get_user_credits

router = APIRouter(tags=["billing"])


@router.get("/me/credits")
async def my_credits(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """크레딧 잔액 + 구독 정보 조회."""
    return get_user_credits(current_user.id, db)
