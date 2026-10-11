from sqlalchemy import Column, BigInteger, Boolean, String, Enum, DateTime, JSON, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base

# step32 DB 기본값과 동일 — 키가 빠진 행은 true로 간주
DEFAULT_NOTIFY_PREFS = {"new_episode": True, "comment": True, "reply": True, "inquiry": True}


class User(Base):
    __tablename__ = "users"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    provider = Column(Enum("google", "kakao", "naver", name="provider_enum"), nullable=False)
    provider_uid = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True)
    display_name = Column(String(100), nullable=True)
    # 작가 프로필 (step30) — 공개 화면에는 display_name(OAuth 실명) 대신 nickname만 노출
    nickname = Column(String(20), nullable=True, unique=True)
    bio = Column(String(100), nullable=True)
    avatar_path = Column(String(500), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    is_admin = Column(Boolean, nullable=False, default=False, server_default="0")
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    # 알림 종류별 웹푸시 수신 여부 (step32). 알림센터 기록은 설정과 무관하게 항상 남음
    notify_prefs = Column(JSON, nullable=False, default=lambda: dict(DEFAULT_NOTIFY_PREFS))

    __table_args__ = (
        UniqueConstraint("provider", "provider_uid", name="uq_provider"),
    )
