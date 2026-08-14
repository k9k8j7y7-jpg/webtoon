"""과금 모델 — Data-Model 8장."""

from sqlalchemy import Column, BigInteger, Integer, String, Enum, DateTime, ForeignKey, func
from app.database import Base


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False, index=True)
    plan = Column(String(50), nullable=False, default="free")
    status = Column(Enum("active", "canceled", "past_due"), default="active")
    cut_quota = Column(Integer, nullable=False, default=0)
    cut_used = Column(Integer, nullable=False, default=0)
    renews_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())


class CreditBalance(Base):
    __tablename__ = "credit_balances"

    user_id = Column(BigInteger, ForeignKey("users.id"), primary_key=True)
    balance = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class CreditTransaction(Base):
    __tablename__ = "credit_transactions"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False, index=True)
    delta = Column(Integer, nullable=False)
    reason = Column(Enum("subscription_grant", "purchase", "generation", "refund"), nullable=False)
    ref_log_id = Column(BigInteger)
    balance_after = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


# 플랜별 할당량
PLAN_QUOTAS = {
    "free": 50,
    "basic": 200,
    "pro": 1000,
}
