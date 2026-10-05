"""Story Engine — 게이트 1: 아이디어 → 기획(제목·로그라인·시놉시스·세계관·인물목록)

API-Spec 3장, PRD 3.1 참조.
"""

import json
import re
from datetime import datetime, timezone

from app.adapters.gemini import generate_text, AI_TOKENS_SHORT
from app.story.prompt_fragments import (
    GENRE_FRAGMENTS, MOOD_FRAGMENTS, DEVELOPMENT_FRAGMENTS,
)

SYSTEM_INSTRUCTION = """너는 웹툰 스토리 기획 전문가야.
사용자의 아이디어를 받아서 웹툰 기획안을 만들어줘.
반드시 아래 JSON 형식으로만 응답해. 다른 텍스트는 절대 넣지 마.

{
  "title": "웹툰 제목 (AI 추천 — 사용자 제목과 다를 수 있음)",
  "logline": "한 줄 요약 (1~2문장)",
  "synopsis": {
    "ki": "도입 (1~3문장)",
    "seung": "전개 (1~3문장)",
    "jeon": "전환/클라이맥스 (1~3문장)",
    "gyeol": "결말 (1~3문장)"
  },
  "world": "세계관 설명 (배경, 시대, 특수 규칙 등)",
  "characters": [
    {
      "ref_key": "영문 식별자 (예: hero, sidekick)",
      "name": "캐릭터 이름",
      "gender": "성별 (남/여/기타)",
      "age": "나이 (숫자)",
      "description": "짧은 특징 — 동물이면 품종/종, 사람이면 외형·성격·역할"
    }
  ]
}

규칙:
- 아이디어에 동물이 등장하면 반드시 등장인물(characters)에 포함할 것
- 동물의 description에는 품종/종을 적을 것 (아이디어에 명시되어 있으면 그대로)
- 동물의 나이는 해당 동물 기준의 자연스러운 나이로
- 사람의 description에는 외형·역할을 한 줄로
- gender "기타"는 캐릭터 본인이 동물인 경우에만(강아지·고양이·토끼 등). 동물을 키우거나 함께 다니는 사람은 남/여
- 사용자가 입력한 인물 description 원문은 앞부분에 그대로 유지하고, 보충 내용만 뒤에 이어 붙일 것 (원문 덮어쓰기 금지)
- synopsis는 반드시 4단 dict 형식(ki/seung/jeon/gyeol)으로 출력"""

SUGGEST_CHARACTERS_INSTRUCTION = """너는 웹툰 캐릭터 기획 전문가야.
사용자의 아이디어를 바탕으로 어울리는 등장인물을 제안해줘.
반드시 아래 JSON 형식으로만 응답해. 다른 텍스트는 절대 넣지 마.

{
  "characters": [
    {
      "name": "캐릭터 이름",
      "description": "짧은 특징 한 줄 (동물이면 품종/종, 사람이면 외형·역할)",
      "gender": "남 또는 여 또는 기타",
      "age": 나이(숫자)
    }
  ]
}

규칙:
- 아이디어에 동물이 등장하면 반드시 등장인물에 포함할 것
- 동물의 description에는 품종/종을 적을 것 (아이디어에 명시되어 있으면 그대로, 예: "포메라니안")
- 동물의 나이는 해당 동물 기준의 자연스러운 나이로
- 사람의 description에는 외형·역할을 한 줄로 (예: "도도의 보호자, 40대 아빠")
- gender "기타"는 캐릭터 본인이 동물인 경우에만(강아지·고양이·토끼 등). 동물을 키우거나 함께 다니는 사람은 남/여
- 3~5명의 캐릭터를 제안해줘. 사람 이름은 한국 이름으로 해줘."""


