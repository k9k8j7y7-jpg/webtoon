"""Script Engine — 게이트 2: 기획 → 대본(씬·컷·대사)

API-Spec 4장, PRD 3.1 참조.
대본은 씬 > 컷 > 대사 트리 구조로 생성된다.
"""

import json

from app.adapters.gemini import generate_text

SYSTEM_INSTRUCTION = """너는 웹툰 대본 작가야.
기획안(시놉시스, 세계관, 인물)을 받아서 웹툰 대본을 만들어줘.

핵심 원칙:
- 시놉시스의 모든 주요 장면을 빠짐없이 대본화하라.
- 컷 수는 이야기를 완결하는 데 필요한 만큼으로 한다.
- 시놉시스의 결말까지 반드시 포함하라. 이야기가 중간에 잘리면 안 된다.
- 극단 방지: 최소 6컷, 최대 40컷 범위 안에서 자연스럽게 결정하라.

반드시 아래 JSON 형식으로만 응답해. 다른 텍스트는 절대 넣지 마.

{
  "scenes": [
    {
      "scene_id": "s01",
      "scene_no": 1,
      "summary": "씬 요약",
      "location": "장소명 (영문 식별자도 함께, 예: cafe_interior)",
      "cuts": [
        {
          "cut_number": 1,
          "characters": [
            {
              "character_id": "hero",
              "emotion": "neutral",
              "pose": "카페에 앉아 커피를 마시고 있다",
              "outfit": "default"
            }
          ],
          "location_id": "cafe_interior",
          "shot": "full",
          "action": "주인공이 카페에 앉아 있다",
          "dialogue": [
            {"order": 1, "type": "narration", "speaker": null, "text": "어느 평범한 오후였다."}
          ],
          "emphasis": "normal",
          "transition": null
        }
      ]
    }
  ],
  "locations": [
    {
      "ref_key": "cafe_interior",
      "name": "카페 내부",
      "description": "아늑한 동네 카페. 나무 테이블과 따뜻한 조명."
    }
  ]
}

규칙:
- shot 값: long | full | bust | close_up 중 택1
- dialogue type: speech | narration | thought 중 택1
- emphasis: normal | large | full_bleed 중 택1
- transition: null 또는 "scene_break"
- character_id는 기획안의 ref_key를 그대로 사용
- 각 씬에는 최소 2컷 이상"""


async def generate_script(planning: dict, series_context: dict | None = None) -> dict:
    """기획안으로부터 대본을 생성한다.

    series_context가 있으면 연작 컨텍스트를 프롬프트에 주입한다.
    """
    from app.script.prompt_fragments import (
        build_series_context_block,
        SERIES_SCRIPT_INSTRUCTION_ADDON,
    )

    # 연작 컨텍스트 블록
    series_block = build_series_context_block(series_context) if series_context else ""
    ep_label = f"{series_context['episode_no']}화" if series_context else "1화"

    prompt = f"""아래 기획안을 바탕으로 웹툰 {ep_label} 대본을 만들어줘.

제목: {planning.get('title', '')}
로그라인: {planning.get('logline', '')}
시놉시스: {planning.get('synopsis', '')}
세계관: {planning.get('world', '')}
등장인물: {json.dumps(planning.get('characters', []), ensure_ascii=False, indent=2)}
"""

    if series_block:
        prompt += f"\n{series_block}\n"

    prompt += f"""
중요 지시:
1. 먼저 시놉시스를 분석해서 주요 사건을 모두 파악하라.
2. 시놉시스의 첫 장면부터 마지막 결말까지 빠짐없이 대본에 포함하라.
3. 특히 시놉시스의 클라이맥스와 결말이 반드시 대본에 있어야 한다.
4. 이야기가 중간에 끊기면 안 된다. 시놉시스 끝까지 완결하라.

위 기획안으로 웹툰 {ep_label} 대본을 JSON으로 만들어줘."""

    system = SYSTEM_INSTRUCTION
    if series_context:
        system += SERIES_SCRIPT_INSTRUCTION_ADDON

    raw = await generate_text(
        prompt=prompt,
        system_instruction=system,
        temperature=0.85,
        max_output_tokens=16384,
    )

    # JSON 파싱 (마크다운 코드블록 제거)
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    if text.startswith("json"):
        text = text[4:].strip()

    return json.loads(text)


def extract_character_names(script: dict) -> set[str]:
    """대본에서 캐릭터 ref_key 집합을 추출한다. 무효화 diff 판정용."""
    chars = set()
    for scene in script.get("scenes", []):
        for cut in scene.get("cuts", []):
            for char in cut.get("characters", []):
                chars.add(char.get("character_id", ""))
    return chars - {""}


def extract_location_names(script: dict) -> set[str]:
    """대본에서 장소 ref_key 집합을 추출한다. 무효화 diff 판정용."""
    locs = set()
    for scene in script.get("scenes", []):
        for cut in scene.get("cuts", []):
            loc = cut.get("location_id")
            if loc:
                locs.add(loc)
    return locs
