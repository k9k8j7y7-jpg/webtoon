from sqlalchemy import Column, BigInteger, String, Text, Enum, Boolean, DateTime
from sqlalchemy.sql import func

from app.database import Base


class Notice(Base):
    __tablename__ = "notices"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=False)
    body = Column(Text)
    notice_type = Column(
        Enum("info", "warning", "maintenance", "update", name="notice_type_enum"),
        nullable=False,
        default="info",
    )
    is_active = Column(Boolean, nullable=False, default=True)
    starts_at = Column(DateTime, nullable=False, server_default=func.now())
    ends_at = Column(DateTime)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
