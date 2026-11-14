"""상세페이지 기획안 생성 — 제품 정보 → 섹션 대본 JSON (0패킷).

입력: 제품명·특징·활용법·웹 보완·타깃·톤
출력: {"sections": [{key, title, body, character, visual_hint}, ...]} 기본 8개
규칙: 본문은 입력 사실만. 수치·인증·효능은 입력에 있는 것만. 본문 60~180자. 이모지 금지.
few-shot: 도도 기획안(docs/기획안-자연바람허브팩.md) — 서버에 docs가 없어 아래 상수로 내장.
"""

import json
import logging
import re

logger = logging.getLogger(__name__)

# 기본 8섹션 (순서 고정 제안 — 사용자가 순서·추가·삭제 가능)
DEFAULT_SECTION_KEYS = [
    "intro", "hero", "point1", "point2", "point3", "how_to_use", "check_list", "outro",
]
SECTION_LABELS_KR = {
    "intro": "Intro · 공감", "hero": "Hero · 메인", "point1": "Point 1", "point2": "Point 2",
    "point3": "Point 3", "how_to_use": "How to Use", "check_list": "Check List", "outro": "Outro · 구매 유도",
    "review": "리뷰", "point": "Point",
}
# AI 기본값: 캐릭터 등장 섹션
CHARACTER_DEFAULT_KEYS = {"intro", "how_to_use", "outro"}

TONES = {
    "hook": "후킹 — 공감·문제 제기로 시작, 짧고 리듬감 있는 문장, 구어체",
    "info": "정보 — 차분하고 명확하게, 성분·사용법 중심, 신뢰감",
    "premium": "프리미엄 — 절제된 고급스러운 문장, 감각적 단어, 과장 없이",
}

BODY_MIN, BODY_MAX = 60, 180

