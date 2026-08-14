"""이미지 모델 추상화 레이어 — Tech-Stack 6장.

MVP에는 Nano Banana 2 하나만 연결.
향후 모델 교체·추가 시 파이프라인을 건드리지 않는다.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class ImageResult:
    image_bytes: bytes
    seed: int
    model: str
    mime_type: str = "image/png"


class ImageAdapter(ABC):
    @abstractmethod
    async def generate_image(
        self,
        prompt: str,
        reference_images: list[bytes] | None = None,
        seed: int | None = None,
        aspect_ratio: str = "9:16",
    ) -> ImageResult:
        """이미지를 생성한다."""
        ...

    @abstractmethod
    async def generate_character_sheet(
        self,
        character_description: str,
        style_prompt: str,
        reference_images: list[bytes] | None = None,
    ) -> list[ImageResult]:
        """캐릭터 시트(정면+표정)를 생성한다."""
        ...

    @abstractmethod
    async def generate_location(
        self,
        location_description: str,
        style_prompt: str,
    ) -> ImageResult:
        """장소 레퍼런스 이미지를 생성한다."""
        ...
