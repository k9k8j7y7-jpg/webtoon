"""말풍선 자동 매핑 — dialogue type + character emotion → bubble_style 결정.

B-2: 자동 선택 규칙. 애매한 감정은 round(기본)으로.
"""

# 명확한 감정 → 말풍선 스타일 매핑
EMOTION_TO_BUBBLE = {
    "angry": "angry",
    "furious": "angry",
    "rage": "angry",
    "sad": "sad",
    "crying": "sad",
    "tearful": "sad",
    "happy": "happy",
    "joyful": "happy",
    "excited": "happy",
    "surprised": "surprised",
    "shocked": "surprised",
    "startled": "surprised",
    "shy": "shy",
    "embarrassed": "shy",
    "flustered": "flustered",
    "confused": "flustered",
    "panicked": "flustered",
    "realization": "realize",
    "enlightened": "realize",
}

# 유효한 말풍선 스타일 키
VALID_STYLES = {
    "round", "narration", "thought", "whisper",
    "shout", "angry", "happy", "sad", "surprised",
    "shy", "flustered", "realize",
}


def resolve_bubble_style(dialogue_item: dict, cut_spec: dict | None = None) -> str:
    """dialogue 아이템의 말풍선 스타일을 결정한다.

    Args:
        dialogue_item: {"type": "speech", "speaker": "hero", "text": "...", "bubble_style": null}
        cut_spec: 컷 전체 spec (characters의 emotion 참조용)

    Returns:
        말풍선 스타일 키 (round, narration, thought, whisper, shout, angry, ...)
    """
    # 1. 사용자 수동 지정이 있으면 그대로 사용
    user_style = dialogue_item.get("bubble_style")
    if user_style and user_style in VALID_STYLES:
        return user_style

    dtype = dialogue_item.get("type", "speech")

    # 2. narration → narration
    if dtype == "narration":
        return "narration"

    # 3. thought → thought
    if dtype == "thought":
        return "thought"

    # 4. speech → 캐릭터 감정 기반 매핑
    if dtype == "speech" and cut_spec:
        speaker = dialogue_item.get("speaker")
        if speaker:
            characters = cut_spec.get("characters", [])
            for char in characters:
                char_id = char.get("character_id", "")
                if char_id == speaker:
                    emotion = char.get("emotion", "neutral")
                    if emotion:
                        mapped = EMOTION_TO_BUBBLE.get(emotion.lower())
                        if mapped:
                            return mapped
                    break

    # 5. 기본값
    return "round"
