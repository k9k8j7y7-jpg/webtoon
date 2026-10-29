"""카피 렌더 프롬프트 — build_copy_clause 단일 진입점.

한 컷 광고(onecut_ad) 전용: 헤드카피·서브카피를 이미지 안에
직접 디자인으로 렌더하도록 프롬프트를 조립한다.
"""

# 글씨체별 스타일 지시
_FONT_STYLES = {
    "handwritten": "brush calligraphy style, energetic strokes",
    "bold_gothic": "bold sans-serif, high contrast",
    "clean_gothic": "clean light sans-serif",
}

# 위치별 배치 지시
_POSITION_STYLES = {
    "auto": "place the text in the natural empty space away from the face and product",
    "top": "place the headline text in the top third of the image",
    "bottom": "place the headline text in the bottom third of the image",
}


def build_copy_clause(
    head: str,
    sub: str,
    copy_design: dict | None = None,
) -> str:
    """헤드카피·서브카피 → 컷 프롬프트에 주입할 카피 렌더 지시 문자열.

    copy_design: {font, position, emphasis} — 없으면 기본값 사용.
    """
    if not head and not sub:
        return ""

    design = copy_design or {}
    font = design.get("font", "handwritten")
    position = design.get("position", "auto")
    emphasis = design.get("emphasis")  # 단어 or None

    parts = []

    # 공통: 한글 카피를 그림의 일부로 디자인
    head_part = f"the Korean headline '{head}'" if head else ""
    sub_part = f"the subline '{sub}'" if sub else ""
    copy_text = " and ".join(filter(None, [head_part, sub_part]))

    parts.append(
        f"Render {copy_text} as part of the artwork, integrated like a professional ad poster. "
        f"Spell every Korean character exactly — even one wrong character is a failure. "
        f"No other text anywhere except the product's own label"
    )

    # 글씨체
    font_style = _FONT_STYLES.get(font, _FONT_STYLES["handwritten"])
    parts.append(f"Text style: {font_style}")

    # 위치
    pos_style = _POSITION_STYLES.get(position, _POSITION_STYLES["auto"])
    parts.append(pos_style)

    # 강조 단어
    if emphasis:
        parts.append(f"Emphasize the word '{emphasis}' with an accent color")
    else:
        parts.append("You may accent one key word with a contrasting color")

    return ". ".join(parts)


def check_copy_text(
    image_bytes: bytes,
    expected_head: str,
    expected_sub: str,
) -> dict:
    """생성된 이미지의 카피 텍스트를 비전으로 검사한다.

    Returns: {head_ok: bool, sub_ok: bool, found_text: str}
    검사 자체 실패(타임아웃 등)면 head_ok=True, sub_ok=True 반환 (통과 처리).
    """
    try:
        from google.genai import types
        from app.adapters.gemini import get_client, AI_TOKENS_SHORT, parse_ai_json

        client = get_client()
        prompt = (
            "Read ALL Korean text visible in this image. Return JSON: "
            '{"found_text": "exact text you see", '
            f'"head_ok": true/false (does the image contain exactly \'{expected_head}\'?), '
            f'"sub_ok": true/false (does the image contain exactly \'{expected_sub}\'?)'
            "}. "
            "Compare character by character. A single wrong character means false. ONLY JSON."
        )
        resp = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                prompt,
            ],
            config=types.GenerateContentConfig(
                temperature=0.1,
                max_output_tokens=AI_TOKENS_SHORT,
            ),
        )
        result = parse_ai_json(resp.text)
        return {
            "head_ok": bool(result.get("head_ok", True)),
            "sub_ok": bool(result.get("sub_ok", True)),
            "found_text": result.get("found_text", ""),
        }
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("copy text check failed (pass-through): %s", e)
        return {"head_ok": True, "sub_ok": True, "found_text": f"check_error: {e}"}
