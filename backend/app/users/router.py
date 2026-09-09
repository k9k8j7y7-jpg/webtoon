from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User

router = APIRouter(tags=["users"])


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "display_name": current_user.display_name,
        "email": current_user.email,
        "provider": current_user.provider,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
    }


@router.get("/me/packets")
def get_my_packets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """패킷 잔량 조회."""
    row = db.execute(
        text("SELECT balance FROM packet_balances WHERE user_id = :uid"),
        {"uid": current_user.id},
    ).fetchone()
    return {"balance": row[0] if row else 0}
