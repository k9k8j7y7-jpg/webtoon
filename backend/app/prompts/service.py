"""Prompt Engine — 컷 명세 → 최종 이미지 프롬프트 조립.

PRD 4.4: 프롬프트 프리셋 + 캐릭터 시트 앵커 + 장소 레퍼런스 앵커.
A-2/A-3: 캐릭터 앵커링 최우선, 프롬프트 순서 재조정.
"""

# ── 프롬프트 조각 상수 ──
APPEARANCE_ANCHOR = "MUST keep these features exactly in every illustration"
PLACEMENT_COMMON_SENSE = (
    "Camera at human eye level unless the storyboard says otherwise. "
    "Use real-world scale anchors: doorways and shop signs are about the character's height; "
    "car roofs reach the character's waist to chest; tables reach the hip; chairs the knee. "
    "NEVER shrink the environment to fit the character — instead CROP it: "
    "show only the lower 1-2 floors of buildings, cut off the tops. "
    "The character must never be taller than a door, a car, or a single building floor"
)

SHOT_SCALE_GUIDE = {
    "long": (
        "Wide shot: the full scene is visible, characters are small within the environment. "
        "The surroundings dominate the frame. Buildings, streets, and sky are at real scale"
    ),
    "full": (
        "Full shot: the character's full body occupies roughly 60-75% of the frame height, "
        "feet visible near the bottom. The surroundings are at street/room level and cropped "
        "by the frame edges, not miniaturized. Background objects near the character must match her real size"
    ),
    "bust": (
        "Medium shot from the chest up. Background furniture and architecture are at realistic "
        "human scale and partially cut off by the frame"
    ),
    "close_up": (
        "Close-up of the face/hands; background is a soft, tightly cropped fragment of the environment"
    ),
}

LOCATION_REFRAME = (
    "The attached location image is a reference for the setting's look only. "
    "Do NOT reproduce it as a separate image or panel. "
    "Draw the scene INSIDE this location from the described camera angle. "
    "Re-frame it from the character's eye level at the described scale — "
    "do not paste it as a distant wide vista behind the character(s)"
)


def _get_char_name(desc) -> str:
    """character_descs 값에서 이름 추출 (str 또는 dict 호환)."""
    if isinstance(desc, dict):
        return desc.get("name", "")
    return desc  # 하위 호환: 문자열이면 그대로 이름


def _get_char_appearance(desc) -> str:
    """character_descs 값에서 appearance_en 추출."""
    if isinstance(desc, dict):
        return desc.get("appearance_en", "")
    return ""


