"""연작 대본 프롬프트 조각 — P5: 시리즈 컨텍스트 주입.

추후 프롬프트 컴파일러의 부품으로 재사용할 수 있도록 상수 분리.
P1의 story/prompt_fragments.py 패턴과 동일.
"""


NARRATOR_PERSPECTIVE_KR = {
    "first_person": "1인칭",
    "third_person": "3인칭",
}


def build_narrator_block(narrator: dict) -> str:
    """화자 정보를 프롬프트 블록으로 조립한다."""
    name = narrator.get("name", "")
    ref_key = narrator.get("ref_key", "")
    perspective = narrator.get("perspective", "third_person")
    perspective_kr = NARRATOR_PERSPECTIVE_KR.get(perspective, "3인칭")

    lines = [f"\n[화자] 이 이야기는 {name}({ref_key})의 {perspective_kr} 시점."]
    if perspective == "first_person":
        lines.append(f"대본의 '나'는 {name}을 가리킨다. 나레이션은 {name}의 목소리로 서술할 것.")
    else:
        lines.append("전지적 시점으로 서술할 것.")
    return "\n".join(lines)


def build_series_context_block(series_context: dict) -> str:
    """시리즈 컨텍스트 dict를 프롬프트 블록으로 조립한다.

    series_context 구조:
        synopsis: str          — 시리즈 전체 시놉시스
        world: str | None      — 세계관 요약
        characters: list       — 주요 인물 배열
        episode_no: int        — 현재 회차 번호
        total_episodes: int    — 전체 회차 수
        current_summary: str   — 이번 회차 요약
        current_hook: str      — 이번 회차 엔딩 훅
        prev_summary: str|None — 직전 회차 요약 (1화면 None)
        prev_hook: str|None    — 직전 회차 훅 (1화면 None)
    """
    if not series_context:
        return ""

    parts = []

    parts.append("=== 연작 시리즈 컨텍스트 ===")
    parts.append(f"이 화는 전체 이야기의 {series_context['episode_no']}/{series_context['total_episodes']}화입니다.")

    parts.append(f"\n[시리즈 시놉시스]\n{series_context['synopsis']}")

    if series_context.get("world"):
        parts.append(f"\n[세계관]\n{series_context['world']}")

    # 화자 블록
    narrator = series_context.get("narrator")
    if narrator:
        parts.append(build_narrator_block(narrator))

    if series_context.get("characters"):
        char_lines = []
        for c in series_context["characters"]:
            ref_key = c.get("ref_key", "")
            name = c.get("name", "")
            role = c.get("role", "")
            desc = c.get("description", "")
            line = f"- {name}"
            if ref_key:
                line = f"- [{ref_key}] {name}"
            if role:
                line += f" ({role})"
            if desc:
                line += f": {desc}"
            char_lines.append(line)
        parts.append("\n[주요 인물]\n" + "\n".join(char_lines))

    # 직전 회차 컨텍스트
    prev_summary = series_context.get("prev_summary")
    prev_hook = series_context.get("prev_hook")
    if prev_summary:
        prev_text = f"직전 화({series_context['episode_no'] - 1}화) 요약: {prev_summary}"
        if prev_hook:
            prev_text += f"\n직전 화 엔딩: {prev_hook}"
        parts.append(f"\n[직전 회차]\n{prev_text}")

    # 이번 회차 지시
    parts.append(f"\n[이번 회차 ({series_context['episode_no']}화) 방향]")
    parts.append(f"요약: {series_context['current_summary']}")
    if series_context.get("current_hook"):
        parts.append(f"엔딩 훅: 마지막 컷은 \"{series_context['current_hook']}\" 방향으로 마무리할 것.")

    parts.append("=== 연작 컨텍스트 끝 ===")

    return "\n".join(parts)


SERIES_SCRIPT_INSTRUCTION_ADDON = """
추가 원칙 (연작):
- 이번 회차의 요약과 엔딩 훅 방향을 반드시 따를 것.
- 직전 회차가 있으면 그 엔딩과 자연스럽게 이어질 것.
- 이번 회차에서 이야기를 완결하지 말고, 엔딩 훅에서 끊을 것.
- character_id는 반드시 [주요 인물] 목록의 대괄호 안 ref_key를 그대로 사용할 것. 새 키를 만들지 말 것.
"""


STANDALONE_SCRIPT_INSTRUCTION_ADDON = """
추가 원칙 (단편 — 완결 필수):
- 이 에피소드는 단편이다. 하나의 완결된 이야기를 만들어야 한다.
- 마지막 씬은 반드시 갈등이 해소된 결말로 마무리하라. 여운·감동·교훈 등으로 끝낼 것.
- "과연 ~할 수 있을까?", "이야기는 계속된다", 다음 화 예고, 미해결 떡밥은 절대 금지.
- 시놉시스의 아크가 크면 시간 경과 연출('3개월 후', '그해 겨울' 등)을 써서 압축하라. 이야기를 잘라서 미완결로 남기지 마라.
- 구조: 도입(상황 설정) → 전개(갈등 심화) → 클라이맥스(전환점) → 결말(해소·마무리). 이 네 단계가 모두 포함되어야 한다.
"""


AD_SCRIPT_INSTRUCTION_ADDON = """
추가 원칙 (광고 웹툰 — 완결 필수 + 제품 자연 노출):
- 이 에피소드는 광고 웹툰이다. 하나의 완결된 이야기를 만들어야 한다.
- 마지막 씬은 반드시 갈등이 해소된 결말로 마무리하라. 여운·감동·교훈 등으로 끝낼 것.
- "과연 ~할 수 있을까?", "이야기는 계속된다", 다음 화 예고, 미해결 떡밥은 절대 금지.
- 구조: 도입(상황 설정) → 전개(갈등 심화) → 클라이맥스(전환점) → 결말(해소·마무리). 이 네 단계가 모두 포함되어야 한다.
- 제품/브랜드를 스토리에 자연스럽게 녹여라. 노골적 광고 문구("지금 구매하세요!", "최고의 제품!")는 절대 금지.
- 캐릭터가 제품을 실제로 사용하거나 경험하는 장면을 통해 제품의 가치를 보여줘라.
- 마지막 씬에서 제품이 자연스럽게 어필되도록 마무리하라 (강제 삽입 아닌 스토리 흐름 안에서).
- 시놉시스의 아크가 크면 시간 경과 연출('3개월 후' 등)을 써서 압축하라.
"""