# few-shot — 도도 기획안 원문(2026-11-13) 그대로 섹션 JSON화 (시각 자료 메모 → visual_hint)
_FEWSHOT_INPUT = (
    "제품명: 자연바람 아로마 그린티 스파 스캘프 허브팩 1000g\n"
    "특징: 아로마 그린티 천연 쿨링 성분, 녹차 베이스 각질·피지 케어, 아로마 허브 진정, "
    "두피+모발 올인원(린스 없이), 1000g 대용량\n"
    "활용법: 뾰족 공병에 덜어 가르마 따라 도포, 3분 마사지, 헤어캡 쓰고 5~10분 방치, 미온수 헹굼\n"
    "타깃: 두피 열감·냄새·떡짐 고민 30~40대, 온 가족\n"
    "톤: 후킹"
)
_FEWSHOT_OUTPUT = {
    "sections": [
        {"key": "intro", "title": "오후만 되면 올라오는 정수리 냄새",
         "body": "조금만 더워도 훅 달아오르는 두피 열감, 매일 감아도 금방 떡지는 지루성 두피까지. "
                 "비싼 미용실 두피 케어, 매번 받기 부담스러우셨죠? 이제 집에서 매일, 두피에 에어컨을 틀어주세요!",
         "character": True, "visual_hint": "오후 3시, 떡진 앞머리와 붉어진 정수리를 만지는 모습"},
        {"key": "hero", "title": "두피는 시원하게, 모발은 찰랑이게",
         "body": "미용실 VIP 스파 코스를 우리 집 욕실로! 압도적인 1000g 대용량, "
                 "자연바람 아로마 그린티 스파 스캘프 허브팩",
         "character": False, "visual_hint": "1000g 대용량 본품과 옆에 놓인 얼음+녹차잎 연출"},
        {"key": "point1", "title": "두피에 닿자마자 체감 온도 -5도!",
         "body": "열받은 두피는 탈모와 피지 과다 분비의 주범입니다. 아로마 그린티의 천연 쿨링 성분이 닿는 순간, "
                 "두피 속까지 뻥 뚫리는 극강의 시원함을 선사합니다.\n"
                 "그린티(녹차) 베이스: 묵은 각질과 산화된 피지를 자극 없이 부드럽게 녹여냅니다.\n"
                 "아로마 허브 진정: 잦은 펌과 염색으로 붉어지고 예민해진 두피를 편안하게 진정시킵니다.",
         "character": False, "visual_hint": "두피 단면 확대 — 쿨링 입자, 녹차 성분이 각질·피지를 들어올림"},
        {"key": "point2", "title": "두피 팩은 머릿결이 뻣뻣해진다? NO!",
         "body": "두피 따로, 모발 따로 관리하기 귀찮으셨죠? 두피 모공을 깨끗하게 비워주는 동시에, "
                 "건조한 모발 끝에는 수분 코팅막을 형성합니다. 팩 하나만으로 린스 없이 '물미역'처럼 부드러운 머릿결을 완성하세요.",
         "character": False, "visual_hint": "사용 전 푸석한 모발 / 사용 후 코팅막 감싼 매끈한 모발"},
        {"key": "point3", "title": "무려 1000g! 팍팍 써도 부담 없는 가성비",
         "body": "두피 케어 제품, 아껴 쓰느라 효과 못 보셨나요? 1000g 대용량으로 남편의 정수리 냄새, "
                 "사춘기 자녀의 떡진 머리, 나의 붉은 두피까지 온 가족이 매일 아낌없이 듬뿍 펌핑해서 사용하세요.",
         "character": False, "visual_hint": "펌프 병과 가족 3인 아이콘"},
        {"key": "how_to_use", "title": "100% 효과 보는 홈 스파 루틴",
         "body": "STEP 1. 뾰족 공병에 팩을 덜어주세요.\nSTEP 2. 샴푸 후 가르마를 타며 골고루 짜줍니다.\n"
                 "STEP 3. 손가락 지문으로 3분간 꾹꾹 마사지.\nSTEP 4. 헤어캡을 쓰고 5~10분 방치.\n"
                 "STEP 5. 미온수로 깨끗하게 헹궈내면 끝!",
         "character": True, "visual_hint": "뾰족 공병으로 두피 결을 따라 바르는 5단계"},
        {"key": "check_list", "title": "이런 분들께 무조건 추천합니다!",
         "body": "오후 3시만 되면 앞머리가 떡지는 분\n정수리에서 꿉꿉한 냄새가 나서 신경 쓰이는 분\n"
                 "운동 후 두피에 땀과 열이 확 올라오는 분\n잦은 펌/염색으로 두피가 붉고 예민해진 분\n"
                 "온 가족이 함께 쓸 대용량 헤어팩을 찾는 분",
         "character": False, "visual_hint": "체크 아이콘 리스트"},
        {"key": "outro", "title": "상쾌한 자연바람만 남기세요",
         "body": "오늘부터 두피 스트레스는 씻어내고, 상쾌한 자연바람만 남기세요. "
                 "매일 1분, 우리 집 욕실이 두피 스파가 됩니다.",
         "character": True, "visual_hint": "상쾌한 표정으로 제품을 든 모습, 녹차잎 바람"},
    ]
}

_EMOJI_RE = re.compile("[\U0001F000-\U0001FAFF☀-➿️‍]+")
# 입력에 없으면 의심할 표현 (효능·인증·수치)
_CLAIM_WORD_RE = re.compile(r"(인증|특허|1위|테스트\s*완료|임상|무첨가|피부과|FDA|KFDA|식약처|pH\s*\d)", re.I)
_NUM_RE = re.compile(r"\d+(?:[.,]\d+)?")


def _build_prompt(product_name, features, usage, web_info, target, tone, extra) -> str:
    tone_desc = TONES.get(tone, TONES["hook"])
    user_input = "\n".join(filter(None, [
        f"제품명: {product_name}",
        f"특징: {features}" if features else "",
        f"활용법: {usage}" if usage else "",
        f"웹 보완 정보: {web_info}" if web_info else "",
        f"타깃: {target}" if target else "",
        f"톤: {tone_desc}",
        f"추가 요청: {extra}" if extra else "",
    ]))
    return (
        "너는 한국 쇼핑몰 상품 상세페이지 기획자야. 아래 제품 정보로 상세페이지 섹션 대본을 써줘.\n\n"
        "## 규칙\n"
        "1. 섹션 8개, 순서: intro(공감·페인포인트) → hero(메인 카피+제품) → point1·point2·point3(장점 3개) "
        "→ how_to_use(사용 단계) → check_list(이런 분께 추천) → outro(구매 유도).\n"
        "2. 본문은 **입력에 있는 사실만** 쓴다. 수치·용량·성분·인증·특허·테스트·순위·효능 수치는 입력에 있는 것만. "
        "입력에 없으면 절대 만들지 마 (예: 'pH 5.5', '피부 자극 테스트 완료', '판매 1위' 금지).\n"
        f"3. 섹션 본문은 {BODY_MIN}~{BODY_MAX}자. 줄바꿈(\\n)으로 포인트·단계·체크 항목을 나눠도 된다.\n"
        "4. 제목(title)은 그 섹션의 후킹 한 줄, 25자 이내. 이모지·특수 장식 기호 금지.\n"
        "5. character: 사람이 등장해야 설명되는 섹션은 true(공감·사용법·구매 유도), "
        "제품과 원리·아이콘으로 설명되는 섹션은 false.\n"
        "6. visual_hint: 그림에 들어갈 장면·요소 한 줄 (한국어, 30자 이내). 글자 내용 아님.\n"
        "7. 출력은 JSON만: {\"sections\": [{\"key\", \"title\", \"body\", \"character\", \"visual_hint\"}]}\n\n"
        "## 예시 입력\n" + _FEWSHOT_INPUT + "\n\n"
        "## 예시 출력\n" + json.dumps(_FEWSHOT_OUTPUT, ensure_ascii=False) + "\n\n"
        "## 실제 입력\n" + user_input + "\n\n"
        "## 실제 출력 (JSON만)"
    )


