"""과금 서비스 — 하이브리드 과금 흐름.

Data-Model 8장:
  컷 생성 요청 → 구독 할당량 남았나?
    예 → cut_used += 1
    아니오 → credit_balances.balance 차감 + credit_transactions(reason=generation)
  → generation_logs 기록
"""

from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.billing.models import Subscription, CreditBalance, CreditTransaction, PLAN_QUOTAS


def ensure_subscription(user_id: int, db: Session) -> Subscription:
    """사용자의 구독 레코드를 가져오거나 free 플랜을 생성한다."""
    sub = db.query(Subscription).filter(
        Subscription.user_id == user_id,
        Subscription.status == "active",
    ).first()
    if not sub:
        sub = Subscription(
            user_id=user_id,
            plan="free",
            cut_quota=PLAN_QUOTAS["free"],
            cut_used=0,
        )
        db.add(sub)
        db.flush()
    return sub


def ensure_credit_balance(user_id: int, db: Session) -> CreditBalance:
    """크레딧 잔액 레코드를 가져오거나 생성한다."""
    bal = db.query(CreditBalance).filter(CreditBalance.user_id == user_id).first()
    if not bal:
        bal = CreditBalance(user_id=user_id, balance=100)  # 초기 100크레딧
        db.add(bal)
        db.flush()
        # 초기 지급 기록
        tx = CreditTransaction(
            user_id=user_id,
            delta=100,
            reason="subscription_grant",
            balance_after=100,
        )
        db.add(tx)
        db.flush()
    return bal


def check_can_generate(user_id: int, credits_needed: int, db: Session) -> dict:
    """생성 가능 여부를 확인한다. 가능하면 소스 정보를 반환."""
    sub = ensure_subscription(user_id, db)
    remaining_quota = sub.cut_quota - sub.cut_used

    if remaining_quota >= credits_needed:
        return {
            "can_generate": True,
            "source": "subscription",
            "quota_remaining": remaining_quota,
            "credits_needed": credits_needed,
        }

    # 구독 할당량 부족 → 크레딧 확인
    bal = ensure_credit_balance(user_id, db)
    quota_covers = max(remaining_quota, 0)
    credits_from_balance = credits_needed - quota_covers

    if bal.balance >= credits_from_balance:
        return {
            "can_generate": True,
            "source": "hybrid" if quota_covers > 0 else "credits",
            "quota_remaining": remaining_quota,
            "credits_from_balance": credits_from_balance,
            "credits_needed": credits_needed,
        }

    return {
        "can_generate": False,
        "source": "insufficient",
        "quota_remaining": remaining_quota,
        "credit_balance": bal.balance,
        "credits_needed": credits_needed,
        "shortfall": credits_from_balance - bal.balance,
    }


def charge_generation(user_id: int, credits: int, generation_log_id: int | None, db: Session) -> dict:
    """이미지 생성 비용을 차감한다. 구독 할당량 우선, 부족분은 크레딧."""
    sub = ensure_subscription(user_id, db)
    bal = ensure_credit_balance(user_id, db)

    remaining_quota = sub.cut_quota - sub.cut_used
    charged_from_quota = 0
    charged_from_credits = 0

    if remaining_quota >= credits:
        # 전액 구독 할당량으로
        sub.cut_used += credits
        charged_from_quota = credits
    elif remaining_quota > 0:
        # 하이브리드: 할당량 + 크레딧
        sub.cut_used += remaining_quota
        charged_from_quota = remaining_quota
        charged_from_credits = credits - remaining_quota
    else:
        # 전액 크레딧
        charged_from_credits = credits

    if charged_from_credits > 0:
        if bal.balance < charged_from_credits:
            raise HTTPException(
                status_code=402,
                detail=f"Insufficient credits: need {charged_from_credits}, have {bal.balance}",
            )
        bal.balance -= charged_from_credits
        tx = CreditTransaction(
            user_id=user_id,
            delta=-charged_from_credits,
            reason="generation",
            ref_log_id=generation_log_id,
            balance_after=bal.balance,
        )
        db.add(tx)

    return {
        "charged_from_quota": charged_from_quota,
        "charged_from_credits": charged_from_credits,
        "quota_remaining": sub.cut_quota - sub.cut_used,
        "credit_balance": bal.balance,
    }


def get_user_credits(user_id: int, db: Session) -> dict:
    """사용자의 크레딧 및 구독 정보를 반환한다."""
    sub = ensure_subscription(user_id, db)
    bal = ensure_credit_balance(user_id, db)

    return {
        "balance": bal.balance,
        "subscription": {
            "plan": sub.plan,
            "cut_quota": sub.cut_quota,
            "cut_used": sub.cut_used,
            "status": sub.status,
        },
    }
