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
- character_id는 기획안 등장인물의 ref_key를 그대로 사용. 새 키를 만들지 말 것
- 각 씬에는 최소 2컷 이상
- action(지문)에서 인물 위치는 가구 기준으로 명시 (예: '소파에 앉아', '테이블 옆에 서서'). 위치 불명 서술 금지
- 장소(location)는 물리적으로 다른 공간만 구분하라. 같은 공간의 다른 앵글·창밖 풍경·입구/내부는 하나의 location_id로 통합. 단편 기준 보통 2~4개, 최대 5개"""


async def generate_script(
    planning: dict,
    series_context: dict | None = None,
    is_ad: bool = False,
    product_name: str | None = None,
    purpose: str = "story",
    target_cuts: int | None = None,
    tone: str | None = None,
    product_info: str | None = None,
) -> dict:
    """기획안으로부터 대본을 생성한다.

    series_context가 있으면 연작 컨텍스트를 프롬프트에 주입한다.
    is_ad가 True면 광고 웹툰 지침을 적용한다.
    product_name이 있으면 제품 소품 등장 지시를 추가한다.
    purpose가 onecut_ad면 1컷 대본 전용 addon 적용.
    target_cuts: 인스타툰 컷 수 강제(4/6/8).
    tone: 대본 톤 재생성(더 짧게/임팩트/감성/유머/신뢰).
    product_info: 제품 특징·활용법 텍스트.
    """
    from app.script.prompt_fragments import (
        build_series_context_block,
        SERIES_SCRIPT_INSTRUCTION_ADDON,
        STANDALONE_SCRIPT_INSTRUCTION_ADDON,
        AD_SCRIPT_INSTRUCTION_ADDON,
        ONECUT_AD_SCRIPT_INSTRUCTION_ADDON,
        get_ad_script_addon,
    )

    # 연작 컨텍스트 블록
    series_block = build_series_context_block(series_context) if series_context else ""
    ep_label = f"{series_context['episode_no']}화" if series_context else "1화"

    # synopsis: synopsis_parts(4단)가 있으면 구조화 표시, 없으면 기존 문자열
    synopsis_parts = planning.get("synopsis_parts")
    if synopsis_parts and isinstance(synopsis_parts, dict):
        synopsis_text = (
            f"[도입] {synopsis_parts.get('ki', '')}\n"
            f"[전개] {synopsis_parts.get('seung', '')}\n"
            f"[전환] {synopsis_parts.get('jeon', '')}\n"
            f"[결말] {synopsis_parts.get('gyeol', '')}"
        )
    else:
        synopsis_text = planning.get("synopsis", "")

    prompt = f"""아래 기획안을 바탕으로 웹툰 {ep_label} 대본을 만들어줘.

제목: {planning.get('title', '')}
로그라인: {planning.get('logline', '')}
시놉시스: {synopsis_text}
세계관: {planning.get('world', '')}
등장인물: {json.dumps(planning.get('characters', []), ensure_ascii=False, indent=2)}
"""

    if series_block:
        prompt += f"\n{series_block}\n"

    # 비광고 에피소드에서 제품이 등록되어 있으면 소품으로 한 줄
    if product_name and not is_ad:
        prompt += f"\n등장 제품: {product_name}(소품으로 자연스럽게 등장시켜라)\n"

    prompt += f"""
중요 지시:
1. 먼저 시놉시스를 분석해서 주요 사건을 모두 파악하라.
2. 시놉시스의 첫 장면부터 마지막 결말까지 빠짐없이 대본에 포함하라.
3. 특히 시놉시스의 클라이맥스와 결말이 반드시 대본에 있어야 한다.
4. 이야기가 중간에 끊기면 안 된다. 시놉시스 끝까지 완결하라.

