"""상세페이지 섹션 이미지 프롬프트 — scratch 3차 방식 그대로 (템플릿·장치·레이아웃 지시 없음).

입력: 섹션 원문(제목+본문) 통째 + 스타일 문구 + 짧은 상세페이지 요청문 (+ 캐릭터 등장/제품만 한 줄, 팔레트).
설명 컷 템플릿(prompts/explain.py)과 무관 — 장치·레이아웃·템플릿 문구를 여기에 넣지 말 것.
근거: scratch/detail3 — 제목·본문 4/4 정확, 글이 그림 안에 역할별 배치 (도도 "원하던 게 이거").
"""

# 3차 요청문 그대로 (+ 제품 라벨·다른 포장 금지 — 지시서 1단계)
DETAIL_REQUEST = (
    "다음 내용을 한국 웹툰 스타일의 상품 상세페이지 한 섹션(세로 2:3)으로 디자인해줘. "
    "제목·본문·포인트를 그림 안에 상세페이지답게 레이아웃하고, 한글은 정확히 그대로 쓰고, "
    "그 외 글자는 넣지 마. 제품은 첨부 사진과 똑같이(라벨 포함, 다른 포장 금지)."
)
# 2단계: GPT가 병 라벨·제품 주변에 설명 문단을 지어 넣는 문제 (ep171 실생성 원문 외 8줄)
LABEL_ONLY = "제품 라벨에는 첨부 사진에 있는 글자만 쓰고, 라벨이나 제품 주변에 설명 문단을 추가하지 마."
CHARACTER_ON = "주인공 캐릭터(첨부 시트)가 등장"
CHARACTER_OFF = "사람·손·얼굴 없이 제품과 인포그래픽만"
# 원문 외 효능 문구 검출 후 재시도 시 추가 (지시서: "원문 외 문장 절대 금지" 강조)
STRICT_NO_EXTRA = (
    "중요: 위 원문에 없는 문장·문구·효능·수치·인증 표기는 절대 넣지 마. "
    "그림 안의 한글은 위 원문 문장과 제품 라벨 글자만 허용."
)


def section_text(section: dict) -> str:
    """섹션 원문 통째 (제목 줄 + 본문)."""
    title = (section.get("title") or "").strip()
    body = (section.get("body") or "").strip()
    return "\n".join(x for x in (title, body) if x)


def build_detail_prompt(
    section: dict,
    style_prompt: str,
    character: bool,
    palette: list[str] | None = None,
    strict: bool = False,
    user_note: str | None = None,
) -> str:
    parts = [f"Style: {style_prompt}", DETAIL_REQUEST, LABEL_ONLY, CHARACTER_ON if character else CHARACTER_OFF]
    if palette:
        parts.append("강조색: " + ", ".join(str(c) for c in palette[:3]))
    if user_note:
        parts.append(f"추가 요청: {user_note.strip()[:200]}")
    if strict:
        parts.append(STRICT_NO_EXTRA)
    parts.append(section_text(section))
    return "\n\n".join(parts)
