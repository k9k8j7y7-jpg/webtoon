"""Gemini 이미지 생성 어댑터 — Nano Banana 2.

PRD 6장: 레퍼런스 주입 캐릭터 일관성.
adapters/ 추상화 레이어 경유.
"""

import random
import io

from google import genai
from google.genai import types

from app.config import get_settings
from app.adapters.base import ImageAdapter, ImageResult

settings = get_settings()

# PRD 기준 모델: gemini-3.1-flash-image-preview (Nano Banana 2)
IMAGE_MODEL = "gemini-2.5-flash-image"


class GeminiImageAdapter(ImageAdapter):
    def __init__(self):
        self._client = genai.Client(api_key=settings.GEMINI_API_KEY)

    async def generate_image(
        self,
        prompt: str,
        reference_images: list[bytes] | None = None,
        reference_labels: list[str] | None = None,
        seed: int | None = None,
        aspect_ratio: str = "9:16",
    ) -> ImageResult:
        if seed is None:
            seed = random.randint(0, 999999)

        contents = []

        # 레퍼런스 이미지 주입 — 이미지-캐릭터 매핑 라벨 포함 (A-1)
        if reference_images:
            for i, ref_bytes in enumerate(reference_images):
                # 라벨이 있으면 이미지 앞에 매핑 명시
                if reference_labels and i < len(reference_labels):
                    contents.append(f"Reference Image {i + 1}: {reference_labels[i]}")
                contents.append(types.Part.from_bytes(data=ref_bytes, mime_type="image/png"))

        contents.append(prompt)

        response = self._client.models.generate_content(
            model=IMAGE_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE", "TEXT"],
                temperature=0.8,
                httpOptions=types.HttpOptions(timeout=120_000),
            ),
        )

        # 응답에서 이미지 추출
        for part in response.candidates[0].content.parts:
            if part.inline_data and part.inline_data.mime_type.startswith("image/"):
                return ImageResult(
                    image_bytes=part.inline_data.data,
                    seed=seed,
                    model=IMAGE_MODEL,
                    mime_type=part.inline_data.mime_type,
                )

        raise RuntimeError("Gemini did not return an image")

    async def generate_character_sheet(
        self,
        character_description: str,
        style_prompt: str,
        reference_images: list[bytes] | None = None,
        reference_labels: list[str] | None = None,
    ) -> list[ImageResult]:
        """캐릭터 시트 생성: 정면 1장 + 표정 격자 1장 = 총 2장."""
        results = []

        no_text = (
            "DO NOT render any text, letters, words, labels, names, or descriptions in the image. "
            "No Korean text, no English text, no signs, no captions. Pure character illustration only"
        )
        single_char = (
            "Draw EXACTLY ONE character only. Do NOT create a grid, sprite sheet, "
            "multi-pose layout, turnaround sheet, or multiple copies of the character. "
            "Single character, single pose, single frame"
        )

        # ── 1. 정면 (single_char 지시 포함) ──
        front_prompt = (
            f"Character design sheet, front view, full body. {character_description}. "
            f"{style_prompt}. White background, character reference sheet, clean lines, detailed. "
            f"{single_char}. {no_text}."
        )
        front_result = await self.generate_image(
            prompt=front_prompt,
            reference_images=reference_images,
            reference_labels=reference_labels,
            aspect_ratio="1:1",
        )
        results.append(front_result)

        # ── 2. 표정 격자 (2×3, single_char 미적용) ──
        expr_prompt = (
            f"Expression sheet of the SAME character: a 2x3 grid of 6 bust-shot panels, "
            f"plain white background, thin panel borders. "
            f"Panels in order (top-left to bottom-right): smile, angry, sad, surprised, worried, neutral. "
            f"Each panel exactly one face. "
            f"Identical character design, hair, glasses, outfit in every panel. "
            f"{character_description}. {style_prompt}. {no_text}."
        )
        expr_result = await self.generate_image(
            prompt=expr_prompt,
            reference_images=[front_result.image_bytes],
            reference_labels=["Front reference of the character — draw the SAME person in every panel"],
            aspect_ratio="1:1",
        )
        results.append(expr_result)

        return results

    async def generate_location(
        self,
        location_description: str,
        style_prompt: str,
    ) -> ImageResult:
        prompt = (
            f"Background illustration, detailed environment art. "
            f"{location_description}. {style_prompt}. "
            f"No characters, environment only, wide shot, detailed background."
        )
        return await self.generate_image(prompt=prompt, aspect_ratio="16:9")


# 싱글턴
_adapter: GeminiImageAdapter | None = None


def get_image_adapter() -> GeminiImageAdapter:
    global _adapter
    if _adapter is None:
        _adapter = GeminiImageAdapter()
    return _adapter
