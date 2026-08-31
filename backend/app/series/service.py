"""Series Service — 바이블+아웃라인 생성/편집 (P4).

텍스트 AI 1콜로 바이블(synopsis/world/characters) + 아웃라인(N화) 동시 생성.
"""

import json
import logging

from app.adapters.gemini import generate_text
from app.story.prompt_fragments import GENRE_FRAGMENTS, MOOD_FRAGMENTS

logger = logging.getLogger(__name__)


# ── 프롬프트 ──


BIBLE_SYSTEM_INSTRUCTION = """너는 웹툰 시리즈(연작) 기획 전문가야.
사용자의 아이디어를 받아서 시리즈 전체 기획(바이블)과 회차별 아웃라인을 만들어줘.
반드시 아래 JSON 형식으로만 응답해. 다른 텍스트는 절대 넣지 마.

{
  "synopsis": "전체 줄거리 (5~10문장, 시작-전개-클라이맥스-결말 포함)",
  "world": "세계관 요약 (배경, 시대, 특수 규칙)",
  "characters": [
    {
      "ref_key": "영문 snake_case 식별자 (예: hero, me, dodo). 대본에서 이 값으로 캐릭터를 참조한다",
      "name": "캐릭터 이름",
      "role": "주인공/조연/적대자 등",
      "description": "외형·성격·동기 한 줄"
    }
  ],
  "outline": [
    {
      "no": 1,
      "title": "회차 제목",
      "summary": "이 회차의 줄거리 요약 (3~5문장, 미니 기승전결 포함)",
      "hook": "엔딩 훅 — 다음 화로 이어지는 궁금증/긴장 (1~2문장)"
    }
  ]
}

규칙:
- outline 배열은 정확히 {target_episodes}개를 만들어야 해
- 각 화는 독립적인 미니 기승전결 구조를 가질 것
- 각 화의 엔딩 훅은 다음 화를 보고 싶게 만드는 장치일 것
- 사건 크기와 긴장 리듬을 고려해서 분할할 것 — 전반부에 일상과 갈등 씨앗, 중반부에 위기 고조, 후반부에 클라이맥스와 해소
- 마지막 화의 hook은 여운이나 후일담 암시로
- 시리즈 전체 synopsis와 각 회차 summary는 일관성을 유지할 것"""

OUTLINE_REGEN_SYSTEM_INSTRUCTION = """너는 웹툰 시리즈 아웃라인 전문가야.
기존 앞 회차 요약을 참고하여, 이어지는 회차들의 아웃라인을 새로 만들어줘.
반드시 아래 JSON 형식으로만 응답해. 다른 텍스트는 절대 넣지 마.

{
  "outline": [
    {
      "no": 시작번호,
      "title": "회차 제목",
      "summary": "줄거리 요약 (3~5문장, 미니 기승전결)",
      "hook": "엔딩 훅 (1~2문장)"
    }
  ]
}

규칙:
- 앞 회차의 스토리를 자연스럽게 이어갈 것
- 각 화는 미니 기승전결 + 엔딩 훅 구조
- 사건 크기와 긴장 리듬 고려
- 마지막 화 hook은 여운/후일담 암시"""

MERGE_SYSTEM_INSTRUCTION = """너는 웹툰 시리즈 편집 전문가야.
두 회차의 요약을 하나로 합쳐줘.
반드시 아래 JSON 형식으로만 응답해.

{
  "title": "합쳐진 회차 제목",
  "summary": "합쳐진 줄거리 요약 (3~5문장, 미니 기승전결)"
}"""

SPLIT_SYSTEM_INSTRUCTION = """너는 웹툰 시리즈 편집 전문가야.
하나의 회차 요약을 두 회차로 나눠줘. 각 회차가 미니 기승전결을 갖도록.
반드시 아래 JSON 형식으로만 응답해.

{
  "episodes": [
    {
      "title": "전반부 회차 제목",
      "summary": "전반부 줄거리 요약 (3~5문장)",
      "hook": "전반부 엔딩 훅 (1~2문장)"
    },
    {
      "title": "후반부 회차 제목",
      "summary": "후반부 줄거리 요약 (3~5문장)",
      "hook": "후반부 엔딩 훅 (1~2문장)"
    }
  ]
}"""