def _parse_json(raw: str) -> dict:
    """Gemini 응답에서 JSON을 파싱한다 (마크다운 코드블록 제거)."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    if text.startswith("json"):
        text = text[4:].strip()
    return json.loads(text)


async def suggest_characters(idea: str) -> list[dict]:
    """아이디어를 바탕으로 등장인물을 자동 제안한다."""
    prompt = f"아이디어: {idea}\n\n위 아이디어에 어울리는 등장인물을 제안해줘."

    raw = await generate_text(
        prompt=prompt,
        system_instruction=SUGGEST_CHARACTERS_INSTRUCTION,
        temperature=0.9,
        max_output_tokens=AI_TOKENS_SHORT,
    )

    result = _parse_json(raw)
    chars = result.get("characters", [])
    # 동물 캐릭터 gender 후처리
    for c in chars:
        if _is_animal_character(c):
            c["gender"] = "기타"
    return chars


_ANIMAL_KEYWORDS = (
    "강아지", "개", "고양이", "포메", "반려견", "반려묘", "새", "햄스터",
    "토끼", "거북이", "앵무새", "잉꼬", "치와와", "푸들", "말티즈",
    "시바", "웰시코기", "코기", "래브라도", "골든리트리버", "비숑",
    "시츄", "페르시안", "러시안블루", "스코티시폴드", "진돗개",
    "dog", "cat", "puppy", "kitten", "pet", "animal",
)
# 동물 키워드 뒤에 붙으면 "다른 대상으로서의 동물"(목적격·동반격·소유격) → 본인 아님
_ANIMAL_OTHER_PARTICLES = ("를", "을", "와", "과", "랑", "의", "에게", "한테")
# 키워드 뒤 서술형 어미 → 본인이 동물 ("포메라니안이다", "푸들인")
_ANIMAL_SELF_ENDINGS = ("다", "인")
# 비유 표현은 본인 아님 ("강아지같다", "고양이처럼")
_ANIMAL_SIMILE = ("같", "처럼", "스럽", "답")
_QUOTE_CHARS = "'\"‘’“”()[]「」『』"


def _animal_keyword_in_word(core: str) -> tuple[str, str] | None:
    """단어 안의 동물 키워드와 그 뒤 나머지 문자열. 없으면 None.

    한 글자 키워드(개·새)는 단어 맨 앞에서만 인정(소개·새로운 오탐 방지).
    영문 키워드는 단어 전체 일치(복수형 s 허용).
    """
    for kw in _ANIMAL_KEYWORDS:
        if kw.isascii():
            if core in (kw, kw + "s"):
                return kw, ""
            continue
        idx = core.find(kw)
        if idx < 0 or (len(kw) == 1 and idx != 0):
            continue
        return kw, core[idx + len(kw):]
    return None


def _is_animal_character(char: dict) -> bool:
    """캐릭터 본인이 동물이면 True. 동물을 언급만 하는 사람은 False.

    - 이름란에 동물 키워드가 있으면 동물.
    - 설명: 키워드 뒤에 목적격·동반격·소유격 조사(를/을/와/과/랑/의/에게/한테)가
      붙으면 제외. 키워드가 문장 끝·"이다/다/인/." 앞에 있을 때만 동물.
      예) "갈색 포메라니안 도도를 아끼는 엄마" → False, "갈색 포메라니안." → True
    """
    name = str(char.get("name", "") or "").lower()
    for w in name.split():
        if _animal_keyword_in_word(w.strip(_QUOTE_CHARS)):
            return True

    words = str(char.get("description", "") or "").lower().split()
    for i, word in enumerate(words):
        clean = word.strip(_QUOTE_CHARS)
        sentence_end = clean.endswith(".") or i == len(words) - 1
        core = clean.rstrip(".,!?").strip(_QUOTE_CHARS)
        hit = _animal_keyword_in_word(core)
        if not hit:
            continue
        kw, rem = hit
        if rem.endswith(_ANIMAL_OTHER_PARTICLES) or any(s in rem for s in _ANIMAL_SIMILE):
            continue
        if len(kw) == 1 and rem not in ("", "다", "이다", "인"):
            continue
        if rem.endswith(_ANIMAL_SELF_ENDINGS):
            return True
        # 문장 끝: 키워드(+품종명 꼬리 "라니안"·"견")로 끝나고 다른 조사가 없을 때만
        if sentence_end and not rem.endswith(("이", "가", "은", "는", "도", "로", "에", "만")):
            return True
    return False


def _name_to_ref_key(name: str) -> str:
    """한글 이름 → 영문 snake_case ref_key (간이 변환)."""
    # 간단한 로마자 변환: 한글이면 그대로 영문화할 수 없으므로
    # 비 ASCII 문자는 유니코드 코드 포인트 기반 해시
    ascii_name = ""
    for ch in name:
        if ch.isascii() and ch.isalnum():
            ascii_name += ch.lower()
        elif ch == " " or ch == "_":
            ascii_name += "_"
        else:
            # 한글 → 간이 코드
            ascii_name += f"c{ord(ch) % 1000}"
    return re.sub(r"_+", "_", ascii_name).strip("_") or f"char_{abs(hash(name)) % 10000}"


def _dedupe_description(user_desc: str, ai_desc: str) -> str:
    """사용자 원문 + AI 보충을 합치되, 중복 문장 제거·마침표 정리."""
    if not ai_desc or ai_desc == user_desc:
        return user_desc
    if ai_desc.startswith(user_desc):
        return ai_desc  # AI가 이미 원문으로 시작
    # AI 보충에서 원문과 겹치는 문장 제거
    user_sentences = {s.strip().rstrip(".") for s in user_desc.split(".") if s.strip()}
    ai_parts = []
    for s in ai_desc.split("."):
        s = s.strip()
        if not s:
            continue
        if s.rstrip(".") in user_sentences:
            continue  # 원문에 이미 있는 문장 제외
        ai_parts.append(s)
    if not ai_parts:
        return user_desc
    combined = user_desc.rstrip(". ") + ". " + ". ".join(ai_parts)
    # 마침표 중복 정리
    combined = re.sub(r"\.{2,}", ".", combined)
    combined = re.sub(r"\.\s*\.", ".", combined)
    return combined.strip()


def _merge_brief_characters(
    result: dict,
    brief_chars: list[dict],
    card_chars: list[dict] | None = None,
) -> None:
    """AI 결과에 사용자 값(카드·기획서)을 강제 적용한다.

    card_chars(게이트1 카드)가 있으면 최우선 원본. 없으면 brief_chars가 원본.
    규칙:
    - gender/name/age: 카드 값이 있으면 무조건 그대로(동물 자동 "기타"는 카드 값이 비었을 때만)
    - description: 카드 원문을 맨 앞에 유지, AI 보충은 뒤에 (중복 문장 제외)
    - AI가 누락한 인물: 강제 추가 (ref_key 자동 생성)
    """
    ai_chars = result.get("characters", [])

    def norm(n):
        return (n or "").strip().lower().replace(" ", "")

    ai_name_map = {norm(c.get("name", "")): c for c in ai_chars}

    # 카드 값이 있으면 카드 기준, 없으면 brief 기준
    # 카드와 brief 둘 다 있으면 카드가 우선 (카드 이름으로 매칭)
    primary_chars = card_chars if card_chars else brief_chars

    for pc in primary_chars:
        pname = norm(pc.get("name", ""))
        if not pname:
            continue

        user_desc = (pc.get("description") or "").strip()
        user_gender = (pc.get("gender") or "").strip()
        user_age = str(pc.get("age") or "").strip()

        if pname in ai_name_map:
            # ── AI가 포함한 인물 → 카드 값 강제 적용 ──
            ac = ai_name_map[pname]
            ai_desc = (ac.get("description") or "").strip()

            # description: 카드 원문 맨 앞 + AI 보충(중복 제거)
            if user_desc:
                ac["description"] = _dedupe_description(user_desc, ai_desc)

            # gender: 카드 값 무조건 우선. 비었을 때만 AI 값 유지 + 동물 자동 "기타"
            if user_gender:
                ac["gender"] = user_gender
            else:
                # 카드에서 gender 미설정 → AI 값 유지하되 동물이면 "기타"
                if _is_animal_character(pc) or _is_animal_character(ac):
                    ac["gender"] = "기타"

            # age: 카드 값 우선
            if user_age:
                ac["age"] = user_age

            # name: 카드 값 우선
            if pc.get("name"):
                ac["name"] = pc["name"]
        else:
            # ── AI가 누락한 인물 → 추가 ──
            gender = user_gender or "기타"
            # 동물인데 gender 미설정이면 "기타"
            if not user_gender and _is_animal_character(pc):
                gender = "기타"
            new_char = {
                "ref_key": _name_to_ref_key(pc.get("name", "")),
                "name": pc.get("name", ""),
                "gender": gender,
                "age": pc.get("age", ""),
                "description": user_desc,
            }
            ai_chars.append(new_char)
            ai_name_map[pname] = new_char

    result["characters"] = ai_chars


async def generate_planning(
    idea: str,
    options_prompt: str | None = None,
    characters: list[dict] | None = None,
    idea_brief: dict | None = None,
) -> dict:
    """아이디어로부터 기획안을 생성한다.

    idea_brief가 있으면 기획서(아이디어 정리)의 인물·사건·결말을
    프롬프트에 주입하여 AI가 이를 충실히 따르도록 한다.
    """
    prompt = f"아이디어: {idea}"

    # idea_brief 전체 주입
    if idea_brief:
        prompt += "\n\n## 기획서 (아이디어 정리) — 아래 내용을 충실히 따를 것"
        if idea_brief.get("summary"):
            prompt += f"\n한 줄 소개: {idea_brief['summary']}"
        if idea_brief.get("characters"):
            prompt += "\n기획서 등장인물:"
            for bc in idea_brief["characters"]:
                parts = [bc.get("name", "")]
                if bc.get("description"):
                    parts.append(bc["description"])
                if bc.get("gender"):
                    parts.append(f"성별: {bc['gender']}")
                if bc.get("age"):
                    parts.append(f"나이: {bc['age']}")
                prompt += f"\n- {', '.join(p for p in parts if p)}"
        if idea_brief.get("story"):
            s = idea_brief["story"]
            prompt += "\n기획서 줄거리:"
            if s.get("ki"):
                prompt += f"\n  [도입] {s['ki']}"
            if s.get("seung"):
                prompt += f"\n  [전개] {s['seung']}"
            if s.get("jeon"):
                prompt += f"\n  [전환] {s['jeon']}"
            if s.get("gyeol"):
                prompt += f"\n  [결말] {s['gyeol']}"
        if idea_brief.get("tone"):
            prompt += f"\n톤: {idea_brief['tone']}"
        if idea_brief.get("product"):
            p = idea_brief["product"]
            if p.get("name"):
                prompt += f"\n제품: {p['name']}"
            if p.get("features"):
                prompt += f" — {p['features']}"
        prompt += "\n\n중요: 위 기획서의 인물·사건·결말을 그대로 따를 것. 기획서에 없는 새 인물을 추가하지 말 것(단역 제외). 기획서 등장인물 전원을 characters에 반드시 포함하라(동물 포함). 인물을 빼지 마라."

    if options_prompt:
        prompt += options_prompt
    if characters:
        prompt += "\n\n등장인물 정보:"
        for c in characters:
            parts = [c.get("name", "이름 미정")]
            if c.get("description"):
                parts.append(f"추가설명: {c['description']}")
            if c.get("gender"):
                parts.append(f"성별: {c['gender']}")
            if c.get("age"):
                parts.append(f"나이: {c['age']}세")
            prompt += f"\n- {', '.join(parts)}"
        prompt += "\n\n위 등장인물을 반드시 포함해서 기획안을 만들어줘. 등장인물의 ref_key는 네가 생성하고, description은 사용자가 입력한 추가설명 원문을 앞부분에 그대로 유지한 채 보충 내용만 뒤에 이어 붙여줘(원문 덮어쓰기 금지). gender '기타'는 캐릭터 본인이 동물인 경우에만(동물을 키우거나 함께 다니는 사람은 남/여)."
    else:
        prompt += "\n\n위 아이디어로 웹툰 기획안을 만들어줘."

    raw = await generate_text(
        prompt=prompt,
        system_instruction=SYSTEM_INSTRUCTION,
        temperature=0.9,
        max_output_tokens=4096,
    )

    result = _parse_json(raw)

    # 후처리 머지: 카드 값(characters) 우선, 기획서(idea_brief) 보조
    brief_chars = (idea_brief or {}).get("characters", [])
    if characters or brief_chars:
        _merge_brief_characters(result, brief_chars, card_chars=characters)

    # 동물 캐릭터 gender 후처리 — 카드/기획서에 없는 AI 전용 인물만 대상
    merged_names = set()
    if characters:
        merged_names |= {(c.get("name") or "").strip().lower() for c in characters}
    if brief_chars:
        merged_names |= {(c.get("name") or "").strip().lower() for c in brief_chars}
    for c in result.get("characters", []):
        cname = (c.get("name") or "").strip().lower()
        if cname not in merged_names and _is_animal_character(c):
            c["gender"] = "기타"

    # synopsis가 dict(4단)이면 그대로, 문자열이면 기존 호환
    syn = result.get("synopsis")
    if isinstance(syn, str):
        # 기존 호환: 문자열을 그대로 두되, synopsis_parts는 없음
        pass
    elif isinstance(syn, dict):
        # 4단 dict → synopsis_parts로 보관, synopsis는 합친 문자열
        result["synopsis_parts"] = syn
        parts = []
        for k, label in [("ki", "기"), ("seung", "승"), ("jeon", "전"), ("gyeol", "결")]:
            v = syn.get(k, "")
            if v:
                parts.append(f"{label}: {v}")
        result["synopsis"] = "\n".join(parts)

    return result


# ── idea-brief (아이디어 정리) ──────────────────────────

# 장르·분위기·전개 선택지 키 목록 (suggested 값은 이 중에서만)
_GENRE_KEYS = list(GENRE_FRAGMENTS.keys())
_MOOD_KEYS = list(MOOD_FRAGMENTS.keys())
_DEV_KEYS = list(DEVELOPMENT_FRAGMENTS.keys())

IDEA_BRIEF_INSTRUCTION = f"""너는 웹툰 기획 어시스턴트야.
사용자가 쓴 아이디어(raw)를 읽고, 구조화된 기획 메모를 만들어줘.
반드시 아래 JSON 형식으로만 응답해. 다른 텍스트는 절대 넣지 마.

