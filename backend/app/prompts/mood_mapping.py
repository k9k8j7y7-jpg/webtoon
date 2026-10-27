"""분위기 → 스타일·연출·실사 매핑.

Gate3 자동 제안용 기본값. 사용자가 변경 가능.
"""

MOOD_TO_STYLE = {
    "premium":    "emotional_romance",   # 깔끔 톤
    "webtoon":    "korean_webtoon",
    "humor":      "korean_webtoon",
    "emotional":  "emotional_romance",
    "photo_real": "korean_webtoon",      # 스타일은 일반, 캐릭터가 실사
    "ai_pick":    None,                  # 기획안에서 추천
}

MOOD_TO_DRAMA = {
    "premium":    "light",
    "webtoon":    "normal",
    "humor":      "strong",
    "emotional":  "light",
    "photo_real": "light",
    "ai_pick":    "normal",
}

MOOD_TO_PHOTO_REAL = {
    "premium":    False,
    "webtoon":    False,
    "humor":      False,
    "emotional":  False,
    "photo_real": True,    # 실사 캐릭터 권장
    "ai_pick":    False,
}

MOOD_TO_COLOR_HINT = {
    "premium":    "clean pastel, muted tones",
    "webtoon":    "vivid, saturated colors",
    "humor":      "bold, pop-art colors",
    "emotional":  "warm golden, soft focus",
    "photo_real": "natural lighting, realistic tones",
    "ai_pick":    "",
}


def get_mood_defaults(mood: str) -> dict:
    """분위기 키 → 기본값 dict. 없는 키면 ai_pick 폴백."""
    return {
        "style": MOOD_TO_STYLE.get(mood, MOOD_TO_STYLE["ai_pick"]),
        "drama_level": MOOD_TO_DRAMA.get(mood, "normal"),
        "photo_real_recommended": MOOD_TO_PHOTO_REAL.get(mood, False),
        "color_hint": MOOD_TO_COLOR_HINT.get(mood, ""),
    }
