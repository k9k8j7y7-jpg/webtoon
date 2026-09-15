from sqlalchemy import Column, BigInteger, Integer, String, Enum, DateTime, ForeignKey, JSON, VARCHAR, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class SchemaMigration(Base):
    """마이그레이션 버전 추적 (P2 신설)."""
    __tablename__ = "schema_migrations"

    version = Column(VARCHAR(50), primary_key=True)
    applied_at = Column(DateTime, nullable=False, server_default=func.now())


class Series(Base):
    """시리즈(연작) 테이블 (P2 신설)."""
    __tablename__ = "series"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(BigInteger, ForeignKey("projects.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    bible = Column(JSON, nullable=True)
    outline = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="series_list")


class Project(Base):
    __tablename__ = "projects"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    genre = Column(String(50), nullable=True)
    language = Column(String(10), default="ko")
    visibility = Column(Enum("private", "public", name="visibility_enum"), default="private")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime, nullable=True)

    episodes = relationship("Episode", back_populates="project", lazy="dynamic")
    memory = relationship("ProjectMemory", back_populates="project", uselist=False)
    series_list = relationship("Series", back_populates="project", lazy="dynamic")


class ProjectMemory(Base):
    __tablename__ = "project_memory"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(BigInteger, ForeignKey("projects.id"), nullable=False, unique=True)
    rules = Column(JSON, nullable=False, default=dict)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="memory")


class Episode(Base):
    __tablename__ = "episodes"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    project_id = Column(BigInteger, ForeignKey("projects.id"), nullable=False, index=True)
    series_id = Column(BigInteger, ForeignKey("series.id"), nullable=True)
    episode_no = Column(BigInteger, nullable=False)
    title = Column(String(200), nullable=True)
    logline = Column(String(500), nullable=True)
    synopsis = Column(String(5000), nullable=True)
    script = Column(JSON, nullable=True)
    gate_status = Column(JSON, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    showcase = Column(Boolean, nullable=False, default=False)
    showcase_category = Column(Enum("short", "series", "ad", name="showcase_category_enum"), nullable=True)
    share_token = Column(VARCHAR(36), nullable=True, unique=True, index=True)
    view_count = Column(Integer, nullable=False, default=0, server_default="0")
    like_count = Column(Integer, nullable=False, default=0, server_default="0")
    deleted_at = Column(DateTime, nullable=True)

    project = relationship("Project", back_populates="episodes")


class ShowcaseLike(Base):
    """공개 뷰어 좋아요 (fingerprint 기반 중복 방지)."""
    __tablename__ = "showcase_likes"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    episode_id = Column(BigInteger, ForeignKey("episodes.id"), nullable=False)
    fingerprint = Column(VARCHAR(64), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
