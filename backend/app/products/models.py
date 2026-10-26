"""제품 자산 모델."""

from sqlalchemy import Column, BigInteger, String, DateTime, ForeignKey, Text, Float
from sqlalchemy.sql import func

from app.database import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    episode_id = Column(BigInteger, ForeignKey("episodes.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    features = Column(Text, nullable=True)  # 제품 특징 메모
    description = Column(Text, nullable=True)  # 자동 추출 요약 (색·라벨·재질)
    shape = Column(String(20), nullable=True)  # bottle/can/box/tube/flat/pouch/other
    size_hint = Column(String(20), nullable=True)  # palm/one_hand/two_hands/tabletop/large
    size_ratio = Column(Float, nullable=True)  # 제품 높이 ÷ 손 길이
    holding_photo_url = Column(String(500), nullable=True)  # 들고 찍은 사진
    label_text = Column(Text, nullable=True)  # 라벨에 적힌 글자 그대로
    photo_url = Column(String(500), nullable=True)  # 업로드 실사 사진 (투명 PNG)
    sheet_url = Column(String(500), nullable=True)  # 스타일 변환된 시트
    status = Column(String(20), nullable=False, default="draft")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
