"""제품 자산 모델 — 광고 에피소드의 제품 참조 이미지."""

from sqlalchemy import Column, BigInteger, String, DateTime, ForeignKey, Text
from sqlalchemy.sql import func

from app.database import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    episode_id = Column(BigInteger, ForeignKey("episodes.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    features = Column(Text, nullable=True)  # 제품 특징 메모
    photo_url = Column(String(500), nullable=True)  # 업로드 실사 사진
    sheet_url = Column(String(500), nullable=True)  # 스타일 변환된 시트
    status = Column(String(20), nullable=False, default="draft")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
