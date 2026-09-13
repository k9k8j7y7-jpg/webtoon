"""토스페이먼츠 결제 API."""

import base64
import logging
import uuid
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User
from app.payments.products import get_product, list_products

logger = logging.getLogger(__name__)
router = APIRouter(tags=["payments"])

TOSS_CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm"


# ---------- Schemas ----------

class OrderRequest(BaseModel):
    product_code: str


class ConfirmRequest(BaseModel):
    payment_key: str
    order_id: str
    amount: int


# ---------- Endpoints ----------

@router.get("/payments/products")
def get_products():
    """상품 목록 조회."""
    return list_products()


@router.post("/payments/orders")
def create_order(
    req: OrderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """주문 생성 → orderId + clientKey 반환."""
    product = get_product(req.product_code)
    if not product:
        raise HTTPException(400, "존재하지 않는 상품입니다")

    settings = get_settings()
    order_id = f"EZITOON_{current_user.id}_{uuid.uuid4().hex[:12]}"

    db.execute(
        text(
            "INSERT INTO orders (user_id, order_id, product_code, amount, packet_delta, status) "
            "VALUES (:uid, :oid, :code, :amount, :packets, 'pending')"
        ),
        {
            "uid": current_user.id,
            "oid": order_id,
            "code": product["code"],
            "amount": product["amount"],
            "packets": product["packets"],
        },
    )
    db.commit()

    logger.info("Order created: user=%s, order=%s, product=%s", current_user.id, order_id, product["code"])

    return {
        "order_id": order_id,
        "amount": product["amount"],
        "order_name": product["name"],
        "client_key": settings.TOSS_CLIENT_KEY,
        "customer_key": f"user_{current_user.id}",
    }


@router.post("/payments/confirm")
def confirm_payment(
    req: ConfirmRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """토스 승인 콜백 → 서버 승인 → 패킷 지급."""
    settings = get_settings()

    # 1. 주문 조회 (행 잠금)
    row = db.execute(
        text(
            "SELECT id, user_id, amount, packet_delta, status "
            "FROM orders WHERE order_id = :oid FOR UPDATE"
        ),
        {"oid": req.order_id},
    ).fetchone()

    if not row:
        raise HTTPException(400, "주문을 찾을 수 없습니다")

    order_id_pk, order_user_id, order_amount, packet_delta, status = row

    # 멱등: 이미 완료된 주문
    if status == "paid":
        db.rollback()
        return {"status": "already_paid", "message": "이미 처리된 주문입니다"}

    if status != "pending":
        raise HTTPException(400, f"처리할 수 없는 주문 상태입니다: {status}")

    # 소유자 검증
    if order_user_id != current_user.id:
        raise HTTPException(403, "본인의 주문이 아닙니다")

    # 금액 검증 (조작 방지)
    if req.amount != order_amount:
        logger.warning(
            "Amount mismatch! order=%s, expected=%d, got=%d, user=%s",
            req.order_id, order_amount, req.amount, current_user.id,
        )
        db.execute(
            text("UPDATE orders SET status = 'failed' WHERE order_id = :oid"),
            {"oid": req.order_id},
        )
        db.commit()
        raise HTTPException(400, "결제 금액이 일치하지 않습니다")

    # 2. 토스 승인 API 호출
    auth = base64.b64encode(f"{settings.TOSS_SECRET_KEY}:".encode()).decode()

    try:
        with httpx.Client(timeout=30) as client:
            resp = client.post(
                TOSS_CONFIRM_URL,
                json={
                    "paymentKey": req.payment_key,
                    "orderId": req.order_id,
                    "amount": req.amount,
                },
                headers={
                    "Authorization": f"Basic {auth}",
                    "Content-Type": "application/json",
                },
            )
    except httpx.RequestError as e:
        logger.error("Toss API request failed: %s", e)
        raise HTTPException(502, "결제 승인 요청에 실패했습니다. 잠시 후 다시 시도해주세요.")

    if resp.status_code != 200:
        error_data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        logger.error("Toss confirm failed: status=%d, body=%s", resp.status_code, error_data)
        db.execute(
            text("UPDATE orders SET status = 'failed' WHERE order_id = :oid"),
            {"oid": req.order_id},
        )
        db.commit()
        raise HTTPException(400, error_data.get("message", "결제 승인에 실패했습니다"))

    # 3. 승인 성공 → 주문 완료 + 패킷 지급
    now = datetime.utcnow()
    db.execute(
        text(
            "UPDATE orders SET status = 'paid', payment_key = :pk, paid_at = :now "
            "WHERE order_id = :oid"
        ),
        {"pk": req.payment_key, "now": now, "oid": req.order_id},
    )

    # 패킷 지급 (reason=purchase)
    from app.packets.service import _ensure_balance
    _ensure_balance(current_user.id, db)
    bal_row = db.execute(
        text("SELECT balance FROM packet_balances WHERE user_id = :uid FOR UPDATE"),
        {"uid": current_user.id},
    ).fetchone()
    old_balance = bal_row[0]
    new_balance = old_balance + packet_delta
    db.execute(
        text("UPDATE packet_balances SET balance = :bal WHERE user_id = :uid"),
        {"bal": new_balance, "uid": current_user.id},
    )
    db.execute(
        text(
            "INSERT INTO packet_transactions (user_id, delta, reason, ref_log_id, balance_after) "
            "VALUES (:uid, :delta, 'purchase', NULL, :bal)"
        ),
        {"uid": current_user.id, "delta": packet_delta, "bal": new_balance},
    )

    db.commit()

    logger.info(
        "Payment confirmed: order=%s, user=%s, packets=%d, balance=%d",
        req.order_id, current_user.id, packet_delta, new_balance,
    )

    return {
        "status": "paid",
        "packets_granted": packet_delta,
        "balance": new_balance,
    }


@router.get("/me/orders")
def get_my_orders(
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """내 구매 내역 조회."""
    rows = db.execute(
        text(
            "SELECT order_id, product_code, amount, packet_delta, status, paid_at, created_at "
            "FROM orders WHERE user_id = :uid "
            "ORDER BY created_at DESC LIMIT :lim OFFSET :off"
        ),
        {"uid": current_user.id, "lim": limit, "off": offset},
    ).fetchall()

    total_row = db.execute(
        text("SELECT COUNT(*) FROM orders WHERE user_id = :uid"),
        {"uid": current_user.id},
    ).fetchone()

    status_labels = {
        "pending": "결제 대기",
        "paid": "결제 완료",
        "failed": "결제 실패",
        "cancelled": "취소",
    }

    return {
        "total": total_row[0],
        "orders": [
            {
                "order_id": r[0],
                "product_code": r[1],
                "amount": r[2],
                "packet_delta": r[3],
                "status": r[4],
                "status_label": status_labels.get(r[4], r[4]),
                "paid_at": r[5].isoformat() if r[5] else None,
                "created_at": r[6].isoformat() if r[6] else None,
            }
            for r in rows
        ],
    }
