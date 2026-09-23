"""Location Engine — 장소 레퍼런스 이미지 생성 + 장소 영문 스펙.

PRD 4.3: 대본에서 주요 장소를 추출해 레퍼런스 이미지를 생성.
캐릭터와 동일한 자산 패턴(location_id 참조).
"""

import logging

from sqlalchemy.orm import Session

from app.config import get_settings
from app.locations.models import Location, LocationImage
from app.adapters.gemini_image import get_image_adapter
from app.adapters.gemini import generate_text, AI_TOKENS_SHORT

settings = get_settings()
from app.storage import upload_image
from app.images.service import _load_image_bytes
from app.jobs import get_job, update_job
from app.database import SessionLocal
from app.packets.service import charge_packets

logger = logging.getLogger(__name__)


async def generate_location_spec_en(
    name: str | None,
    description: str | None,
    mood_notes: str | None,
) -> str:
    """장소 이름·묘사·분위기 → 영문 스펙 한 줄 (컷 프롬프트 주입용).

    appearance_en 패턴: 한글 입력 → Gemini 텍스트로 영문 변환.
    ≤80 단어. 공간 종류, 핵심 가구/구조 3~5개, 색·재질, 조명·시간대, 분위기.
    사람·캐릭터 언급 금지. 무료(텍스트 LLM).
    """
    parts = []
    if name:
        parts.append(f"장소 이름: {name}")
    if description:
        parts.append(f"묘사: {description}")
    if mood_notes:
        parts.append(f"분위기: {mood_notes}")

    if not parts:
        return ""

    korean_input = "\n".join(parts)

    try:
        result = await generate_text(
            prompt=(
                "You are a location description writer for webtoon illustration prompts.\n"
                "Convert the following Korean location info into ONE concise English line (≤80 words).\n"
                "Include: space type, 3-5 key furniture/structures, colors/materials, "
                "lighting/time of day, atmosphere.\n"
                "Do NOT mention any people, characters, or animals.\n"
                "Output ONLY the English description, nothing else.\n\n"
                f"{korean_input}"
            ),
            temperature=0.3,
            max_output_tokens=AI_TOKENS_SHORT,
        )
        return result.strip().replace("\n", " ")[:500]
    except Exception as e:
        logger.warning("generate_location_spec_en failed: %s", e)
        return ""


