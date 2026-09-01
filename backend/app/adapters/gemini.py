"""Gemini API 텍스트 생성 클라이언트.

Tech-Stack 6장: 이미지·텍스트 모두 Gemini API 경유.
이 파일은 텍스트 생성 전용. 이미지 생성은 4단계에서 별도 추가.
"""

import json
import logging
import re

from google import genai
from google.genai import types

from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

_client = None

# Gemini 2.5 Flash는 thinking 모델 — max_output_tokens에 thinking 토큰 포함.
# 짧은 JSON 응답도 최소 4096 필요. 긴 응답(대본/콘티/바이블)은 16384.
AI_TOKENS_SHORT = 4096     # 번역, 외형 명세, 제안 등 짧은 응답
AI_TOKENS_MEDIUM = 8192    # 지문 재작성, merge/split 등 중간 응답
AI_TOKENS_LONG = 16384     # 대본, 콘티, 바이블 등 긴 응답


def get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client


async def generate_text(
    prompt: str,
    system_instruction: str | None = None,
    temperature: float = 0.8,
    max_output_tokens: int = AI_TOKENS_SHORT,
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


def parse_ai_json(text: str, *, context: str = "ai") -> dict:
    """AI 응답에서 JSON을 파싱한다. 잘린 JSON도 부분 복구 시도."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()
    if cleaned.startswith("json"):
        cleaned = cleaned[4:].strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # 잘린 JSON 복구: 키-값 쌍을 regex로 추출
    result = {}
    # 문자열 값 추출
    for m in re.finditer(r'"(\w+)"\s*:\s*"((?:[^"\\]|\\.)*)"', cleaned):
        result[m.group(1)] = m.group(2)
    # 배열 값 추출 (문자열 배열만)
    for m in re.finditer(r'"(\w+)"\s*:\s*\[([^\]]*)\]', cleaned):
        items = [s.strip().strip('"') for s in m.group(2).split(",") if s.strip().strip('"')]
        result[m.group(1)] = items

    if result:
        logger.warning("%s: JSON truncated (%d chars), recovered %d keys", context, len(cleaned), len(result))
        return result

    logger.error("%s: JSON parse failed (%d chars): %s", context, len(cleaned), cleaned[:500])
    raise ValueError(f"AI 응답 파싱 실패 ({context})")