def _clean(text: str) -> str:
    return _EMOJI_RE.sub("", str(text or "")).strip()


def find_unverified(text: str, source: str) -> list[str]:
    """본문 중 입력(source)에 없는 수치·인증 표현 목록 (경고용)."""
    src = re.sub(r"\s", "", source or "")
    out = []
    # 단계·목록 번호(STEP 2, 2단계, 줄머리 "2.")는 수치 아님
    scan = re.sub(r"(?im)step\s*\d+|\d+\s*단계|^\s*\d+[.)]", "", text or "")
    for m in _NUM_RE.finditer(scan):
        if m.group() not in src and m.group() not in out:
            out.append(m.group())
    for m in _CLAIM_WORD_RE.finditer(text or ""):
        w = m.group()
        if re.sub(r"\s", "", w) not in src and w not in out:
            out.append(w)
    return out


def normalize_sections(raw_sections: list, source_text: str = "") -> list[dict]:
    """AI 응답 → 검증된 섹션 목록. key 중복 정리·character 기본값·이모지 제거·의심 표현 기록."""
    out, seen = [], set()
    for i, s in enumerate(raw_sections or []):
        if not isinstance(s, dict):
            continue
        key = re.sub(r"[^a-z0-9_]", "", str(s.get("key") or "").lower()) or f"section{i + 1}"
        base = key
        n = 2
        while key in seen:
            key = f"{base}_{n}"; n += 1
        seen.add(key)
        title = _clean(s.get("title"))[:40]
        body = _clean(s.get("body"))
        if not title and not body:
            continue
        char = s.get("character")
        if not isinstance(char, bool):
            char = base in CHARACTER_DEFAULT_KEYS
        sec = {
            "key": key,
            "title": title,
            "body": body,
            "character": char,
            "visual_hint": _clean(s.get("visual_hint"))[:60],
        }
        unv = find_unverified(f"{title}\n{body}", source_text)
        if unv:
            sec["unverified"] = unv
        out.append(sec)
    return out


async def generate_detail_plan(
    product_name: str,
    features: str = "",
    usage: str = "",
    web_info: str = "",
    target: str = "",
    tone: str = "hook",
    extra: str = "",
) -> dict:
    """섹션 대본 생성. 반환 {"sections": [...], "tone": tone}."""
    from google.genai import types
    from app.adapters.gemini import get_client, AI_TOKENS_LONG, parse_ai_json

    prompt = _build_prompt(product_name, features, usage, web_info, target, tone, extra)
    client = get_client()
    resp = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[prompt],
        config=types.GenerateContentConfig(temperature=0.6, max_output_tokens=AI_TOKENS_LONG),
    )
    data = parse_ai_json(resp.text, context="detail_plan")
    raw = data.get("sections") if isinstance(data, dict) else data
    source = "\n".join([product_name, features, usage, web_info, target])
    sections = normalize_sections(raw or [], source_text=source)
    logger.info("detail_plan: product=%s tone=%s sections=%d unverified=%s",
                product_name, tone, len(sections),
                {s["key"]: s["unverified"] for s in sections if s.get("unverified")})
    return {"sections": sections, "tone": tone if tone in TONES else "hook"}
