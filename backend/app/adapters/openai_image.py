"""OpenAI 이미지 생성 어댑터 — 실사 캐릭터용.

gpt-image-2.5-sunburst images.edit() 기반.
실사 캐릭터가 포함된 에피소드 전용.
"""

import io
import base64
import asyncio
import logging

from app.config import get_settings
from app.adapters.base import ImageAdapter, ImageResult

logger = logging.getLogger(__name__)

MAX_RETRIES = 2
RETRY_DELAY = 3  # seconds

GPT_IMAGE_MODEL = "gpt-image-2.5-sunburst"

# 에피소드 비율 → GPT size 매핑
# GPT는 정확한 비율을 지원하지 않으므로 가장 가까운 크기로 매핑 후 중앙 크롭
ASPECT_RATIO_MAP = {
    "9:16": "1024x1536",
    "16:9": "1536x1024",
    "3:4":  "1024x1536",   # GPT에 3:4 없음 → 9:16으로 생성 후 크롭
    "4:3":  "1536x1024",   # GPT에 4:3 없음 → 16:9로 생성 후 크롭
    "1:1":  "1024x1024",
}

# 중앙 크롭이 필요한 비율 (GPT 출력 → 목표 비율)
_CROP_TARGETS = {
    "3:4":  (1024, 1365),   # 1024x1536 → 1024x1365 (3:4 = 1024 × 1024*4/3)
    "4:3":  (1365, 1024),   # 1536x1024 → 1365x1024
}

settings = get_settings()


def _center_crop(image_bytes: bytes, target_w: int, target_h: int) -> bytes:
    """이미지를 중앙 크롭하여 정확한 비율로 맞춘다."""
    from PIL import Image
    from io import BytesIO

    img = Image.open(BytesIO(image_bytes))
    w, h = img.size

    if w == target_w and h == target_h:
        return image_bytes

    # 중앙 크롭
    left = max(0, (w - target_w) // 2)
    top = max(0, (h - target_h) // 2)
    right = left + target_w
    bottom = top + target_h

    cropped = img.crop((left, top, right, bottom))
    buf = BytesIO()
    cropped.save(buf, format="PNG")
    return buf.getvalue()


class OpenAIImageAdapter(ImageAdapter):
    def __init__(self):
        from openai import OpenAI
        self._client = OpenAI(api_key=settings.OPENAI_API_KEY, timeout=120.0)

    async def generate_image(
        self,
        prompt: str,
        reference_images: list[bytes] | None = None,
        reference_labels: list[str] | None = None,
        seed: int | None = None,
        aspect_ratio: str = "9:16",
    ) -> ImageResult:
        size_str = ASPECT_RATIO_MAP.get(aspect_ratio, "1024x1536")

        # 프롬프트 앞에 참조 라벨 추가
        labeled_prompt = ""
        if reference_labels:
            for i, label in enumerate(reference_labels):
                labeled_prompt += f"Reference Image {i + 1}: {label}\n"
            labeled_prompt += "\n"
        labeled_prompt += prompt

        # 참조 이미지를 file-like 객체로 변환
        image_files = []
        if reference_images:
            for i, ref_bytes in enumerate(reference_images):
                buf = io.BytesIO(ref_bytes)
                buf.name = f"ref_{i}.png"
                image_files.append(buf)

        last_error = None
        for attempt in range(1, MAX_RETRIES + 2):
            try:
                if image_files:
                    # 매번 seek(0) — 재시도 시 파일 위치 초기화
                    for f in image_files:
                        f.seek(0)
                    response = await asyncio.to_thread(
                        self._client.images.edit,
                        model=GPT_IMAGE_MODEL,
                        image=image_files,
                        prompt=labeled_prompt,
                        size=size_str,
                        quality="high",
                        n=1,
                    )
                else:
                    response = await asyncio.to_thread(
                        self._client.images.generate,
                        model=GPT_IMAGE_MODEL,
                        prompt=labeled_prompt,
                        size=size_str,
                        quality="high",
                        n=1,
                    )

                img_data = base64.b64decode(response.data[0].b64_json)

                # 중앙 크롭 (3:4, 4:3)
                crop_target = _CROP_TARGETS.get(aspect_ratio)
                if crop_target:
                    img_data = _center_crop(img_data, crop_target[0], crop_target[1])

                if attempt > 1:
                    logger.warning("OpenAI generate_image succeeded on attempt %d", attempt)

                return ImageResult(
                    image_bytes=img_data,
                    seed=seed or 0,
                    model=GPT_IMAGE_MODEL,
                    mime_type="image/png",
                )

            except Exception as e:
                last_error = e
                if attempt <= MAX_RETRIES:
                    logger.warning(
                        "OpenAI generate_image attempt %d failed: %s — retrying in %ds",
                        attempt, last_error, RETRY_DELAY,
                    )
                    await asyncio.sleep(RETRY_DELAY)

        raise last_error

    async def generate_character_sheet(
        self,
        character_description: str,
        style_prompt: str,
        reference_images: list[bytes] | None = None,
        reference_labels: list[str] | None = None,
    ) -> list[ImageResult]:
        """실사 캐릭터는 시트 생성 불필요 — 호출되면 에러."""
        raise NotImplementedError("실사 캐릭터는 시트를 생성하지 않습니다")

    async def generate_location(
        self,
        location_description: str,
        style_prompt: str,
        aspect_ratio: str = "16:9",
    ) -> ImageResult:
        """장소 생성은 Gemini 경로 사용 — GPT에서는 미지원."""
        raise NotImplementedError("장소 생성은 Gemini 어댑터를 사용하세요")


# 싱글턴
_adapter: OpenAIImageAdapter | None = None


def get_openai_image_adapter() -> OpenAIImageAdapter:
    global _adapter
    if _adapter is None:
        _adapter = OpenAIImageAdapter()
    return _adapter
