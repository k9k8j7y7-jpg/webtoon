"""Story Engine — 게이트 1: 아이디어 → 기획(제목·로그라인·시놉시스·세계관·인물목록)

API-Spec 3장, PRD 3.1 참조.
"""

import json

from app.adapters.gemini import generate_text

SYSTEM_INSTRUCTION = """너는 웹툰 스토리 기획 전문가야.
사용자의 아이디어를 받아서 웹툰 기획안을 만들어줘.
반드시 아래 JSON 형식으로만 응답해. 다른 텍스트는 절대 넣지 마.

{
  "title": "웹툰 제목",
  "logline": "한 줄 요약 (1~2문장)",
  "synopsis": "시놉시스 (3~5문단, 전체 줄거리)",
  "world": "세계관 설명 (배경, 시대, 특수 규칙 등)",
  "characters": [
    {
      "ref_key": "영문 식별자 (예: hero, sidekick)",
      "name": "캐릭터 이름",
      "gender": "성별 (남/여/기타)",
      "age": "나이 (숫자)",
      "description": "짧은 특징 — 동물이면 품종/종, 사람이면 외형·성격·역할"
    }
  ]
}

규칙:
- 아이디어에 동물이 등장하면 반드시 등장인물(characters)에 포함할 것
- 동물의 description에는 품종/종을 적을 것 (아이디어에 명시되어 있으면 그대로)
- 동물의 나이는 해당 동물 기준의 자연스러운 나이로
- 사람의 description에는 외형·역할을 한 줄로"""

SUGGEST_CHARACTERS_INSTRUCTION = """너는 웹툰 캐릭터 기획 전문가야.
사용자의 아이디어를 바탕으로 어울리는 등장인물을 제안해줘.
반드시 아래 JSON 형식으로만 응답해. 다른 텍스트는 절대 넣지 마.

{
  "characters": [
    {
      "name": "캐릭터 이름",
      "description": "짧은 특징 한 줄 (동물이면 품종/종, 사람이면 외형·역할)",
      "gender": "남 또는 여 또는 기타",
      "age": 나이(숫자)
    }
  ]
}

규칙:
- 아이디어에 동물이 등장하면 반드시 등장인물에 포함할 것
- 동물의 description에는 품종/종을 적을 것 (아이디어에 명시되어 있으면 그대로, 예: "포메라니안")
- 동물의 나이는 해당 동물 기준의 자연스러운 나이로
- 사람의 description에는 외형·역할을 한 줄로 (예: "도도의 보호자, 40대 아빠")
- 3~5명의 캐릭터를 제안해줘. 사람 이름은 한국 이름으로 해줘."""


def _parse_json(raw: str) -> dict:
    """Gemini 응답에서 JSON을 파싱한다 (마크다운 코드블록 제거)."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    if text.startswith("json"):
        text = text[4:].strip()
    return json.loads(text)


async def suggest_characters(idea: str) -> list[dict]:
    """아이디어를 바탕으로 등장인물을 자동 제안한다."""
    prompt = f"아이디어: {idea}\n\n위 아이디어에 어울리는 등장인물을 제안해줘."

    raw = await generate_text(
        prompt=prompt,
        system_instruction=SUGGEST_CHARACTERS_INSTRUCTION,
        temperature=0.9,
        max_output_tokens=2048,
    )

    result = _parse_json(raw)
    return result.get("characters", [])


async def generate_planning(idea: str, options_prompt: str | None = None, characters: list[dict] | None = None) -> dict:
    """아이디어로부터 기획안을 생성한다."""
    prompt = f"아이디어: {idea}"
    if options_prompt:
        prompt += options_prompt
    if characters:
        prompt += "\n\n등장인물 정보:"
        for c in characters:
            parts = [c.get("name", "이름 미정")]
            if c.get("description"):
                parts.append(f"추가설명: {c['description']}")
            if c.get("gender"):
                parts.append(f"성별: {c['gender']}")
            if c.get("age"):
                parts.append(f"나이: {c['age']}세")
            prompt += f"\n- {', '.join(parts)}"
        prompt += "\n\n위 등장인물을 반드시 포함해서 기획안을 만들어줘. 등장인물의 ref_key는 네가 생성하고, description은 사용자가 입력한 추가설명을 반영해서 보강해줘."
    else:
        prompt += "\n\n위 아이디어로 웹툰 기획안을 만들어줘."

    raw = await generate_text(
        prompt=prompt,
        system_instruction=SYSTEM_INSTRUCTION,
        temperature=0.9,
        max_output_tokens=4096,
    )

    return _parse_json(raw)
