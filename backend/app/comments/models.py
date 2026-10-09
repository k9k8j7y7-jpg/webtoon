from sqlalchemy import Column, BigInteger, String, Enum, DateTime, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base


class Comment(Base):
    """댓글 (step31). parent_id가 있으면 답글 — 답글의 답글은 없다(1단계 깊이)."""
    __tablename__ = "comments"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    episode_id = Column(BigInteger, nullable=False)
    user_id = Column(BigInteger, nullable=False)
    parent_id = Column(BigInteger, nullable=True)
    body = Column(String(1000), nullable=False)
    status = Column(
        Enum("visible", "deleted", "hidden", name="comment_status_enum"),
        nullable=False, default="visible", server_default="visible",
    )
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class CommentReport(Base):
    __tablename__ = "comment_reports"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    comment_id = Column(BigInteger, nullable=False)
    reporter_id = Column(BigInteger, nullable=False)
    reason = Column(String(30), nullable=False)
    status = Column(
        Enum("open", "resolved", "dismissed", name="report_status_enum"),
        nullable=False, default="open", server_default="open",
    )
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    __table_args__ = (UniqueConstraint("comment_id", "reporter_id", name="uk_report"),)


class UserBlock(Base):
    """작가가 특정 사용자를 차단 — 차단된 사용자는 그 작가 작품에 댓글·답글 불가."""
    __tablename__ = "user_blocks"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    author_id = Column(BigInteger, nullable=False)
    blocked_user_id = Column(BigInteger, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    __table_args__ = (UniqueConstraint("author_id", "blocked_user_id", name="uk_block"),)