def _parse_json(raw: str) -> dict:
    """Gemini 응답에서 JSON 파싱 (마크다운 코드블록 제거)."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    if text.startswith("json"):
        text = text[4:].strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # 잘린 JSON 복구 시도: 닫히지 않은 괄호 보완
        for suffix in ['}]}\n', '"}]}\n', '"}]\n', ']\n', '}\n']:
            try:
                return json.loads(text + suffix)
            except json.JSONDecodeError:
                continue
        raise


def _build_options_prompt(story_options: dict | None) -> str:
    """장르/분위기 조각 조립 (prompt_fragments 재사용)."""
    if not story_options:
        return ""
    parts: list[str] = []
    genre = story_options.get("genre")
    if genre and genre in GENRE_FRAGMENTS:
        parts.append(GENRE_FRAGMENTS[genre])
    mood = story_options.get("mood")
    if mood and mood in MOOD_FRAGMENTS:
        parts.append(MOOD_FRAGMENTS[mood])
    if not parts:
        return ""
    return "\n\n연출 지시:\n" + "\n".join(f"- {p}" for p in parts)


async def generate_bible(
    idea: str,
    target_episodes: int = 8,
    story_options: dict | None = None,
) -> dict:
    """바이블 + 아웃라인 동시 생성 (텍스트 AI 1콜).

    Returns:
        {"synopsis", "world", "characters", "outline": [{no, title, summary, hook}]}
    """
    system = BIBLE_SYSTEM_INSTRUCTION.replace("{target_episodes}", str(target_episodes))

    prompt = f"아이디어: {idea}"
    prompt += _build_options_prompt(story_options)
    prompt += f"\n\n위 아이디어로 {target_episodes}화짜리 웹툰 시리즈의 바이블과 회차 아웃라인을 만들어줘."

    raw = await generate_text(
        prompt=prompt,
        system_instruction=system,
        temperature=0.9,
        max_output_tokens=16384,
    )
    result = _parse_json(raw)

    # outline 항목에 episode_id, status 기본값 부여
    for item in result.get("outline", []):
        item["episode_id"] = None
        item["status"] = "outline"

    return result


async def regenerate_outline_from(
    bible: dict,
    existing_outline: list[dict],
    from_no: int,
    total_episodes: int | None = None,
) -> list[dict]:
    """from_no 이후 회차만 재생성. 앞 회차 요약을 컨텍스트로 주입.

    Returns:
        새로 생성된 아웃라인 항목 리스트 (from_no부터)
    """
    # 앞 회차 (유지될 부분)
    kept = [item for item in existing_outline if item["no"] < from_no]
    regen_count = len(existing_outline) - len(kept)
    if total_episodes:
        regen_count = total_episodes - len(kept)
    if regen_count <= 0:
        regen_count = 1

    context_parts = [f"시리즈 시놉시스: {bible.get('synopsis', '')}"]
    if kept:
        context_parts.append("\n기존 회차 요약 (변경 불가):")
        for item in kept:
            context_parts.append(f"  {item['no']}화 '{item['title']}': {item['summary']}")

    prompt = "\n".join(context_parts)
    prompt += f"\n\n{from_no}화부터 {from_no + regen_count - 1}화까지 총 {regen_count}화의 아웃라인을 새로 만들어줘."
    prompt += "\n앞 회차 스토리를 자연스럽게 이어가되, 전개 방향을 새롭게 바꿔도 좋아."

    raw = await generate_text(
        prompt=prompt,
        system_instruction=OUTLINE_REGEN_SYSTEM_INSTRUCTION,
        temperature=0.9,
        max_output_tokens=8192,
    )
    result = _parse_json(raw)

    new_items = result.get("outline", [])
    # 번호 재부여 + 기본값
    for i, item in enumerate(new_items):
        item["no"] = from_no + i
        item["episode_id"] = None
        item["status"] = "outline"

    return new_items


async def merge_outlines(item_a: dict, item_b: dict) -> dict:
    """인접 두 회차 요약을 AI로 합쳐 1개로.

    Returns:
        {"title", "summary"}  (hook은 뒤 회차(item_b)에서 승계)
    """
    prompt = (
        f"회차 A 제목: {item_a['title']}\n"
        f"회차 A 요약: {item_a['summary']}\n\n"
        f"회차 B 제목: {item_b['title']}\n"
        f"회차 B 요약: {item_b['summary']}\n\n"
        "위 두 회차를 하나로 합쳐줘."
    )

    raw = await generate_text(
        prompt=prompt,
        system_instruction=MERGE_SYSTEM_INSTRUCTION,
        temperature=0.7,
        max_output_tokens=2048,
    )
    return _parse_json(raw)


async def split_outline(item: dict) -> list[dict]:
    """1개 회차 요약을 AI로 2개로 분할.

    Returns:
        [{"title", "summary", "hook"}, {"title", "summary", "hook"}]
    """
    prompt = (
        f"회차 제목: {item['title']}\n"
        f"회차 요약: {item['summary']}\n"
        f"엔딩 훅: {item.get('hook', '')}\n\n"
        "위 회차를 두 회차로 나눠줘. 각각 미니 기승전결을 갖도록."
    )

    raw = await generate_text(
        prompt=prompt,
        system_instruction=SPLIT_SYSTEM_INSTRUCTION,
        temperature=0.7,
        max_output_tokens=2048,
    )
    result = _parse_json(raw)
    return result.get("episodes", [])
