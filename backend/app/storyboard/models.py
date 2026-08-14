"""컷 + 무효화 조회 + 회계 로그 모델 — Data-Model 6~7장."""

from sqlalchemy import (
    Column, BigInteger, Integer, String, Enum, DateTime,
    ForeignKey, JSON, Numeric,
)
from sqlalchemy.sql import func

from app.database import Base


class Cut(Base):
    __tablename__ = "cuts"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    cut_id = Column(String(50), nullable=False)
    episode_id = Column(BigInteger, ForeignKey("episodes.id"), nullable=False)
    scene_id = Column(String(50), nullable=False)
    cut_number = Column(Integer, nullable=False)
    status = Column(
        Enum("pending", "approved", "regenerating", "invalidated", name="cut_status_enum"),
        default="pending",
    )
    spec = Column(JSON, nullable=False)
    image_url = Column(String(500), nullable=True)
    composed_image_url = Column(String(500), nullable=True)
    composed_renderer_version = Column(String(50), nullable=True)
    composed_at = Column(DateTime, nullable=True)
    prev_image_url = Column(String(500), nullable=True)
    seed = Column(BigInteger, nullable=True)
    version = Column(Integer, default=1)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class CutAssetRef(Base):
    """무효화 조회 전용 — JSON used_references를 행으로 펼쳐 인덱싱."""
    __tablename__ = "cut_asset_refs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    cut_id = Column(String(50), nullable=False, index=True)
    episode_id = Column(BigInteger, nullable=False)
    asset_type = Column(Enum("character", "location", "style", name="asset_type_enum"), nullable=False)
    asset_ref = Column(String(50), nullable=False)


class GenerationLog(Base):
    """회계 append-only — 매 이미지 생성마다 1행."""
    __tablename__ = "generation_logs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    cut_id = Column(String(50), nullable=True)
    episode_id = Column(BigInteger, nullable=False)
    project_id = Column(BigInteger, nullable=False)
    user_id = Column(BigInteger, nullable=False)
    kind = Column(Enum("cut", "character", "location", name="gen_kind_enum"), nullable=False)
    model = Column(String(80), nullable=False)
    model_tier = Column(Enum("flash", "pro", name="model_tier_enum"), default="flash")
    cost_usd = Column(Numeric(10, 5), nullable=False, default=0)
    credits_charged = Column(Integer, nullable=False, default=0)
    seed = Column(BigInteger, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
