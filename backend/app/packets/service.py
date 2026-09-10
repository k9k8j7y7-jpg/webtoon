"""패킷 차감 서비스 — 3단계 핵심.

차감 흐름:
  1. check_packets(user_id, needed) → 잔량 확인
  2. reserve_packets(user_id, needed) → 원자적 차감 (SELECT FOR UPDATE)
  3. confirm_packets(user_id, delta, log_id) → 트랜잭션 기록
  4. refund_packets(user_id, delta, log_id) → 실패 시 환불

동시 요청 보호: SELECT ... FOR UPDATE로 행 잠금 → 음수 방지.
"""

import logging
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi import HTTPException

logger = logging.getLogger(__name__)


def _ensure_balance(user_id: int, db: Session) -> int:
    """packet_balances 행이 없으면 0으로 생성, 현재 잔량 반환."""
    row = db.execute(
        text("SELECT balance FROM packet_balances WHERE user_id = :uid"),
        {"uid": user_id},
    ).fetchone()
    if row is None:
        db.execute(
            text("INSERT INTO packet_balances (user_id, balance) VALUES (:uid, 0)"),
            {"uid": user_id},
        )
        db.flush()
        return 0
    return row[0]


def check_packets(user_id: int, needed: int, db: Session) -> dict:
    """잔량 확인만 (잠금 없음). 라우터 사전 검증용."""
    balance = _ensure_balance(user_id, db)
    return {
        "balance": balance,
        "needed": needed,
        "sufficient": balance >= needed,
    }


def require_packets(user_id: int, needed: int, db: Session):
    """잔량 부족이면 402 HTTPException을 발생시킨다."""
    info = check_packets(user_id, needed, db)
    if not info["sufficient"]:
        raise HTTPException(
            status_code=402,
            detail={
                "message": "패킷이 부족합니다",
                "balance": info["balance"],
                "needed": needed,
                "shortfall": needed - info["balance"],
            },
        )


def charge_packets(
    user_id: int,
    amount: int,
    reason: str,
    ref_log_id: int | None,
    db: Session,
    description: str = "",
) -> int:
    """원자적 패킷 차감. SELECT FOR UPDATE로 동시 요청 보호.

    Returns: 차감 후 잔량
    Raises: HTTPException(402) if insufficient
    """
    # 행 잠금 + 잔량 조회
    row = db.execute(
        text("SELECT balance FROM packet_balances WHERE user_id = :uid FOR UPDATE"),
        {"uid": user_id},
    ).fetchone()

    if row is None:
        db.execute(
            text("INSERT INTO packet_balances (user_id, balance) VALUES (:uid, 0)"),
            {"uid": user_id},
        )
        db.flush()
        balance = 0
    else:
        balance = row[0]

    if balance < amount:
        raise HTTPException(
            status_code=402,
            detail={
                "message": "패킷이 부족합니다",
                "balance": balance,
                "needed": amount,
                "shortfall": amount - balance,
            },
        )

    new_balance = balance - amount
    db.execute(
        text("UPDATE packet_balances SET balance = :bal WHERE user_id = :uid"),
        {"bal": new_balance, "uid": user_id},
    )

    # 트랜잭션 기록
    db.execute(
        text(
            "INSERT INTO packet_transactions (user_id, delta, reason, ref_log_id, balance_after) "
            "VALUES (:uid, :delta, :reason, :ref, :bal)"
        ),
        {
            "uid": user_id,
            "delta": -amount,
            "reason": reason,
            "ref": ref_log_id,
            "bal": new_balance,
        },
    )

    logger.warning(
        "Packet charge: user=%s, amount=%d, reason=%s, ref=%s, balance=%d→%d",
        user_id, amount, reason, ref_log_id, balance, new_balance,
    )
    return new_balance


def refund_packets(
    user_id: int,
    amount: int,
    ref_log_id: int | None,
    db: Session,
) -> int:
    """실패 시 패킷 환불. 트랜잭션에 reason=refund로 기록.

    Returns: 환불 후 잔량
    """
    row = db.execute(
        text("SELECT balance FROM packet_balances WHERE user_id = :uid FOR UPDATE"),
        {"uid": user_id},
    ).fetchone()

    balance = row[0] if row else 0

    new_balance = balance + amount
    db.execute(
        text("UPDATE packet_balances SET balance = :bal WHERE user_id = :uid"),
        {"bal": new_balance, "uid": user_id},
    )

    db.execute(
        text(
            "INSERT INTO packet_transactions (user_id, delta, reason, ref_log_id, balance_after) "
            "VALUES (:uid, :delta, :reason, :ref, :bal)"
        ),
        {
            "uid": user_id,
            "delta": amount,
            "reason": "refund",
            "ref": ref_log_id,
            "bal": new_balance,
        },
    )

    logger.warning(
        "Packet refund: user=%s, amount=%d, ref=%s, balance=%d→%d",
        user_id, amount, ref_log_id, balance, new_balance,
    )
    return new_balance


def grant_packets(
    user_id: int,
    amount: int,
    db: Session,
) -> int:
    """관리자 패킷 지급.

    Returns: 지급 후 잔량
    """
    _ensure_balance(user_id, db)

    row = db.execute(
        text("SELECT balance FROM packet_balances WHERE user_id = :uid FOR UPDATE"),
        {"uid": user_id},
    ).fetchone()

    balance = row[0]
    new_balance = balance + amount

    db.execute(
        text("UPDATE packet_balances SET balance = :bal WHERE user_id = :uid"),
        {"bal": new_balance, "uid": user_id},
    )

    db.execute(
        text(
            "INSERT INTO packet_transactions (user_id, delta, reason, ref_log_id, balance_after) "
            "VALUES (:uid, :delta, :reason, NULL, :bal)"
        ),
        {
            "uid": user_id,
            "delta": amount,
            "reason": "admin_grant",
            "bal": new_balance,
        },
    )

    logger.warning(
        "Packet grant: user=%s, amount=%d, balance=%d→%d",
        user_id, amount, balance, new_balance,
    )
    return new_balance
