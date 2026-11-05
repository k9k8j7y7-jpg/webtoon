"""설명 컷 프롬프트 — 시각 장치 6종 템플릿.

scratch/explain/generate.py에서 검증된 프롬프트를 그대로 이식.
단일 진입점 build_explain_clause(device, labels, ...).
"""

# ── 시각 장치 6종 (VALID_DEVICES) ──
VALID_DEVICES = ("zoom_inset", "icon_badges", "before_after", "steps", "size_compare", "process")

DEVICE_LABELS_KR = {
    "zoom_inset": "확대 단면",
    "icon_badges": "아이콘 배지",
    "before_after": "전·후 반반",
    "steps": "단계 패널",
    "size_compare": "크기 비교",
    "process": "작용 과정",
}

# ── 공통 머리 (scratch COMMON_HEAD + composition 지시) ──
_COMMON_HEAD = (
    "Advertising explainer panel in the same webtoon style. "
    "The character is the guide — holding or pointing at the product. "
    "The infographic element is drawn in the same webtoon line-and-color style, not photo. "
    "All text labels in Korean, spell exactly as specified. "
    "No other text, slogans, signs, or posters with words anywhere in the image. "
    "CRITICAL: reproduce the product label text exactly as on the reference photo. "
    "Clean composition, one focal element, leave negative space for labels."
)


def _visual_details_block(elements: list[str]) -> str:
    """elements 목록 → VISUAL DETAILS 프롬프트 블록."""
    if not elements:
        return ""
    items = "; ".join(elements[:5])
    return f"VISUAL DETAILS to include in the illustration: {items}."


def _palette_block(palette: list[str]) -> str:
    """palette 색명 목록 → 인포그래픽 강조색 지시."""
    if not palette:
        return ""
    colors = ", ".join(palette[:3])
    return f"Use these product colors for infographic accents: {colors}."


def _build_zoom_inset(labels: list[str]) -> str:
    label_text = labels[0] if labels else "특징"
    return (
        f"DEVICE: Zoom inset — the character points at the relevant body part. "
        f"A circular inset shows a cross-section detail. "
        f"Label inside or near the inset: '{label_text}' in bold Korean text."
    )


def _build_icon_badges(labels: list[str]) -> str:
    badges = labels[:3] if labels else ["특징1", "특징2", "특징3"]
    badge_lines = []
    icons = ["a green leaf icon", "a blue water drop icon", "a snowflake icon",
             "a star icon", "a heart icon"]
    for i, lbl in enumerate(badges):
        icon = icons[i % len(icons)]
        badge_lines.append(f"({i+1}) {icon}, label '{lbl}'")
    return (
        f"DEVICE: Icon badges — the character holds the product bottle upright. "
        f"Next to her, {len(badges)} circular badge icons: {', '.join(badge_lines)}. "
        f"Each badge has a small Korean label below it."
    )


def _build_before_after(labels: list[str]) -> str:
    before_lbl = labels[0] if len(labels) > 0 else "사용 전"
    after_lbl = labels[1] if len(labels) > 1 else "사용 후"
    return (
        f"DEVICE: Before/After split — the panel is split vertically in half. "
        f"LEFT side (before use): the character with an uncomfortable expression, "
        f"a small circular inset shows the problem area. The product must NOT appear on this side. "
        f"Label: '{before_lbl}'. "
        f"RIGHT side (after use): the same character with a refreshed happy expression, "
        f"holding the product in one hand, inset shows improvement. "
        f"Label: '{after_lbl}'. "
        f"A dividing line separates the two halves."
    )


def _build_steps(labels: list[str]) -> str:
    steps = labels[:3] if labels else ["① 1단계", "② 2단계", "③ 3단계"]
    step_lines = []
    for i, lbl in enumerate(steps):
        step_lines.append(f"Panel {i+1}: {lbl}")
    return (
        f"DEVICE: Step mini-panels — the character holds the product at the top. "
        f"Below her, {len(steps)} small sequential panels showing usage steps: "
        f"{'. '.join(step_lines)}. "
        f"Each panel has its Korean label."
    )


def _build_size_compare(labels: list[str], compare: str = "") -> str:
    size_lbl = labels[0] if labels else "대용량"
    compare_text = ""
    if compare:
        compare_text = (
            f" Next to it, a smaller {compare} silhouette (gray outline only, generic). "
            f"A size arrow or bracket shows the difference."
        )
    return (
        f"DEVICE: Size comparison — the character holds the large product with both hands, smiling."
        f"{compare_text} "
        f"Label: '{size_lbl}' in bold Korean text near the large bottle."
    )


def _build_process(labels: list[str]) -> str:
    """작용 과정 — steps 변형, 제품이 어떻게 작용하는지 물리적 과정 3패널."""
    panels = labels[:3] if labels else ["① 과정1", "② 과정2", "③ 과정3"]
    panel_lines = []
    for i, lbl in enumerate(panels):
        panel_lines.append(f"Panel {i+1}: {lbl}")
    return (
        f"DEVICE: Process mini-panels — the character presents the product mechanism. "
        f"Three small panels showing how the product works on a physical level: "
        f"{'. '.join(panel_lines)}. "
        f"Draw each panel as a simple diagram/cross-section in webtoon style. "
        f"Each panel has its Korean label."
    )


_DEVICE_BUILDERS = {
    "zoom_inset": _build_zoom_inset,
    "icon_badges": _build_icon_badges,
    "before_after": _build_before_after,
    "steps": _build_steps,
    "size_compare": _build_size_compare,
    "process": _build_process,
}


def build_explain_clause(
    device: str,
    labels: list[str],
    product_name: str = "",
    compare: str = "",
    elements: list[str] | None = None,
    palette: list[str] | None = None,
    mechanism: str = "",
) -> str:
    """설명 컷 프롬프트 clause — 장치별 템플릿.

    Args:
        device: 장치 키 (VALID_DEVICES)
        labels: 한글 라벨 목록
        compare: size_compare 비교 대상
        elements: 그릴 요소 3~5개 (한글)
        palette: 제품 주색 2~3개 (영문 색명)
        mechanism: 물리적 작용 한 줄

    Returns: build_cut_prompt의 extra_prompt로 주입할 문자열.
    """
    if device not in _DEVICE_BUILDERS:
        return ""

    parts = [_COMMON_HEAD]

    # 장치별 템플릿
    if device == "size_compare":
        parts.append(_build_size_compare(labels, compare))
    else:
        builder = _DEVICE_BUILDERS[device]
        parts.append(builder(labels))

    # mechanism (작용 원리 한 줄)
    if mechanism:
        parts.append(f"The key mechanism: {mechanism}.")

    # elements → VISUAL DETAILS
    vd = _visual_details_block(elements or [])
    if vd:
        parts.append(vd)

    # palette → 강조색
    pb = _palette_block(palette or [])
    if pb:
        parts.append(pb)

    return " ".join(parts)
