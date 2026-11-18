"""상세페이지(detail_page) — 섹션별 GPT 이미지 생성 + 문장 검사 + 원문 외 효능 문구 검출.

흐름: 섹션 대본(episode.script["detail_sections"]) → Gate3 승인 시 섹션 = 컷 1장(spec.kind="detail_section")
→ generate_cut_image 진입부에서 detail_page면 여기로 분기 (기존 컷 경로 불변).
검사(0패킷): ① 제목·본문 문장 포함 ② 원문·라벨·제품명 외 한글 문장(extra_lines) → 효능·수치·인증 패턴(extra_claims)이면
재시도 1회(STRICT) → 그래도 남으면 spec.generation.detail_check.warning_claims (프론트 경고 배지)
③ 손 검사(등장 섹션만) ④ 제품 포장 일치 = 참조 사진 + 프롬프트(라벨 포함, 다른 포장 금지).
"""

import logging
import os
import re
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.storyboard.models import Cut, GenerationLog
from app.products.models import Product, ProductPhoto
from app.characters.models import Character, CharacterImage, EpisodeCharacter
from app.styles.models import Style, STYLE_PRESETS
from app.projects.models import Episode
from app.storage import upload_image
from app.packets.service import charge_packets
from app.prompts.detail_page import build_detail_prompt, section_text, CHARACTER_ON
from app.workflow.gate import get_idea_brief

logger = logging.getLogger(__name__)

DETAIL_ASPECT = "2:3"          # openai 어댑터: 매핑 없음 → 1024x1536 (크롭 없음) = 2:3
MAX_PRODUCT_REFS = 3           # front + side + back
_REF_KIND_ORDER = ("front", "side", "back")

# 원문 외 문장 중 자동 재시도 대상 패턴 (효능·수치·인증)
CLAIM_PATTERNS = [
    r"효과", r"효능", r"%", r"[pP][hH]\s*\d", r"테스트", r"완료", r"인증", r"특허", r"1위", r"임상",
    r"개선", r"약산성", r"저자극", r"무첨가", r"피부과", r"검증", r"식약처", r"FDA", r"\d+\s*배",
    r"\d+(?:\.\d+)?\s*(?:mg|ml|g|도|시간|일)",
    # 2단계 확장 — 효능성 표현 (원문 외 문장에서만 검사)
    r"영양", r"건강", r"진정", r"케어", r"완화", r"보호", r"탈모",
]
_CLAIM_RE = re.compile("|".join(CLAIM_PATTERNS))
_HANGUL_RE = re.compile(r"[가-힣]")
_NORM_RE = re.compile(r"[\s·•・∙.,!?…~:;\-—–'\"“”‘’`☑✓✔✅①②③④⑤⑥⑦⑧⑨()\[\]{}+#*/|<>「」『』]")


def _norm(t: str) -> str:
    return _NORM_RE.sub("", t or "")


def split_sentences(section: dict) -> tuple[str, list[str]]:
    """제목 + 본문 문장 목록. 본문은 줄 단위 → 문장부호(. ! ?) 뒤 공백 기준 분할."""
    title = (section.get("title") or "").strip()
    sents: list[str] = []
    for line in (section.get("body") or "").splitlines():
        line = line.strip()
        if not line:
            continue
        sents += [s.strip() for s in re.split(r"(?<=[.!?。])\s+", line) if s.strip()]
    return title, sents


def ocr_text(image_bytes: bytes) -> str:
    """이미지의 모든 글자 전사 (Gemini 2.5 Flash). 실패 시 ""."""
    try:
        from google.genai import types
        from app.adapters.gemini import get_client, AI_TOKENS_MEDIUM
        resp = get_client().models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
                "Transcribe ALL text visible in this image exactly as written, line by line, "
                "including small text on product labels. Output plain text only.",
            ],
            config=types.GenerateContentConfig(temperature=0.0, max_output_tokens=AI_TOKENS_MEDIUM),
        )
        found = resp.text or ""
    except Exception as e:
        logger.warning("detail ocr failed: %s", e)
        return ""
    stub = os.environ.get("DETAIL_OCR_STUB")  # 검증용 스텁 (기본 없음) — 예: "pH 5.5 약산성 테스트 완료"
    if stub:
        found += "\n" + stub
    return found