{{
  "summary": "한 줄 소개 (1문장)",
  "characters": [
    {{"name": "이름", "description": "짧은 특징 한 줄", "gender": "남 또는 여 또는 기타", "age": "나이(숫자 또는 빈 문자열)"}}
  ],
  "story": {{
    "ki": "도입: 1~3문장",
    "seung": "전개: 1~3문장",
    "jeon": "전환/클라이맥스: 1~3문장",
    "gyeol": "결말: 1~3문장"
  }},
  "tone": "톤 한 줄",
  "suggested": {{
    "genre": "장르 키 하나",
    "mood": "분위기 키 하나",
    "development": "전개 키 하나"
  }}
}}

규칙:
- characters는 2~5명. 동물이면 종·색·특징을 description에 포함
- characters의 gender는 "남", "여", "기타" 중 하나. "기타"는 캐릭터 본인이 동물인 경우에만(강아지·고양이·토끼 등). 동물을 키우거나 함께 다니는 사람은 남/여
- characters의 age는 숫자 문자열. 동물이면 해당 동물 기준 나이 추정, 불명이면 빈 문자열
- story는 단편 완결 구조 — 예고식 결말 금지, 기승전결 각 1~3문장
- suggested의 genre는 반드시 {_GENRE_KEYS} 중 하나
- suggested의 mood는 반드시 {_MOOD_KEYS} 중 하나
- suggested의 development는 반드시 {_DEV_KEYS} 중 하나
- 사용자가 이미 구조화해서 썼으면(제목/기승전결 등) 그 구조를 존중해서 정리만
- 한국어로 출력"""

IDEA_BRIEF_AD_ADDON = """
추가 규칙 (광고 에피소드):
- 이 에피소드는 광고 웹툰이다.
- 아래 제품 정보를 참고해서, story 안에 제품이 자연스럽게 쓰이는 장면을 반드시 포함해.
- 노골적 광고 문구 금지. 등장인물이 제품을 자연스럽게 사용하는 장면으로.
"""

IDEA_BRIEF_REVISE_INSTRUCTION = f"""너는 웹툰 기획 어시스턴트야.
사용자가 기존 기획 메모를 보고 수정 요청(hint)을 했다. 기존 메모를 기반으로 수정해줘.
반드시 아래 JSON 형식으로만 응답해. 다른 텍스트는 절대 넣지 마.

