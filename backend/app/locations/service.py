"""Location Engine — 게이트 3: 장소 레퍼런스 이미지 생성.

PRD 4.3: 대본에서 주요 장소를 추출해 레퍼런스 이미지를 생성.
캐릭터와 동일한 자산 패턴(location_id 참조).
"""

from sqlalchemy.orm import Session

from app.locations.models import Location, LocationImage
from app.adapters.gemini_image import get_image_adapter
from app.storage import upload_image
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