def build_cut_prompt(
    cut_spec: dict,
    character_descs: dict[str, str | dict],
    location_desc: str | None,
    style_prompt: str,
    project_rules: dict | None = None,
    loc_is_photo: bool = False,
    loc_image_attached: bool = False,
    aspect_ratio: str = "9:16",
    product_desc: str = "",
    has_photo_real_char: bool = False,
) -> str:
    """컷 명세로부터 이미지 생성 프롬프트를 조립한다.

    순서 (A-3): 캐릭터 앵커링 → 캐릭터 표정/포즈 → 장소/액션 → 스타일 → 샷/강조
    """

    # 프롬프트 오버라이드 체크
    if cut_spec.get("prompt_override"):
        return cut_spec["prompt_override"]

    parts = []

    characters = cut_spec.get("characters", [])
    char_ids_with_ref = [c.get("character_id") for c in characters if c.get("character_id") and c.get("character_id") in character_descs]
    photo_real_ids = [
        cid for cid in char_ids_with_ref
        if isinstance(character_descs.get(cid), dict) and character_descs[cid].get("is_photo_real")
    ] if has_photo_real_char else []

    def _ref_tag(char_id: str) -> str:
        """실제 첨부 순번 기준 'Image N' / 'Images N, M' (실사 경로). 없으면 캐릭터 순서."""
        nums = character_descs[char_id].get("ref_images") if isinstance(character_descs.get(char_id), dict) else None
        if has_photo_real_char and nums:
            return ("Image " if len(nums) == 1 else "Images ") + ", ".join(str(n) for n in nums)
        if char_id in char_ids_with_ref:
            return f"Image {char_ids_with_ref.index(char_id) + 1}"
        return ""

    # ── 0a. 실사 인물 포함 컷: 화면 전체가 웹툰 일러스트임을 맨 앞에 못 박는다 ──
    # (실사 지시가 배경·다른 인물·동물로 번져 사진처럼 그려지는 문제 방지)
    if has_photo_real_char:
        parts.append(
            "This entire image is a 2D Korean webtoon illustration: flat cel shading, clean line art, "
            "illustrated background, furniture, props, other animals and other people"
        )
        if photo_real_ids:
            names = ", ".join(
                f"'{cid}' ({_ref_tag(cid)})" for cid in photo_real_ids
            )
            parts.append(
                f"The ONLY exception: the person from the reference photo(s) — {names} — keeps their real face, "
                f"body, age, hairstyle and exact outfit from the photo, as if a real person is placed inside a "
                f"cartoon world, even when small or distant in the frame. Everything else — every animal, every "
                f"other person, the whole background — is drawn as 2D illustration, never photographic"
            )

    # ── 0. 단일 일러스트 강제 (패널 분할 방지) ──
    parts.append(
        "Output exactly ONE single-panel illustration that fills the entire canvas edge to edge. "
        "NO panel borders, NO split frames, NO stacked or side-by-side panels, NO collage, "
        "NO establishing shot above the scene. One continuous moment only"
    )

    # ── 1. 캐릭터 앵커링 지시 (A-2: 최우선) ──
    if char_ids_with_ref:
        # 이미지-캐릭터 매핑 (A-1)
        mapping_str = ", ".join(f"{_ref_tag(cid)} = {cid}" for cid in char_ids_with_ref)

        parts.append(
            f"CRITICAL: The characters in this image MUST exactly match the provided reference images. "
            f"Replicate their facial features, hairstyle, hair color, age, and body type precisely. "
            f"Only change their expression and pose to fit the scene. "
            f"NEVER alter the character's facial identity or appearance. "
            f"{mapping_str}"
        )

    # ── 1.5. 실사 캐릭터 전용 강화 지시 ──
    if has_photo_real_char:
        webtoon_ids = [cid for cid in char_ids_with_ref if cid not in photo_real_ids]

        if photo_real_ids:
            parts.append(
                f"Real person(s) ({', '.join(photo_real_ids)}): keep EXACT face, body shape, age, skin tone, "
                f"hairstyle and outfit as in the photo. NEVER alter facial identity, body proportions, age or clothes"
            )
        if webtoon_ids:
            parts.append(
                f"Illustrated character(s) ({', '.join(webtoon_ids)}): drawn in 2D webtoon style exactly like "
                f"their reference sheet — match its proportions and eye size, never photographic, "
                f"no chibi exaggeration, no SD (super-deformed) style"
            )

    # ── 2. 캐릭터별 외형 명세 + 표정·포즈 ──
    for char in characters:
        char_id = char.get("character_id", "")
        desc = character_descs.get(char_id, "")
        name = _get_char_name(desc)
        appearance = _get_char_appearance(desc)
        emotion = char.get("emotion", "neutral")
        pose = char.get("pose", "")

        if appearance:
            # appearance_en이 있으면 명세 블록 주입
            ref_tag = _ref_tag(char_id) if char_id in character_descs else ""
            img_tag = f" ({ref_tag})" if ref_tag else ""
            char_prompt = (
                f"Character '{char_id}'{img_tag}: {appearance}. "
                f"{APPEARANCE_ANCHOR}. "
                f"Currently {emotion} expression"
            )
        else:
            # appearance_en 없으면 기존 형식 (회귀 무영향)
            char_prompt = f"Character '{char_id}': {name}, {emotion} expression"

        if pose:
            char_prompt += f", {pose}"
        parts.append(char_prompt)

    # ── 3. 장소·상황 ──
    if location_desc:
        # 실사 인물 컷: 장소 묘사가 배경을 사진처럼 끌지 않도록 일러스트 접두
        loc_text = (
            f"illustrated in the webtoon style — {location_desc}" if has_photo_real_char else location_desc
        )
        if loc_image_attached:
            parts.append(f"Setting: {loc_text}")
            parts.append(LOCATION_REFRAME)
        else:
            parts.append(f"Setting (text description only, no location image attached): {loc_text}")

    if loc_is_photo:
        parts.append(
            f"IMPORTANT: The location reference is a real photograph. "
            f"Use it ONLY to understand the room's spatial layout, furniture placement, and camera angle. "
            f"You MUST NOT reproduce its photographic textures, lighting, or realism. "
            f"REDRAW everything — walls, furniture, floor, background — in {style_prompt} illustration style "
            f"with visible line art and flat/cel shading. "
            f"The final image must be 100% hand-drawn illustration. "
            f"A photograph background with drawn characters is a FAILURE"
        )

    action = cut_spec.get("action")
    if action:
        parts.append(f"Scene: {action}")

    # ── 3.5. 제품 (광고 에피소드) ──
    if product_desc:
        parts.append(
            f"{product_desc}"
            f"Draw the product matching the provided product reference sheet. "
            f"CRITICAL: The product must be realistically sized relative to characters — "
            f"a hand-held bottle stays hand-sized, a package stays table-sized. "
            f"NEVER make the product giant or background-sized. "
            f"Show it naturally held, placed on a surface, or used by a character"
        )

    # ── 4. 스타일 (얼굴 정체성을 덮지 않는 선에서) ──
    if has_photo_real_char:
        parts.append(
            f"{style_prompt}. Apply this art style to the whole image — background, props, animals and "
            f"illustrated characters. Only the real person from the photo keeps their real face and body"
        )
    else:
        parts.append(f"{style_prompt}. Apply this art style to coloring and rendering only, preserve character facial identity from references")

    # ── 5. 샷 타입·강조 ──
    shot = cut_spec.get("shot", "full")
    parts.append(SHOT_SCALE_GUIDE.get(shot, SHOT_SCALE_GUIDE["full"]))

    # ── 5.5. 다인물 세로 프레임 구도 ──
    num_chars = len(characters)
    if num_chars >= 2 and shot in ("bust", "close_up") and aspect_ratio in ("9:16", "3:4"):
        parts.append(
            "With two or more characters in a tall frame, stage them at different depths "
            "(one closer to camera, one slightly behind) or slightly overlapping, "
            "so the composition fits the vertical canvas naturally"
        )

    emphasis = cut_spec.get("emphasis", "normal")
    if emphasis == "full_bleed":
        parts.append("dramatic full-bleed illustration, cinematic")
    elif emphasis == "large":
        parts.append("emphasized dramatic moment")

    # ── 6. 프로젝트 규칙 ──
    if project_rules:
        forbidden = project_rules.get("forbidden", [])
        if forbidden:
            parts.append(f"Avoid: {', '.join(forbidden)}")
        world_rules = project_rules.get("world_rules", [])
        if world_rules:
            parts.append(f"World: {', '.join(world_rules)}")

    # ── 7. 웹툰 기본 지시 ──
    parts.append(PLACEMENT_COMMON_SENSE)
    if aspect_ratio in ("9:16", "3:4"):
        format_desc = "vertical portrait format"
    elif aspect_ratio in ("16:9", "4:3"):
        format_desc = "horizontal landscape format"
        parts.append(
            "Characters occupy 60-80% of the frame HEIGHT, environment extends to the sides"
        )
    else:
        format_desc = "square format"
    parts.append(
        f"A single illustration, {format_desc}, clean composition. "
        "DO NOT render any text, letters, words, or speech bubbles in the image. "
        "No Korean text, no English text, no signs, no captions. Pure illustration only"
    )

    return ". ".join(parts)
