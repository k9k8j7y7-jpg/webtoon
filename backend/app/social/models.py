from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base


class AuthorSubscription(Base):
    """작가 구독 (step30). billing의 subscriptions(플랜)와 별개 테이블."""
    __tablename__ = "author_subscriptions"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    follower_id = Column(BigInteger, nullable=False)
    author_id = Column(BigInteger, nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("follower_id", "author_id", name="uk_author_sub"),
    )


class Notification(Base):
    """알림센터 항목 (step30). type: new_episode / comment / reply / inquiry_answer ..."""
    __tablename__ = "notifications"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, nullable=False)
    type = Column(String(30), nullable=False)
    title = Column(String(200), nullable=False)
    body = Column(String(500), nullable=True)
    link = Column(String(500), nullable=True)
    actor_id = Column(BigInteger, nullable=True)
    is_read = Column(Boolean, nullable=False, default=False, server_default="0")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
