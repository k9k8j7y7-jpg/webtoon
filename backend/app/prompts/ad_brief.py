"""광고 기획안 생성 — 브리프(목적·전달 내용·분위기) → 기획안(카피 3·장면 3·추천 스타일).

0패킷. gemini-2.5-flash 텍스트. 단일 진입점 generate_ad_brief().
"""

import logging
from app.adapters.gemini import generate_text, parse_ai_json, AI_TOKENS_MEDIUM

logger = logging.getLogger(__name__)

# ── 광고 목적 6종 ──
AD_PURPOSES = {
    "product_ad":    "상품 광고 — 제품 판매·인지도",
    "brand_promo":   "브랜드 홍보 — 브랜드 이미지·인지도",
    "sns_content":   "SNS 콘텐츠 — 팔로워 참여·공유",
    "event_promo":   "이벤트 홍보 — 할인·시즌·오프닝",
    "info_delivery": "정보 전달 — 사용법·후기·비교",
    "meme_parody":   "밈·패러디 — 유머·트렌드·바이럴",
}

# ── 분위기 6종 ──
AD_MOODS = {
    "premium":    "프리미엄 — 고급스럽고 깔끔한",
    "webtoon":    "웹툰·캐릭터 — 친근하고 캐릭터 중심",
    "humor":      "유머·병맛 — 웃기고 파격적인",
    "emotional":  "감성·무드 — 따뜻하고 분위기 있는",
    "photo_real": "실사 광고 — 실제 사진 같은",
    "ai_pick":    "AI 추천 — 전달 내용에 맞게 자동",
}

# ── 카피 다시 쓰기 방향 ──
COPY_DIRECTION_PROMPTS = {
    "shorter":   "더 짧고 임팩트 있게 줄여라. 5자 이내가 이상적.",
    "impact":    "강렬하고 시선을 끄는 카피로. 감탄사·반전·과장 활용.",
    "emotional": "감성적이고 공감되는 카피로. 따뜻하거나 서정적 톤.",
    "humor":     "유머러스하고 위트 있는 카피로. 밈·말장난·예상 뒤집기.",
    "trust":     "신뢰감 있는 카피로. 숫자·전문성·보증 느낌.",
}

SYSTEM_INSTRUCTION = """너는 SNS 광고 크리에이티브 디렉터야.
광고 브리프를 받아서 웹툰/일러스트 광고 기획안을 만든다.

반드시 아래 JSON 형식으로만 응답해. 다른 텍스트 없이.

{
  "key_message": "핵심 메시지 한 줄 (20자 이내)",
  "target_summary": "타깃 요약 한 줄",
  "copy_candidates": [
    {"head": "헤드카피 (12자 이내)", "sub": "서브카피 (25자 이내)"},
    {"head": "...", "sub": "..."},
    {"head": "...", "sub": "..."}
  ],
  "scene_ideas": [
    {"scene": "장면 아이디어 한 줄", "shot": "full"},
    {"scene": "...", "shot": "bust"},
    {"scene": "...", "shot": "close_up"}
  ],
  "recommended_style": "korean_webtoon"
}

규칙:
- copy_candidates는 반드시 3개. head는 12자 이내 한국어.
- scene_ideas는 반드시 3개. shot은 long|full|bust|close_up 중 택1.
- recommended_style: korean_webtoon | anime | emotional_romance | watercolor_fairy |
  noir_shadow | retro_90s | sd_chibi | bw_manga | pop_art | flat_vector |
  classic_fairytale | fantasy_rpg | dreamy_pastel | urban_sketch | vintage_poster | western_fantasy
- 제품 정보가 있으면 장면에 제품이 자연스럽게 등장하게.
- 노골적 광고 문구 금지 ("지금 구매!", "최고!" 등).
"""

REWRITE_COPY_INSTRUCTION = """기존 카피를 아래 방향으로 다시 써라.
기존 head와 sub를 참고하되, 방향에 맞게 완전히 새로 작성.
JSON으로만 응답: {"head": "새 헤드카피", "sub": "새 서브카피"}
"""


async def generate_ad_brief(
    ad_purpose: str,
    key_message: str,
    mood: str,
    target_audience: str = "",
    cta: str = "",
    product_name: str = "",
    product_features: str = "",
    reference_analysis: str = "",
    extras: dict | None = None,
) -> dict:
    """광고 브리프 → 기획안 (카피 3·장면 3·추천 스타일). 0패킷."""
    purpose_label = AD_PURPOSES.get(ad_purpose, ad_purpose)
    mood_label = AD_MOODS.get(mood, mood)

    prompt_parts = [
        f"광고 목적: {purpose_label}",
        f"전달 내용: {key_message}",
        f"분위기: {mood_label}",
    ]
    if target_audience:
        prompt_parts.append(f"타깃: {target_audience}")
    if cta:
        prompt_parts.append(f"CTA 문구: {cta}")
    if product_name:
        prompt_parts.append(f"제품명: {product_name}")
    if product_features:
        prompt_parts.append(f"제품 특징: {product_features}")
    if reference_analysis:
        prompt_parts.append(f"참고 광고 분석: {reference_analysis}")
    if extras:
        if extras.get("brand_colors"):
            prompt_parts.append(f"브랜드 색: {extras['brand_colors']}")
        if extras.get("avoid"):
            prompt_parts.append(f"넣지 말 것: {extras['avoid']}")

    prompt = "\n".join(prompt_parts)
    prompt += "\n\n위 브리프로 웹툰/일러스트 광고 기획안을 JSON으로 만들어줘."

    raw = await generate_text(
        prompt=prompt,
        system_instruction=SYSTEM_INSTRUCTION,
        temperature=0.85,
        max_output_tokens=AI_TOKENS_MEDIUM,
    )
    result = parse_ai_json(raw)
    logger.info("ad_brief generated: purpose=%s mood=%s copies=%d scenes=%d style=%s",
                ad_purpose, mood, len(result.get("copy_candidates", [])),
                len(result.get("scene_ideas", [])), result.get("recommended_style"))
    return result


async def rewrite_copy(
    existing_head: str,
    existing_sub: str,
    direction: str,
    key_message: str = "",
) -> dict:
    """카피 다시 쓰기. direction은 COPY_DIRECTION_PROMPTS 키 또는 직접 입력."""
    direction_text = COPY_DIRECTION_PROMPTS.get(direction, direction)

    prompt = (
        f"기존 헤드카피: {existing_head}\n"
        f"기존 서브카피: {existing_sub}\n"
    )
    if key_message:
        prompt += f"핵심 메시지: {key_message}\n"
    prompt += f"\n방향: {direction_text}"

    raw = await generate_text(
        prompt=prompt,
        system_instruction=REWRITE_COPY_INSTRUCTION,
        temperature=0.8,
        max_output_tokens=1024,
    )
    return parse_ai_json(raw)