def check_sentences(found: str, section: dict) -> dict:
    f = _norm(found)
    title, sents = split_sentences(section)
    hits = [s for s in sents if _norm(s) in f]
    return {
        "title_ok": bool(title) and _norm(title) in f,
        "body_exact": f"{len(hits)}/{len(sents)}",
        "body_ok": len(hits) == len(sents),
        "body_miss": [s for s in sents if s not in hits],
    }


def _is_label_claim(line: str, label_text: str | None) -> bool:
    """짧고 라벨·스펙 성격인 잔글씨 판별 — 제품 라벨 bbox 안 텍스트."""
    n = _norm(line)
    if len(n) > 20:
        return False
    # 라벨 텍스트와 단어 겹침 — 라벨에 있는 내용의 변형
    if label_text:
        ln = _norm(label_text)
        tokens = [_norm(t) for t in line.split() if _norm(t)]
        if tokens and sum(1 for t in tokens if t in ln) >= max(1, len(tokens) // 2):
            return True
    # 순수 수치·스펙 패턴 (짧은 인증/수치 문구)
    if re.search(r"[pP][hH]\s*\d|%|\d+\s*(?:mg|ml|mL|g|도|배)", line):
        return True
    return False


def find_extra_claims(found: str, allowed_texts: list[str], label_text: str | None = None) -> dict:
    """원문·라벨·제품명에 없는 한글 문장 → extra_lines, 그중 효능·수치·인증 패턴 → extra_claims / label_claims."""
    allowed = _norm("\n".join(t for t in allowed_texts if t))
    extra_lines, body_claims, label_claims = [], [], []
    for line in (found or "").splitlines():
        ln = line.strip()
        n = _norm(ln)
        if len(n) < 4 or not _HANGUL_RE.search(ln):
            continue
        if n in allowed:
            continue
        extra_lines.append(ln)
        if _CLAIM_RE.search(ln) and not _is_derived_chip(ln, allowed):
            if _is_label_claim(ln, label_text):
                label_claims.append(ln)
            else:
                body_claims.append(ln)
    return {"extra_lines": extra_lines, "extra_claims": body_claims, "label_claims": label_claims}


def _is_derived_chip(line: str, allowed_norm: str) -> bool:
    """원문 단어만으로 만든 짧은 포인트 칩("두피 열감 진정") — 효능 '추가'가 아니므로 재시도·빨간 배지 제외 (회색 목록엔 남음)."""
    if len(_norm(line)) > 12:
        return False
    tokens = [_norm(t) for t in line.split() if _norm(t)]
    return bool(tokens) and all(t in allowed_norm for t in tokens)


def _load(url: str) -> bytes | None:
    from app.images.service import _load_image_bytes
    return _load_image_bytes(url) if url else None


def product_reference_images(product: Product, db: Session) -> list[tuple[bytes, str]]:
    """front + 있으면 side/back 1장씩 (최대 3장). product_photos 없으면 photo_url(기존 1장)."""
    from app.image_util import composite_on_white
    from app.images.service import _downscale_image

    rows = db.query(ProductPhoto).filter(ProductPhoto.product_id == product.id).all()
    by_kind = {r.kind: r for r in rows}
    urls = [(k, by_kind[k].image_url) for k in _REF_KIND_ORDER if k in by_kind]
    if not urls and product.photo_url:
        urls = [("front", product.photo_url)]
    out = []
    for kind, url in urls[:MAX_PRODUCT_REFS]:
        b = _load(url)
        if not b:
            continue
        try:
            b = composite_on_white(b)
        except Exception:
            pass
        out.append((_downscale_image(b), f"Product photo ({kind}) — reproduce this exact product and label"))
    return out


def character_reference(episode_id: int, db: Session) -> tuple[bytes | None, str]:
    """에피소드 첫 캐릭터의 정면 시트."""
    from app.images.service import _downscale_image
    row = (
        db.query(Character, CharacterImage)
        .join(EpisodeCharacter, EpisodeCharacter.character_id == Character.id)
        .join(CharacterImage, CharacterImage.character_id == Character.id)
        .filter(EpisodeCharacter.episode_id == episode_id, CharacterImage.type == "front")
        .order_by(Character.id)
        .first()
    )
    if not row:
        return None, ""
    char, img = row
    b = _load(img.image_url)
    if not b:
        return None, ""
    return _downscale_image(b), f"Character sheet: main character ({char.name or 'character'})"


def _style_prompt(episode_id: int, db: Session) -> tuple[str, str]:
    style = db.query(Style).filter(Style.episode_id == episode_id).first()
    if style and style.prompt_snippet:
        return style.prompt_snippet, style.preset_key or "custom"
    return STYLE_PRESETS["korean_webtoon"]["prompt"], "korean_webtoon"


def inspect_detail_image(image_bytes: bytes, section: dict, product: Product | None, character: bool) -> dict:
    found = ocr_text(image_bytes)
    res = {**check_sentences(found, section)}
    allowed = [section_text(section)]
    label_text = None
    if product:
        allowed += [product.label_text or "", product.name or "", product.name_ko or ""]
        label_text = product.label_text
    res.update(find_extra_claims(found, allowed, label_text=label_text))
    if character:
        from app.prompts.copy_render import check_anatomy
        res["anatomy"] = check_anatomy(image_bytes)
    res["found_text"] = found[:2000]
    return res


def _needs_retry(chk: dict, character: bool) -> bool:
    if chk.get("extra_claims"):
        return True
    if character and not chk.get("anatomy", {}).get("ok", True):
        return True
    return False


async def generate_detail_section(
    cut: Cut,
    episode: Episode,
    project_id: int,
    user_id: int,
    db: Session,
    source: str | None = None,
    user_note: str | None = None,
) -> dict:
    """섹션 1장 생성 → 검사 → (효능 문구·손) 재시도 1회 → 저장 → 1패킷 후차감."""
    from app.adapters.openai_image import get_openai_image_adapter

    spec = dict(cut.spec or {})
    section = spec.get("section") or {}
    character = bool(section.get("character"))
    episode_id = episode.id

    product = db.query(Product).filter(Product.episode_id == episode_id).order_by(Product.id).first()
    refs: list[bytes] = []
    labels: list[str] = []
    if product:
        for b, lbl in product_reference_images(product, db):
            refs.append(b); labels.append(lbl)
    char_attached = False
    if character:
        cb, cl = character_reference(episode_id, db)
        if cb:
            refs.append(cb); labels.append(cl); char_attached = True

    style_prompt, style_key = _style_prompt(episode_id, db)
    palette = (get_idea_brief(episode.gate_status) or {}).get("product_palette") or []

    def _prompt(strict: bool) -> str:
        p = build_detail_prompt(section, style_prompt, character, palette=palette, strict=strict, user_note=user_note)
        if character and not char_attached:
            p = p.replace(CHARACTER_ON, "주인공 캐릭터가 등장")
        return p

    adapter = get_openai_image_adapter()
    prompt = _prompt(False)
    result = await adapter.generate_image(prompt=prompt, reference_images=refs or None,
                                          reference_labels=labels or None, aspect_ratio=DETAIL_ASPECT)
    chk = inspect_detail_image(result.image_bytes, section, product, character)
    retried = False
    first_claims = list(chk.get("extra_claims", []))
    if _needs_retry(chk, character):
        logger.warning("detail cut %s retry: claims=%s anatomy=%s", cut.cut_id, chk.get("extra_claims"), chk.get("anatomy"))
        try:
            r2 = await adapter.generate_image(prompt=_prompt(True), reference_images=refs or None,
                                              reference_labels=labels or None, aspect_ratio=DETAIL_ASPECT)
            chk2 = inspect_detail_image(r2.image_bytes, section, product, character)
            retried = True
            # 효능 문구가 더 적거나 같으면 재시도 결과 채택
            if len(chk2.get("extra_claims", [])) <= len(chk.get("extra_claims", [])):
                result, chk = r2, chk2
            logger.warning("detail cut %s retry done: claims=%s", cut.cut_id, chk.get("extra_claims"))
        except Exception as e:
            logger.warning("detail cut %s retry failed (using first): %s", cut.cut_id, e)

    # 저장
    version = (cut.version or 0) + 1
    url = upload_image(
        image_bytes=result.image_bytes,
        path_prefix=f"episodes/{episode_id}/cuts",
        filename=f"{cut.cut_id}_v{version}.png",
        mime_type=result.mime_type,
    )
    cut.prev_image_url = cut.image_url
    cut.image_url = url
    cut.composed_image_url = None  # 말풍선 없음 — 원본이 완성본
    cut.seed = result.seed
    cut.version = version
    cut.status = "approved"

    detail_check = {k: v for k, v in chk.items() if k != "found_text"}
    detail_check["retried"] = retried
    detail_check["first_claims"] = first_claims
    detail_check["warning_claims"] = chk.get("extra_claims", [])  # 본문 영역 효능 문구 → 빨간 배지
    detail_check["label_claims"] = chk.get("label_claims", [])    # 라벨 잔글씨 → 주황 배지
    spec["generation"] = {
        "image_url": url,
        "previous_image_url": cut.prev_image_url,
        "seed": result.seed,
        "model": result.model,
        "used_references": (["product"] if product else []) + (["character"] if char_attached else []) + [f"style:{style_key}"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "version": version,
        "detail_check": detail_check,
        "found_text": chk.get("found_text", ""),
        **({"user_note": user_note} if user_note else {}),
    }
    spec["status"] = "approved"
    cut.spec = spec

    log = GenerationLog(
        cut_id=cut.cut_id, episode_id=episode_id, project_id=project_id, user_id=user_id,
        kind="cut", model=result.model, model_tier="gpt",
        cost_usd=0.04 if retried else 0.02, credits_charged=0, packets_charged=2,
        seed=result.seed, source=source,
    )
    db.add(log)
    db.flush()
    charge_packets(user_id, 2, "generation", log.id, db)

    logger.info("detail cut %s done: title_ok=%s body=%s extra=%d claims=%s retried=%s",
                cut.cut_id, chk.get("title_ok"), chk.get("body_exact"), len(chk.get("extra_lines", [])),
                chk.get("extra_claims"), retried)
    return {"cut_id": cut.cut_id, "image_url": url, "version": version, "seed": result.seed,
            "detail_check": detail_check}


# ── 섹션 → 컷 ────────────────────────────────────────────────

def get_sections(episode: Episode) -> list[dict]:
    return list(((episode.script or {}).get("detail_sections")) or [])


def create_detail_cuts(episode: Episode, db: Session) -> list[Cut]:
    """섹션 대본 → 컷 행 (섹션 1개 = 컷 1장). 기존 컷은 삭제."""
    sections = get_sections(episode)
    db.query(Cut).filter(Cut.episode_id == episode.id).delete()
    db.execute(text("DELETE FROM cut_asset_refs WHERE episode_id = :eid"), {"eid": episode.id})
    cuts = []
    for i, sec in enumerate(sections, start=1):
        c = Cut(
            cut_id=f"ep{episode.id:02d}_c{i:03d}",
            episode_id=episode.id,
            scene_id=f"detail_{sec.get('key') or i}",
            cut_number=i,
            status="pending",
            spec={
                "kind": "detail_section",
                "section": sec,
                "dialogue": [],
                "characters": [],
                "has_product": True,
                "status": "pending",
            },
        )
        db.add(c)
        cuts.append(c)
    return cuts