위 기획안으로 웹툰 {ep_label} 대본을 JSON으로 만들어줘."""

    # 광고 3종 공통: 선택한 카피·장면을 프롬프트에 주입
    if purpose in ("onecut_ad", "instatoon_ad", "brand_series"):
        ib = planning.get("idea_brief") or {}
        copy_sel = ib.get("copy_selected", 0)
        scene_sel = ib.get("scene_selected", 0)
        copies = ib.get("copy_candidates", [])
        scenes = ib.get("scene_ideas", [])
        chosen_copy = copies[copy_sel] if isinstance(copy_sel, int) and copy_sel < len(copies) else (copies[0] if copies else {})
        chosen_scene = scenes[scene_sel] if isinstance(scene_sel, int) and scene_sel < len(scenes) else (scenes[0] if scenes else {})
        head = chosen_copy.get("head", "")
        sub = chosen_copy.get("sub", "")
        scene_desc = chosen_scene.get("scene", "")
        scene_shot = chosen_scene.get("shot", "bust")
        # 브리프 요약
        brief_result = ib.get("ad_brief_result", {})
        key_msg = brief_result.get("key_message") or ib.get("key_message", "")
        target = brief_result.get("target_summary", "")
        if head or scene_desc or key_msg:
            prompt += f"""
광고 브리프:
- 핵심 메시지: {key_msg}
- 타깃: {target}
- 헤드카피: "{head}"
- 서브카피: "{sub}"
- 장면 아이디어: {scene_desc}
- 샷 타입: {scene_shot}

첫 컷 또는 마지막 컷에 위 헤드카피·서브카피를 dialogue narration(headcopy/box)으로 넣어라.
등장인물은 모델 1명(필요 시 조연 1명까지). 새 인물을 여럿 만들지 마라.
"""

    # 제품 정보 주입 (idea_brief product_info + product_info_web)
    if product_info:
        prompt += f"\n\n제품 상세 정보:\n{product_info}\n위 정보를 대본에 자연스럽게 반영하라."

    # 톤 재생성 지시
    if tone:
        _TONE_LABELS = {
            "shorter": "더 짧고 간결하게",
            "impact": "강렬하고 임팩트 있게",
            "emotional": "감성적이고 따뜻하게",
            "humor": "재미있고 유머러스하게",
            "trust": "신뢰감 있고 전문적으로",
        }
        tone_label = _TONE_LABELS.get(tone, tone)
        prompt += f"\n\n톤 지시: 전체 대본의 톤을 '{tone_label}' 느낌으로 만들어라."

    # brand_series: 이번 화 소재 주입
    if purpose == "brand_series":
        ib = planning.get("idea_brief") or {}
        episode_topic = ib.get("episode_topic", "")
        if episode_topic:
            prompt += f"\n\n이번 화 소재: {episode_topic}\n위 소재를 이야기의 중심 상황으로 녹여라."
        else:
            prompt += "\n\n이번 화 소재가 지정되지 않았다. 제품 특징 중 하나를 골라 한 화의 소재로 삼아라."

    if purpose == "onecut_ad":
        from app.script.prompt_fragments import ONECUT_AD_SYSTEM_INSTRUCTION
        system = ONECUT_AD_SYSTEM_INSTRUCTION
    else:
        system = SYSTEM_INSTRUCTION
        if series_context:
            system += SERIES_SCRIPT_INSTRUCTION_ADDON
        elif is_ad:
            # brand_series: series=True → 연재 구조 addon
            system += get_ad_script_addon(target_cuts, series=(purpose == "brand_series"))
        else:
            system += STANDALONE_SCRIPT_INSTRUCTION_ADDON

    async def _generate_and_parse():
        raw = await generate_text(
            prompt=prompt,
            system_instruction=system,
            temperature=0.85,
            max_output_tokens=16384,
        )
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
        if text.startswith("json"):
            text = text[4:].strip()
        return json.loads(text)

    result = await _generate_and_parse()

    # 인스타툰/brand_series 컷 수 검증: target_cuts != 실제 컷 수 → 1회 재생성
    if target_cuts and target_cuts in (4, 6, 8, 10) and purpose != "onecut_ad":
        actual = sum(len(s.get("cuts", [])) for s in result.get("scenes", []))
        if actual != target_cuts:
            import logging
            logging.getLogger(__name__).warning(
                "Script cut count mismatch: target=%d actual=%d → retry once", target_cuts, actual
            )
            result = await _generate_and_parse()
            actual = sum(len(s.get("cuts", [])) for s in result.get("scenes", []))
            if actual != target_cuts:
                from fastapi import HTTPException
                raise HTTPException(
                    status_code=422,
                    detail=f"대본 컷 수가 맞지 않아요 ({actual}컷/{target_cuts}컷) — 다시 만들어 주세요",
                )

    return result


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
