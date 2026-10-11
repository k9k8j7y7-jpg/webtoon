from sqlalchemy import Column, BigInteger, String, DateTime
from sqlalchemy.sql import func

from app.database import Base


class PushSubscription(Base):
    """웹푸시 구독 (step32). 기기·브라우저당 1행, endpoint UNIQUE."""
    __tablename__ = "push_subscriptions"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, nullable=False, index=True)
    endpoint = Column(String(500), nullable=False, unique=True)
    p256dh = Column(String(200), nullable=False)
    auth = Column(String(100), nullable=False)
    user_agent = Column(String(300), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
