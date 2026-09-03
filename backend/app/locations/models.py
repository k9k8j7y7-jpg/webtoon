from sqlalchemy import Column, BigInteger, String, Text, Enum, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


class Location(Base):
    __tablename__ = "locations"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    ref_key = Column(String(50), nullable=False)
    episode_id = Column(BigInteger, ForeignKey("episodes.id"), nullable=False)
    name = Column(String(100), nullable=True)
    description = Column(String(2000), nullable=True)
    mood_notes = Column(Text, nullable=True)
    reference_photo_url = Column(String(500), nullable=True)
    converted_photo_url = Column(String(500), nullable=True)
    status = Column(
        Enum("draft", "approved", "invalidated", name="loc_status_enum"),
        default="draft",
    )

    images = relationship("LocationImage", back_populates="location", lazy="joined")

    __table_args__ = (
        UniqueConstraint("episode_id", "ref_key", name="uq_loc_ref"),
    )


class LocationImage(Base):
    __tablename__ = "location_images"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    location_id = Column(BigInteger, ForeignKey("locations.id"), nullable=False, index=True)
    image_url = Column(String(500), nullable=False)
    seed = Column(BigInteger, nullable=True)

    location = relationship("Location", back_populates="images")