{{
  "summary": "한 줄 소개 (1문장)",
  "characters": [
    {{"name": "이름", "description": "짧은 특징 한 줄", "gender": "남/여/기타", "age": "나이 또는 빈 문자열"}}
  ],
  "story": {{
    "ki": "도입: 1~3문장",
    "seung": "전개: 1~3문장",
    "jeon": "전환/클라이맥스: 1~3문장",
    "gyeol": "결말: 1~3문장"
  }},
  "tone": "톤 한 줄",
  "suggested": {{
    "genre": "장르 키 하나",
    "mood": "분위기 키 하나",
    "development": "전개 키 하나"
  }}
}}

규칙:
- 사용자의 수정 요청을 정확히 반영
- 수정 요청에 언급되지 않은 부분은 기존 값 유지
- suggested의 genre는 반드시 {_GENRE_KEYS} 중 하나
- suggested의 mood는 반드시 {_MOOD_KEYS} 중 하나
- suggested의 development는 반드시 {_DEV_KEYS} 중 하나
- 한국어로 출력"""


async def generate_idea_brief(
    raw: str,
    is_ad: bool = False,
    product_name: str = "",
    product_features: str = "",
) -> dict:
    """아이디어 원문(raw)으로부터 구조화된 idea_brief를 생성한다."""
    prompt = f"아이디어:\n{raw}"

    system = IDEA_BRIEF_INSTRUCTION
    if is_ad:
        system += IDEA_BRIEF_AD_ADDON
        if product_name:
            prompt += f"\n\n제품 정보:\n- 제품명: {product_name}"
            if product_features:
                prompt += f"\n- 특징: {product_features}"

    text = await generate_text(
        prompt=prompt,
        system_instruction=system,
        temperature=0.8,
        max_output_tokens=AI_TOKENS_SHORT,
    )
    result = _parse_json(text)

    # 필수 키 보정
    result.setdefault("summary", "")
    result.setdefault("characters", [])
    result.setdefault("story", {"ki": "", "seung": "", "jeon": "", "gyeol": ""})
    result.setdefault("tone", "")
    result.setdefault("suggested", {})
    # 동물 캐릭터 gender 후처리
    for c in result.get("characters", []):
        if _is_animal_character(c):
            c["gender"] = "기타"
    result["generated_at"] = datetime.now(timezone.utc).isoformat()

    return result


async def revise_idea_brief(existing_brief: dict, hint: str) -> dict:
    """기존 idea_brief를 사용자 힌트로 재정리한다."""
    prompt = f"""## 기존 기획 메모
{json.dumps(existing_brief, ensure_ascii=False, indent=2)}

## 사용자 수정 요청
{hint}"""

    text = await generate_text(
        prompt=prompt,
        system_instruction=IDEA_BRIEF_REVISE_INSTRUCTION,
        temperature=0.7,
        max_output_tokens=AI_TOKENS_SHORT,
    )
    result = _parse_json(text)

    result.setdefault("summary", "")
    result.setdefault("characters", [])
    result.setdefault("story", {"ki": "", "seung": "", "jeon": "", "gyeol": ""})
    result.setdefault("tone", "")
    result.setdefault("suggested", existing_brief.get("suggested", {}))
    # 동물 캐릭터 gender 후처리
    for c in result.get("characters", []):
        if _is_animal_character(c):
            c["gender"] = "기타"
    result["generated_at"] = datetime.now(timezone.utc).isoformat()

    return result
