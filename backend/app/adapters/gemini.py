"""Gemini API 텍스트 생성 클라이언트.

Tech-Stack 6장: 이미지·텍스트 모두 Gemini API 경유.
이 파일은 텍스트 생성 전용. 이미지 생성은 4단계에서 별도 추가.
"""

from google import genai
from google.genai import types

from app.config import get_settings

settings = get_settings()

_client = None


def get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client


async def generate_text(
    prompt: str,
    system_instruction: str | None = None,
    temperature: float = 0.8,
    max_output_tokens: int = 4096,
) -> str:
    """Gemini로 텍스트를 생성한다. 동기 호출을 래핑."""
    client = get_client()

    config = types.GenerateContentConfig(
        temperature=temperature,
        max_output_tokens=max_output_tokens,
    )
    if system_instruction:
        config.system_instruction = system_instruction

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=config,
    )
    return response.text
