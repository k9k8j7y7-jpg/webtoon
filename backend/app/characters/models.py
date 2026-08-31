from sqlalchemy import (
    Column, BigInteger, String, Text, Enum, DateTime, Boolean,
    ForeignKey, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class EpisodeCharacter(Base):
    """에피소드-캐릭터 연결 테이블 (P2 신설)."""
    __tablename__ = "episode_characters"

    episode_id = Column(BigInteger, ForeignKey("episodes.id"), primary_key=True)
    character_id = Column(BigInteger, ForeignKey("characters.id"), primary_key=True)


class Character(Base):
    __tablename__ = "characters"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    ref_key = Column(String(50), nullable=False)
    episode_id = Column(BigInteger, ForeignKey("episodes.id"), nullable=False, index=True)
    project_id = Column(BigInteger, ForeignKey("projects.id"), nullable=True, index=True)
    user_id = Column(BigInteger, nullable=True)
    name = Column(String(100), nullable=True)
    gender = Column(String(20), nullable=True)
    age_group = Column(String(20), nullable=True)
    hair_style = Column(String(50), nullable=True)
    hair_color = Column(String(50), nullable=True)
    body_type = Column(String(30), nullable=True)
    mood = Column(String(50), nullable=True)
    detail_notes = Column(Text, nullable=True)
    style = Column(String(50), nullable=True)
    appearance_en = Column(String(500), nullable=True)
    description = Column(String(2000), nullable=True)
    status = Column(
        Enum("draft", "approved", "invalidated", name="char_status_enum"),
        default="draft",
    )
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    images = relationship("CharacterImage", back_populates="character", lazy="joined")
    outfits = relationship("CharacterOutfit", back_populates="character", lazy="joined")

    __table_args__ = (
        UniqueConstraint("episode_id", "ref_key", name="uq_char_ref"),
    )


class CharacterImage(Base):
    __tablename__ = "character_images"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    character_id = Column(BigInteger, ForeignKey("characters.id"), nullable=False, index=True)
    type = Column(Enum("front", "side", "expression", name="img_type_enum"), nullable=False)
    label = Column(String(50), nullable=True)
    image_url = Column(String(500), nullable=False)
    seed = Column(BigInteger, nullable=True)

    character = relationship("Character", back_populates="images")


class CharacterOutfit(Base):
    __tablename__ = "character_outfits"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    character_id = Column(BigInteger, ForeignKey("characters.id"), nullable=False)
    outfit_key = Column(String(50), nullable=False)
    label = Column(String(100), nullable=True)
    description = Column(String(500), nullable=True)
    is_default = Column(Boolean, default=False)

    character = relationship("Character", back_populates="outfits")
    images = relationship("OutfitImage", back_populates="outfit", lazy="joined")

    __table_args__ = (
        UniqueConstraint("character_id", "outfit_key", name="uq_outfit"),
    )


class OutfitImage(Base):
    __tablename__ = "outfit_images"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    outfit_id = Column(BigInteger, ForeignKey("character_outfits.id"), nullable=False, index=True)
    image_url = Column(String(500), nullable=False)

    outfit = relationship("CharacterOutfit", back_populates="images")
