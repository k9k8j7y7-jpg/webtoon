"""패킷 엔드포인트 — 잔량 + 사용 내역."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User

router = APIRouter(tags=["packets"])


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


@router.get("/me/packets/history")
def get_my_packet_history(
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """패킷 사용 내역 (최신순)."""
    rows = db.execute(
        text(
            "SELECT id, delta, reason, ref_log_id, balance_after, created_at "
            "FROM packet_transactions "
            "WHERE user_id = :uid "
            "ORDER BY created_at DESC "
            "LIMIT :lim OFFSET :off"
        ),
        {"uid": current_user.id, "lim": limit, "off": offset},
    ).fetchall()

    # 총 건수
    total_row = db.execute(
        text("SELECT COUNT(*) FROM packet_transactions WHERE user_id = :uid"),
        {"uid": current_user.id},
    ).fetchone()

    # 잔량
    bal_row = db.execute(
        text("SELECT balance FROM packet_balances WHERE user_id = :uid"),
        {"uid": current_user.id},
    ).fetchone()

    reason_labels = {
        "purchase": "결제 충전",
        "generation": "이미지 생성",
        "refund": "생성 실패 환불",
        "admin_grant": "관리자 지급",
    }

    return {
        "balance": bal_row[0] if bal_row else 0,
        "total": total_row[0],
        "transactions": [
            {
                "id": r[0],
                "delta": r[1],
                "reason": r[2],
                "reason_label": reason_labels.get(r[2], r[2]),
                "ref_log_id": r[3],
                "balance_after": r[4],
                "created_at": r[5].isoformat() if r[5] else None,
            }
            for r in rows
        ],
    }
