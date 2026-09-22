"""Story Engine — 게이트 1: 아이디어 → 기획(제목·로그라인·시놉시스·세계관·인물목록)

API-Spec 3장, PRD 3.1 참조.
"""

import json
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
    return result.get("characters", [])


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
        prompt += "\n\n중요: 위 기획서의 인물·사건·결말을 그대로 따를 것. 기획서에 없는 새 인물을 추가하지 말 것(단역 제외)."

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
        prompt += "\n\n위 등장인물을 반드시 포함해서 기획안을 만들어줘. 등장인물의 ref_key는 네가 생성하고, description은 사용자가 입력한 추가설명을 반영해서 보강해줘."
    else:
        prompt += "\n\n위 아이디어로 웹툰 기획안을 만들어줘."

    raw = await generate_text(
        prompt=prompt,
        system_instruction=SYSTEM_INSTRUCTION,
        temperature=0.9,
        max_output_tokens=4096,
    )

    result = _parse_json(raw)

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
- characters의 gender는 "남", "여", "기타" 중 하나. 동물도 성별 추정(불명이면 "기타")
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
    result["generated_at"] = datetime.now(timezone.utc).isoformat()

    return result
