"""연출 강도 — 감정·행동 기반 만화 효과 프롬프트 생성.

3단계: light(담백) / normal(보통) / strong(과장)
에피소드 기본값: gate_status.drama_level, 광고형 기본 light, 일반 기본 normal
컷 덮어쓰기: cut.spec.drama_level (있으면 에피소드 기본값 대신 사용)
"""

import logging

logger = logging.getLogger(__name__)

VALID_LEVELS = ("light", "normal", "strong")

# ── 감정 → 카테고리 매핑 (소문자 키워드 포함 검색) ──

_EMOTION_MAP = {
    "joy": [
        "happy", "joy", "joyful", "excited", "delighted", "cheerful",
        "love", "loving", "affection", "affectionate", "ecstatic",
        "pleased", "content", "bliss", "elated", "playful", "smiling",
        "amused", "grinning",
    ],
    "sad": [
        "sad", "crying", "tears", "lonely", "grief", "melancholy",
        "sorrowful", "heartbroken", "depressed", "gloomy", "mournful",
        "longing", "wistful",
    ],
    "anger": [
        "angry", "furious", "annoyed", "irritated", "enraged", "rage",
        "frustrated", "hostile", "livid",
    ],
    "shock": [
        "surprised", "shocked", "astonished", "startled", "stunned",
        "amazed", "bewildered",
    ],
    "flustered": [
        "nervous", "embarrassed", "anxious", "worried", "panicked",
        "confused", "awkward", "flustered", "shy", "bashful",
        "self-conscious",
    ],
    "fear": [
        "scared", "afraid", "terrified", "horrified", "frightened",
        "dread", "uneasy",
    ],
    "tired": [
        "tired", "exhausted", "sleepy", "bored", "weary", "drowsy",
        "lethargic", "yawning",
    ],
    "calm": [
        "neutral", "calm", "curious", "thoughtful", "serious",
        "peaceful", "relaxed", "focused", "composed", "stoic",
        "determined", "pensive", "contemplative",
    ],
}

# 역방향 lookup (keyword → category)
_KEYWORD_TO_CATEGORY: dict[str, str] = {}
for _cat, _words in _EMOTION_MAP.items():
    for _w in _words:
        _KEYWORD_TO_CATEGORY[_w] = _cat

# action 키워드 → 추가 motion 태그
_ACTION_MOTIONS = {
    "motion_fall": ["fall", "trip", "slip", "stumble", "collapse", "tumble"],
    "motion_fast": ["run", "chase", "jump", "dash", "sprint", "rush", "leap"],
    "impact": ["hit", "bump", "crash", "smash", "punch", "kick", "slam", "collide"],
}


def normalize_emotion(emotion_str: str, action_str: str = "") -> tuple[str, list[str]]:
    """감정 문자열 → (category, motions) 반환."""
    emotion_lower = (emotion_str or "neutral").lower().strip()

    # 1. 정확히 일치하는 키워드 검색
    category = _KEYWORD_TO_CATEGORY.get(emotion_lower)

    # 2. 포함 검색
    if not category:
        for kw, cat in _KEYWORD_TO_CATEGORY.items():
            if kw in emotion_lower:
                category = cat
                break

    category = category or "calm"

    # 3. action에서 motion 태그 추출
    motions = []
    action_lower = (action_str or "").lower()
    for motion_tag, keywords in _ACTION_MOTIONS.items():
        for kw in keywords:
            if kw in action_lower:
                motions.append(motion_tag)
                break

    return category, motions


# ── 카테고리별 효과 사전 ──

_NORMAL_EFFECTS = {
    "joy": (
        "small sparkles and stars around the character, "
        "bright shining eyes with highlight reflections, "
        "tiny floating hearts near the character"
    ),
    "sad": (
        "small tear drops at the corners of the eyes, "
        "subtle downcast shadow on the upper face, "
        "slightly drooping body language lines"
    ),
    "anger": (
        "small anger vein mark (cruciform) on the forehead, "
        "short sharp emphasis lines around the head, "
        "slightly gritted teeth or tight expression"
    ),
    "shock": (
        "thin vertical shock lines beside the face, "
        "wide round eyes with shrunk irises, "
        "a small sweat drop near the temple"
    ),
    "flustered": (
        "two or three sweat drops near the face, "
        "light blush marks on both cheeks, "
        "subtle wobble lines around the character's outline"
    ),
    "fear": (
        "thin trembling lines around the character's body, "
        "slightly pale face shading, "
        "a cold sweat drop on the forehead"
    ),
    "tired": (
        "drooping posture with weight on one side, "
        "a small sigh puff cloud near the mouth, "
        "slightly heavy eyelids drawn half-closed"
    ),
    "calm": "",  # 표정만
}

