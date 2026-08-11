"""Prompt Engine — 컷 명세 → 최종 이미지 프롬프트 조립.

PRD 4.4: 프롬프트 프리셋 + 캐릭터 시트 앵커 + 장소 레퍼런스 앵커.
A-2/A-3: 캐릭터 앵커링 최우선, 프롬프트 순서 재조정.
"""


def build_cut_prompt(
    cut_spec: dict,
    character_descs: dict[str, str],
    location_desc: str | None,
    style_prompt: str,
    project_rules: dict | None = None,
) -> str:
    """컷 명세로부터 이미지 생성 프롬프트를 조립한다.

    순서 (A-3): 캐릭터 앵커링 → 캐릭터 표정/포즈 → 장소/액션 → 스타일 → 샷/강조
    """

    # 프롬프트 오버라이드 체크
    if cut_spec.get("prompt_override"):
        return cut_spec["prompt_override"]

    parts = []

    # ── 1. 캐릭터 앵커링 지시 (A-2: 최우선) ──
    characters = cut_spec.get("characters", [])
    char_ids_with_ref = [c.get("character_id") for c in characters if c.get("character_id") and c.get("character_id") in character_descs]

    if char_ids_with_ref:
        # 이미지-캐릭터 매핑 (A-1)
        mapping_parts = []
        for i, char_id in enumerate(char_ids_with_ref):
            mapping_parts.append(f"Image {i + 1} = {char_id}")
        mapping_str = ", ".join(mapping_parts)

        parts.append(
            f"CRITICAL: The characters in this image MUST exactly match the provided reference images. "
            f"Replicate their facial features, hairstyle, hair color, age, and body type precisely. "
            f"Only change their expression and pose to fit the scene. "
            f"NEVER alter the character's facial identity or appearance. "
            f"{mapping_str}"
        )

    # ── 2. 캐릭터별 표정·포즈 ──
    for char in characters:
        char_id = char.get("character_id", "")
        desc = character_descs.get(char_id, "")
        emotion = char.get("emotion", "neutral")
        pose = char.get("pose", "")

        char_prompt = f"Character '{char_id}': {desc}, {emotion} expression"
        if pose:
            char_prompt += f", {pose}"
        parts.append(char_prompt)

    # ── 3. 장소·상황 ──
    if location_desc:
        parts.append(f"Setting: {location_desc}")

    action = cut_spec.get("action")
    if action:
        parts.append(f"Scene: {action}")

    # ── 4. 스타일 (얼굴 정체성을 덮지 않는 선에서) ──
    parts.append(f"{style_prompt}. Apply this art style to coloring and rendering only, preserve character facial identity from references")

    # ── 5. 샷 타입·강조 ──
    shot_map = {
        "long": "wide shot, full scene view",
        "full": "full body shot",
        "bust": "bust shot, upper body",
        "close_up": "close-up shot, face detail",
    }
    shot = cut_spec.get("shot", "full")
    parts.append(shot_map.get(shot, "medium shot"))

    emphasis = cut_spec.get("emphasis", "normal")
    if emphasis == "full_bleed":
        parts.append("dramatic full-page illustration, cinematic")
    elif emphasis == "large":
        parts.append("emphasized panel, dramatic moment")

    # ── 6. 프로젝트 규칙 ──
    if project_rules:
        forbidden = project_rules.get("forbidden", [])
        if forbidden:
            parts.append(f"Avoid: {', '.join(forbidden)}")
        world_rules = project_rules.get("world_rules", [])
        if world_rules:
            parts.append(f"World: {', '.join(world_rules)}")

    # ── 7. 웹툰 기본 지시 ──
    parts.append(
        "Webtoon panel illustration, vertical scroll format, clean composition. "
        "DO NOT render any text, letters, words, or speech bubbles in the image. "
        "No Korean text, no English text, no signs, no captions. Pure illustration only"
    )

    return ". ".join(parts)
