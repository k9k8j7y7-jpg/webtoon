"""모션 웹툰 프롬프트 — 단일 소스.

Veo lite 모델에 전달하는 영상 생성 프롬프트.
카메라 고정 + 대상만 움직임 + 손 보존이 핵심.
"""

BASE_PROMPT = (
    "absolutely static camera: no zoom, no dolly, no pan, frame edges never move. "
    "Background pixels stay identical. Keep the illustration style exactly. Seamless loop. "
    "AVOID: extra hands, extra fingers, camera movement, zoom, new objects, morphing background."
)

_SUBTLE_MOTIONS = "blink, hair/ear/tail sway, slight breathing"
_NORMAL_MOTIONS = "blink, hair/ear/tail sway, slight breathing, small gentle hand motion"


def _describe_subject(appearance_en: str | None, is_animal: bool) -> str:
    """캐릭터 외형에서 시각 특징 문구를 추출.

    이름(한글·영문)은 Veo 안전 필터에 걸리므로 절대 넣지 않는다.
    appearance_en 예: "young woman, long black hair, school uniform"
    → "the young woman with long black hair and school uniform"
    """
    if appearance_en:
        # 첫 2~3개 핵심 특징만 사용 (너무 길면 프롬프트 효과 떨어짐)
        parts = [p.strip() for p in appearance_en.split(",") if p.strip()]
        if len(parts) >= 2:
            desc = parts[0]  # 예: "young woman"
            traits = " and ".join(parts[1:3])  # 예: "long black hair and school uniform"
            return f"the {desc} with {traits}"
        elif parts:
            return f"the {parts[0]}"
    # 폴백
    return "the animal character" if is_animal else "the human character"


def build_motion_prompt(
    subject_descs: list[str],
    intensity: str = "subtle",
) -> str:
    """영상 생성 프롬프트를 조립한다.

    Args:
        subject_descs: 움직일 캐릭터의 시각 특징 문구 리스트
            (_describe_subject로 생성된 것, 예: "the young woman with long black hair")
        intensity: "subtle" | "normal"

    Note: Veo 안전 필터가 이름을 실존 인물로 오인하므로 이름 절대 불포함.
    """
    if not subject_descs:
        names = "the character"
    elif len(subject_descs) == 1:
        names = subject_descs[0]
    else:
        names = " and ".join(subject_descs)
    motions = _SUBTLE_MOTIONS if intensity == "subtle" else _NORMAL_MOTIONS

    return (
        f"Only {names} move(s) subtly in place: {motions}. "
        f"Everyone and everything else stays completely still like a photograph. "
        f"Hands keep exactly the same shape, count and position as drawn. "
        + BASE_PROMPT
    )


# 비전 검사 프롬프트 — 격자 몬타주 (원본 + 5프레임을 한 장에)
VISION_CHECK_PROMPT = (
    "You are a strict QA inspector for animated webtoon clips.\n"
    "This single image is a 2x3 grid montage:\n"
    "  Top row: ORIGINAL (top-left), Frame F1 (top-center), Frame F2 (top-right)\n"
    "  Bottom row: Frame F3 (bottom-left), Frame F4 (bottom-center), Frame F5 (bottom-right)\n\n"
    "The ORIGINAL is a still webtoon illustration. F1-F5 are frames extracted at "
    "0.3s, 1.0s, 1.8s, 2.5s, 2.9s from a short animation of that original.\n\n"
    "For EACH frame F1-F5, check:\n"
    "1. HANDS: Count visible human hands in ORIGINAL. Count in each frame. "
    "If any frame has MORE hands than the original, or a hand has clearly "
    "different finger count, that frame fails hands check.\n"
    "2. ANIMAL IDENTITY: If there is a dog/cat/animal in the original, check "
    "each frame: did the breed, fur color/pattern, body shape, or size change? "
    "If so, that frame fails identity check.\n"
    "3. HUMAN IDENTITY: Ignore expression changes (blink, mouth, breathing). "
    "Flag only if face SHAPE, hair color/style, clothing, or body proportions changed.\n\n"
    "Blinking, slight breathing, hair sway = NORMAL. Do NOT flag these.\n\n"
    "Reply with ONLY this JSON (no markdown, no code fences):\n"
    '{"hands_original": <int>, '
    '"frames": ['
    '  {"id":"F1","hands":<int>,"hands_ok":<bool>,"identity_ok":<bool>,"note":"..."},'
    '  {"id":"F2","hands":<int>,"hands_ok":<bool>,"identity_ok":<bool>,"note":"..."},'
    '  {"id":"F3","hands":<int>,"hands_ok":<bool>,"identity_ok":<bool>,"note":"..."},'
    '  {"id":"F4","hands":<int>,"hands_ok":<bool>,"identity_ok":<bool>,"note":"..."},'
    '  {"id":"F5","hands":<int>,"hands_ok":<bool>,"identity_ok":<bool>,"note":"..."}'
    "]}"
)
