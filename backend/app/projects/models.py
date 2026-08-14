from sqlalchemy import Column, BigInteger, String, Enum, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


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
    episode_no = Column(BigInteger, nullable=False)
    title = Column(String(200), nullable=True)
    logline = Column(String(500), nullable=True)
    synopsis = Column(String(5000), nullable=True)
    script = Column(JSON, nullable=True)
    gate_status = Column(JSON, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime, nullable=True)

    project = relationship("Project", back_populates="episodes")