_MOTION_EFFECTS = {
    "motion_fall": "dust puff cloud at ground level, small dizzy spiral and stars above the head",
    "motion_fast": "horizontal speed lines trailing behind the moving character, subtle motion blur on limbs",
    "impact": "short radial impact burst lines at the point of contact",
}

_NORMAL_TAIL = (
    "Effects drawn in the same line style as the illustration, modest size, "
    "must not cover faces or speech bubble areas. "
    "Do NOT draw any written sound effects, letters, or onomatopoeia"
)

_STRONG_EXTRA = (
    "Exaggerated pose and expression for dramatic visual impact. "
    "Focus lines (集中線) radiate from the scene's focal point but only in the outer 30% of the frame — "
    "background details, character faces, and center area stay fully legible. "
    "All effects are larger and bolder than moderate level. "
    "Character design, face, hair, and outfit remain identical to the reference sheet despite exaggeration. "
    "Do NOT draw any written sound effects, letters, or onomatopoeia"
)

_STRONG_CATEGORY_BOOST = {
    "joy": "many more sparkles and hearts, dramatic spotlight glow behind the character",
    "sad": "visible tear streams, rain-like hatching lines in the background",
    "anger": "larger vein marks, fierce aura lines, dramatic dark shading behind",
    "shock": "full-frame vertical shock lines, extremely dilated eyes, multiple sweat drops",
    "flustered": "profuse sweat drops, heavy blush, whole body wobble lines, steam puff from ears",
    "fear": "heavy trembling lines, dark vignette shadow creeping in from edges",
    "tired": "larger spiral above head, visible soul-leaving-body wisp effect",
    "calm": "subtle dramatic spotlight to emphasize composure",
}


def build_drama_prompt(
    level: str,
    category: str,
    motions: list[str],
    is_photo_real: bool = False,
    is_bw: bool = False,
) -> str:
    """연출 강도에 따른 효과 프롬프트 문자열을 생성한다."""
    if level not in VALID_LEVELS:
        level = "normal"

    # light: 효과 없음
    if level == "light":
        return ""

    parts = []

    # 실사 전제
    if is_photo_real:
        parts.append(
            "All manga effects are 2D webtoon-style overlays drawn around the real person; "
            "the real person stays photoreal"
        )

    # 흑백 전제
    if is_bw:
        parts.append("All effects in monochrome ink lines and screentone patterns")

    # normal 효과
    base_effects = _NORMAL_EFFECTS.get(category, "")
    if base_effects:
        parts.append(base_effects)

    # motion 효과
    for m in motions:
        me = _MOTION_EFFECTS.get(m)
        if me:
            parts.append(me)

    if level == "normal":
        parts.append(_NORMAL_TAIL)
    elif level == "strong":
        # normal 기반 + 과장
        boost = _STRONG_CATEGORY_BOOST.get(category, "")
        if boost:
            parts.append(boost)
        for m in motions:
            parts.append(f"(stronger) {_MOTION_EFFECTS.get(m, '')}")
        parts.append(_STRONG_EXTRA)

    if not parts:
        return ""

    header = "MANGA VISUAL EFFECTS" if level == "normal" else "MANGA VISUAL EFFECTS (dramatic, bold)"
    return f"\n\n{header}:\n- " + "\n- ".join(p for p in parts if p)


def resolve_level(gate_status: dict | None, cut_spec: dict | None) -> str:
    """컷의 최종 연출 강도를 결정한다.

    우선순위: cut_spec.drama_level > gate_status.drama_level > is_ad 기본값
    """
    # 1. 컷 덮어쓰기
    if cut_spec and cut_spec.get("drama_level") in VALID_LEVELS:
        return cut_spec["drama_level"]

    # 2. 에피소드 기본값
    gs = gate_status or {}
    ep_level = gs.get("drama_level")
    if ep_level in VALID_LEVELS:
        return ep_level

    # 3. 광고형 기본 light, 일반 기본 normal
    return "light" if gs.get("is_ad") else "normal"
