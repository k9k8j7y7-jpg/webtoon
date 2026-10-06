from sqlalchemy import Column, BigInteger, String, Text, Enum, SmallInteger, DateTime, JSON
from sqlalchemy.sql import func

from app.database import Base


class Inquiry(Base):
    __tablename__ = "inquiries"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, nullable=False)
    category = Column(
        Enum("bug", "howto", "payment", "feature", "other", name="inquiry_category_enum"),
        nullable=False,
    )
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    episode_id = Column(BigInteger, nullable=True)
    status = Column(
        Enum("received", "checking", "answered", "closed", name="inquiry_status_enum"),
        nullable=False,
        default="received",
    )
    satisfaction = Column(SmallInteger, nullable=True)  # 1=good, -1=bad
    attachments = Column(JSON, nullable=True)  # URL 배열
    device_info = Column(JSON, nullable=True)  # {ua, device_type, screen_width}
    answered_at = Column(DateTime, nullable=True)
    user_read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class InquiryMessage(Base):
    __tablename__ = "inquiry_messages"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    inquiry_id = Column(BigInteger, nullable=False)
    user_id = Column(BigInteger, nullable=False)
    is_admin = Column(SmallInteger, nullable=False, default=0)
    body = Column(Text, nullable=False)
    attachments = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
