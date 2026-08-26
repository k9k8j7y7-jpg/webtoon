"""연작 대본 프롬프트 조각 — P5: 시리즈 컨텍스트 주입.

추후 프롬프트 컴파일러의 부품으로 재사용할 수 있도록 상수 분리.
P1의 story/prompt_fragments.py 패턴과 동일.
"""


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

    if series_context.get("characters"):
        char_lines = []
        for c in series_context["characters"]:
            name = c.get("name", "")
            role = c.get("role", "")
            desc = c.get("description", "")
            line = f"- {name}"
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
- 시리즈 인물의 ref_key를 기획안의 것과 일치시킬 것.
"""