async def generate_location_images(
    episode_id: int,
    locations_data: list[dict],
    style_prompt: str,
    job_id: str,
    db: Session,
    aspect_ratio: str = "16:9",
):
    """모든 장소의 레퍼런스 이미지를 생성한다."""
    # BackgroundTask는 별도 스레드에서 실행 → 자체 DB 세션 사용
    db = SessionLocal()
    adapter = get_image_adapter()
    total = len(locations_data)
    results = []

    for i, loc_data in enumerate(locations_data):
        ref_key = loc_data.get("ref_key", f"loc_{i}")
        name = loc_data.get("name", "")
        description = loc_data.get("description", "")
        mood_notes = loc_data.get("mood_notes", "") or ""

        # DB 레코드 생성/조회
        location = (
            db.query(Location)
            .filter(Location.episode_id == episode_id, Location.ref_key == ref_key)
            .first()
        )
        if not location:
            location = Location(
                ref_key=ref_key,
                episode_id=episode_id,
                name=name,
                description=description,
                mood_notes=mood_notes or None,
                status="draft",
            )
            db.add(location)
            db.flush()
        else:
            # 재생성 시 mood_notes 업데이트
            if mood_notes:
                location.mood_notes = mood_notes

        # 영문 스펙 생성 (없을 때만 — 이미 있으면 수동 갱신 대기)
        if not location.location_spec_en:
            try:
                spec_en = await generate_location_spec_en(
                    location.name, location.description, location.mood_notes,
                )
                if spec_en:
                    location.location_spec_en = spec_en
            except Exception as e:
                logger.warning("spec_en generation failed for '%s': %s", ref_key, e)

        # 사진으로 대체된 장소 또는 텍스트 전용: AI 이미지 생성 스킵
        photo_url = loc_data.get("reference_photo_url")
        skip_images = photo_url == "__text_only__" or loc_data.get("skip_images")
        if skip_images:
            results.append({"ref_key": ref_key, "name": name, "status": "text_only"})
        elif photo_url:
            location.reference_photo_url = photo_url
            results.append({"ref_key": ref_key, "name": name, "status": "photo"})
        else:
            # 기존 이미지 삭제 (재생성 시 구 이미지 제거)
            db.query(LocationImage).filter(LocationImage.location_id == location.id).delete()
            db.flush()

            # 이미지 생성 (mood_notes 포함)
            loc_desc = f"{name}. {description}"
            if mood_notes:
                loc_desc += f" Atmosphere: {mood_notes}"
            try:
                img_result = await adapter.generate_location(
                    location_description=loc_desc,
                    style_prompt=style_prompt,
                    aspect_ratio=aspect_ratio,
                )
                url = upload_image(
                    image_bytes=img_result.image_bytes,
                    path_prefix=f"episodes/{episode_id}/locations/{ref_key}",
                    filename="reference.png",
                    mime_type=img_result.mime_type,
                )
                loc_img = LocationImage(
                    location_id=location.id,
                    image_url=url,
                    seed=img_result.seed,
                )
                db.add(loc_img)

                # 패킷 차감: 장소 레퍼런스 = 1패킷
                from app.storyboard.models import GenerationLog
                from app.projects.models import Episode as Ep, Project as Prj
                ep = db.query(Ep).filter(Ep.id == episode_id).first()
                prj = db.query(Prj).filter(Prj.id == ep.project_id).first() if ep else None
                owner_id = prj.user_id if prj else 0
                if owner_id:
                    gen_log = GenerationLog(
                        episode_id=episode_id,
                        project_id=ep.project_id if ep else 0,
                        user_id=owner_id,
                        kind="location",
                        model=settings.IMAGE_MODEL,
                        model_tier="flash",
                        cost_usd=0.02,
                        credits_charged=0,
                        packets_charged=1,
                    )
                    db.add(gen_log)
                    db.flush()
                    charge_packets(owner_id, 1, "generation", gen_log.id, db)

                # 첫 이미지 생성 시 비율 잠금
                from app.workflow.gate import is_aspect_ratio_locked, lock_aspect_ratio
                ep_obj = db.query(Ep).filter(Ep.id == episode_id).first()
                if ep_obj and not is_aspect_ratio_locked(ep_obj.gate_status):
                    ep_obj.gate_status = lock_aspect_ratio(ep_obj.gate_status)

                results.append({"ref_key": ref_key, "name": name, "status": "generated"})

            except Exception as e:
                results.append({"ref_key": ref_key, "name": name, "status": "failed", "error": str(e)})

        job = get_job(job_id)
        if job:
            update_job(job_id, progress={"done": i + 1, "total": total})

    db.commit()
    db.close()
    return {"locations": results}


async def extract_photo_description(location: Location, db: Session) -> str:
    """업로드 사진 → 비전으로 공간 묘사 추출 → description·spec_en 저장.

    이미지 생성 없음, 패킷 차감 없음. 사진 업로드 시 자동 호출.
    Returns: 추출된 공간 묘사 텍스트
    """
    photo_bytes = _load_image_bytes(location.reference_photo_url)
    if not photo_bytes:
        raise RuntimeError("원본 사진을 읽을 수 없습니다")

    from google.genai import types
    from app.adapters.gemini import get_client

    client = get_client()
    vision_response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            types.Part.from_bytes(data=photo_bytes, mime_type="image/jpeg"),
            (
                "Describe this room's spatial layout in English, under 150 words. "
                "Focus on: room shape, wall colors, floor material, window positions and size, "
                "furniture types and placement (e.g. 'beige L-shaped sofa on the left, "
                "round wooden table in center'), lighting direction, and camera angle. "
                "Ignore any people, animals, or small clutter. "
                "Do NOT describe the image as a photo — write as if describing a room to an illustrator."
            ),
        ],
        config=types.GenerateContentConfig(
            temperature=0.3,
            max_output_tokens=AI_TOKENS_SHORT,
        ),
    )
    spatial_desc = vision_response.text.strip()
    logger.warning("Photo→text for '%s': %s", location.ref_key, spatial_desc[:200])

    # description이 비어 있으면 채움 (있으면 유지 — 사용자 입력 보호)
    if not location.description or not location.description.strip():
        location.description = spatial_desc

    # spec_en 재생성
    try:
        spec_en = await generate_location_spec_en(
            location.name, location.description, location.mood_notes,
        )
        if spec_en:
            location.location_spec_en = spec_en
    except Exception as e:
        logger.warning("spec_en regen after photo for '%s': %s", location.ref_key, e)

    db.commit()
    return spatial_desc


