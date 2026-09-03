"""Location Engine — 게이트 3: 장소 레퍼런스 이미지 생성.

PRD 4.3: 대본에서 주요 장소를 추출해 레퍼런스 이미지를 생성.
캐릭터와 동일한 자산 패턴(location_id 참조).
"""

from sqlalchemy.orm import Session

from app.locations.models import Location, LocationImage
from app.adapters.gemini_image import get_image_adapter
from app.storage import upload_image
from app.images.service import _load_image_bytes
from app.jobs import get_job, update_job
from app.database import SessionLocal


async def generate_location_images(
    episode_id: int,
    locations_data: list[dict],
    style_prompt: str,
    job_id: str,
    db: Session,
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

        # 사진으로 대체된 장소: AI 생성 스킵
        photo_url = loc_data.get("reference_photo_url")
        if photo_url:
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
                results.append({"ref_key": ref_key, "name": name, "status": "generated"})

            except Exception as e:
                results.append({"ref_key": ref_key, "name": name, "status": "failed", "error": str(e)})

        job = get_job(job_id)
        if job:
            update_job(job_id, progress={"done": i + 1, "total": total})

    db.commit()
    db.close()
    return {"locations": results}


async def convert_photo_to_illustration(
    location: Location,
    style_prompt: str,
    db: Session,
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

    # ── 2단계: 텍스트→이미지 (참조 이미지 없음) ──
    adapter = get_image_adapter()

    gen_prompt = (
        f"Background illustration, detailed environment art. "
        f"{spatial_desc}. "
        f"{style_prompt}. "
        f"No characters, environment only, clean line art, flat cel shading, "
        f"hand-drawn webtoon background panel."
    )

    result = await adapter.generate_image(prompt=gen_prompt, aspect_ratio="16:9")

    url = upload_image(
        image_bytes=result.image_bytes,
        path_prefix=f"episodes/{location.episode_id}/locations/{location.ref_key}",
        filename="converted.png",
        mime_type=result.mime_type,
    )

    location.converted_photo_url = url
    db.commit()

    return url
