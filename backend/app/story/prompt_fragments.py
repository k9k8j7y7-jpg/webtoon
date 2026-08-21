"""기획 프롬프트 조각 — 장르/분위기/이야기 전개 선택값별 주입 문장.

추후 프롬프트 컴파일러의 부품으로 재사용할 수 있도록 dict로 분리.
키가 None이거나 dict에 없으면 빈 문자열 반환 (현행 동작 유지).
"""

GENRE_FRAGMENTS: dict[str, str] = {
    "romance": "이 웹툰의 장르는 로맨스다. 감정선과 관계 변화를 중심으로 전개할 것.",
    "daily": "이 웹툰의 장르는 일상/힐링이다. 소소한 일상 속 따뜻한 순간을 그릴 것.",
    "comedy": "이 웹툰의 장르는 코미디다. 웃음 포인트와 유머러스한 상황을 중심으로 전개할 것.",
    "thriller": "이 웹툰의 장르는 스릴러다. 긴장감과 서스펜스를 유지하며 전개할 것.",
    "fantasy": "이 웹툰의 장르는 판타지다. 초자연적 요소와 세계관 규칙을 명확히 설정할 것.",
    "drama": "이 웹툰의 장르는 드라마다. 인물 간 갈등과 감정의 깊이를 중심으로 전개할 것.",
}

MOOD_FRAGMENTS: dict[str, str] = {
    "warm": "전체적으로 따뜻하고 포근한 톤으로, 부드러운 색감과 온기가 느껴지도록.",
    "cheerful": "밝고 유쾌한 톤으로, 경쾌한 분위기와 활기찬 색감으로.",
    "tense": "긴장감 있는 톤으로, 불안과 서스펜스가 느껴지는 무거운 분위기로.",
    "touching": "먹먹하고 감동적인 톤으로, 여운이 남는 감성적인 분위기로.",
    "dark": "어둡고 무거운 톤으로, 그림자와 대비가 강한 분위기로.",
}

DEVELOPMENT_FRAGMENTS: dict[str, str] = {
    "calm": (
        "큰 사건 없이 감정선 중심으로 전개할 것. "
        "기승전결의 '전'을 약하게 하고, 마지막 컷은 여운으로 마무리."
    ),
    "dramatic": (
        "갈등 발생-심화-위기-해소의 뚜렷한 기승전결 구조로 전개할 것. "
        "중반에 명확한 위기를 배치."
    ),
    "twist": (
        "마지막 1~2컷에서 앞의 전제가 뒤집히는 반전을 넣을 것. "
        "복선을 중반에 1개 이상 심을 것."
    ),
    "hook": (
        "1~2컷에 가장 강한 사건이나 충격을 배치하고, "
        "3컷부터 그 경위를 설명하는 구조로."
    ),
    "growth": (
        "주인공이 낮은 상태나 위기에서 시작해, 노력과 계기를 거쳐 상승하는 구조. "
        "마지막 컷은 성취 또는 다음 도약."
    ),
    "mystery": (
        "첫 컷에 의문을 제시하고, 단서를 조금씩 배치할 것. "
        "마지막 컷은 전부 해소하지 않고 여운이나 질문을 남길 것."
    ),
    "cliffhanger": (
        "마지막 컷은 해소 없이 새로운 위기나 폭탄 선언으로 종료. "
        "다음 화 궁금증을 유발하는 구조."
    ),
}


def build_story_options_prompt(story_options: dict | None) -> str:
    """story_options dict에서 프롬프트 조각을 조립해 반환한다.

    story_options가 None이거나 모든 키가 미선택이면 빈 문자열 반환 (하위 호환).
    """
    if not story_options:
        return ""

    parts: list[str] = []

    genre = story_options.get("genre")
    if genre and genre in GENRE_FRAGMENTS:
        parts.append(GENRE_FRAGMENTS[genre])

    mood = story_options.get("mood")
    if mood and mood in MOOD_FRAGMENTS:
        parts.append(MOOD_FRAGMENTS[mood])

    development = story_options.get("development")
    if development and development in DEVELOPMENT_FRAGMENTS:
        parts.append(DEVELOPMENT_FRAGMENTS[development])

    if not parts:
        return ""

    return "\n\n연출 지시:\n" + "\n".join(f"- {p}" for p in parts)