async def convert_photo_to_illustration(
    location: Location,
    style_prompt: str,
    db: Session,
    aspect_ratio: str = "16:9",
) -> str:
    """업로드 사진 → 공간 묘사 추출(비전) → 일러스트 생성(텍스트→이미지).

    플랜 C: image-to-image 스타일 변환이 불신뢰 → 2단계 파이프라인.
    1) 비전 콜: 사진에서 공간 구조 텍스트 묘사 추출 (영어, 150단어)
    2) 텍스트→이미지: 추출 묘사 + style_prompt로 일러스트 생성 (참조 이미지 없음)

    Returns: converted_photo_url
    """
    import logging
    logger = logging.getLogger(__name__)

    photo_bytes = _load_image_bytes(location.reference_photo_url)
    if not photo_bytes:
        raise RuntimeError("원본 사진을 읽을 수 없습니다")

    # ── 1단계: 비전 → 공간 묘사 추출 ──
    from google.genai import types
    from app.adapters.gemini import get_client, AI_TOKENS_SHORT

    client = get_client()
    vision_response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            types.Part.from_bytes(data=photo_bytes, mime_type="image/jpeg"),
            (
                "Describe this room's spatial layout in English, under 150 words. "
                "Focus on: room shape, wall colors, floor material, window positions and size, "
                "furniture types and placement (e.g. 'beige L-shaped sofa on the left, "
                "round wooden table in center'), lighting direction, and camera angle. "
                "Ignore any people, animals, or small clutter. "
                "Do NOT describe the image as a photo — write as if describing a room to an illustrator."
            ),
        ],
        config=types.GenerateContentConfig(
            temperature=0.3,
            max_output_tokens=AI_TOKENS_SHORT,
        ),
    )
    spatial_desc = vision_response.text.strip()
    logger.warning("Photo→text for '%s': %s", location.ref_key, spatial_desc[:200])

    # spatial_desc를 description에 저장 (비어 있을 때만 — 사용자 입력 보호)
    if not location.description or not location.description.strip():
        location.description = spatial_desc
    # spec_en 재생성 (사진 업로드 시 묘사가 바뀔 수 있으므로)
    try:
        spec_en = await generate_location_spec_en(
            location.name, location.description, location.mood_notes,
        )
        if spec_en:
            location.location_spec_en = spec_en
    except Exception as e:
        logger.warning("spec_en regen after photo for '%s': %s", location.ref_key, e)

    # ── 2단계: 텍스트→이미지 (참조 이미지 없음) ──
    adapter = get_image_adapter()

    gen_prompt = (
        f"Background illustration, detailed environment art. "
        f"{spatial_desc}. "
        f"{style_prompt}. "
        f"No characters, environment only, clean line art, flat cel shading, "
        f"hand-drawn webtoon background panel."
    )

    result = await adapter.generate_image(prompt=gen_prompt, aspect_ratio=aspect_ratio)

    url = upload_image(
        image_bytes=result.image_bytes,
        path_prefix=f"episodes/{location.episode_id}/locations/{location.ref_key}",
        filename="converted.png",
        mime_type=result.mime_type,
    )

    location.converted_photo_url = url

    # 패킷 차감: 사진→일러스트 = 1패킷
    from app.storyboard.models import GenerationLog
    from app.projects.models import Episode as Ep, Project as Prj
    ep = db.query(Ep).filter(Ep.id == location.episode_id).first()
    prj = db.query(Prj).filter(Prj.id == ep.project_id).first() if ep else None
    owner_id = prj.user_id if prj else 0
    if owner_id:
        gen_log = GenerationLog(
            episode_id=location.episode_id,
            project_id=ep.project_id if ep else 0,
            user_id=owner_id,
            kind="location",
            model=settings.IMAGE_MODEL,
            model_tier="flash",
            cost_usd=0.02,
            credits_charged=0,
            packets_charged=1,
        )
        db.add(gen_log)
        db.flush()
        charge_packets(owner_id, 1, "generation", gen_log.id, db)

    db.commit()

    return url
