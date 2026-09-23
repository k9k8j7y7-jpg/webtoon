"""게이트 3 — 장소 엔드포인트. API-Spec 5장."""

import re

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User
from app.projects.models import Project, Episode
from app.locations.models import Location
from app.locations.service import (
    generate_location_images,
    convert_photo_to_illustration,
    extract_photo_description,
    generate_location_spec_en,
)
from app.storage import upload_image
from app.jobs import create_job, run_job_in_background
from app.workflow.gate import get_gate_number, get_aspect_ratio
from app.styles.models import Style, STYLE_PRESETS
from app.packets.service import require_packets

router = APIRouter(tags=["gate3-locations"])


class LocationsGenerateRequest(BaseModel):
    locations: list[dict] | None = None  # 사용자가 편집한 장소 목록 (없으면 대본에서 추출)


class LocationUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    mood_notes: str | None = None


@router.get("/projects/{project_id}/episodes/{episode_id}/locations/suggest")
async def suggest_locations(
    project_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """대본에서 필요한 장소 목록을 제안한다 (텍스트, 무료). 사용자가 확인·편집 후 생성."""
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)
    script_data = (episode.script or {}).get("script", {})
    locations_data = script_data.get("locations", [])
    return {"locations": locations_data}


@router.post("/projects/{project_id}/episodes/{episode_id}/locations", status_code=202)
async def create_locations(
    project_id: int,
    episode_id: int,
    body: LocationsGenerateRequest | None = None,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)

    gate = get_gate_number(episode.gate_status)
    if gate not in (3, 4, 5):
        raise HTTPException(status_code=400, detail=f"Current gate is {gate}, locations require gate 3-5")

    # 사용자 확정 목록이 있으면 사용, 없으면 대본에서 추출
    if body and body.locations:
        locations_data = body.locations
    else:
        script_data = (episode.script or {}).get("script", {})
        locations_data = script_data.get("locations", [])

    if not locations_data:
        raise HTTPException(status_code=400, detail="No locations found")

    # 패킷 사전 확인: 이미지 생성 대상만 1패킷씩 (사진 대체·텍스트 전용 제외)
    gen_loc_count = sum(
        1 for l in locations_data
        if not l.get("reference_photo_url") and not l.get("skip_images")
    )
    if gen_loc_count > 0:
        require_packets(current_user.id, gen_loc_count, db)

    style = db.query(Style).filter(Style.episode_id == episode_id).first()
    style_prompt = style.prompt_snippet if style else STYLE_PRESETS["korean_webtoon"]["prompt"]
    ep_aspect_ratio = get_aspect_ratio(episode.gate_status)
    job = create_job(total=len(locations_data))

    run_job_in_background(
        background_tasks,
        job.job_id,
        generate_location_images(
            episode_id=episode_id,
            locations_data=locations_data,
            style_prompt=style_prompt,
            job_id=job.job_id,
            db=db,
            aspect_ratio=ep_aspect_ratio,
        ),
    )

    return {"job_id": job.job_id, "locations": [l.get("ref_key") for l in locations_data]}


@router.get("/locations/{location_id}")
async def get_location(
    location_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    return {
        "id": location.id,
        "ref_key": location.ref_key,
        "name": location.name,
        "description": location.description,
        "mood_notes": location.mood_notes,
        "location_spec_en": location.location_spec_en,
        "status": location.status,
        "reference_photo_url": location.reference_photo_url,
        "converted_photo_url": location.converted_photo_url,
        "images": [{"url": img.image_url, "seed": img.seed} for img in location.images],
        "image_url": location.images[0].image_url if location.images else None,
    }


@router.put("/locations/{location_id}")
async def update_location(
    location_id: int,
    body: LocationUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """장소 이름·묘사·분위기 수정 + 영문 스펙 자동 재생성."""
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    changed = False
    if body.name is not None and body.name != location.name:
        location.name = body.name
        changed = True
    if body.description is not None and body.description != location.description:
        location.description = body.description or None
        changed = True
    if body.mood_notes is not None and body.mood_notes != location.mood_notes:
        location.mood_notes = body.mood_notes or None
        changed = True

    # 텍스트 변경 시 spec_en 자동 재생성
    if changed:
        try:
            spec_en = await generate_location_spec_en(
                location.name, location.description, location.mood_notes,
            )
            location.location_spec_en = spec_en or None
        except Exception:
            pass  # 실패해도 저장은 진행

    db.commit()
    return {
        "id": location.id,
        "ref_key": location.ref_key,
        "name": location.name,
        "description": location.description,
        "mood_notes": location.mood_notes,
        "location_spec_en": location.location_spec_en,
    }


@router.post("/locations/{location_id}/regenerate", status_code=202)
async def regenerate_location(
    location_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """장소 레퍼런스 이미지 재생성 (mood_notes 반영)."""
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    # 패킷 사전 확인: 장소 재생성 = 1패킷
    require_packets(current_user.id, 1, db)

    episode = db.query(Episode).filter(Episode.id == location.episode_id).first()
    ep_aspect_ratio = get_aspect_ratio(episode.gate_status) if episode else "9:16"

    style = db.query(Style).filter(Style.episode_id == location.episode_id).first()
    style_prompt = style.prompt_snippet if style else STYLE_PRESETS["korean_webtoon"]["prompt"]
    job = create_job(total=1)

    run_job_in_background(
        background_tasks,
        job.job_id,
        generate_location_images(
            episode_id=location.episode_id,
            locations_data=[{
                "ref_key": location.ref_key,
                "name": location.name,
                "description": location.description,
                "mood_notes": location.mood_notes,
            }],
            style_prompt=style_prompt,
            job_id=job.job_id,
            db=db,
            aspect_ratio=ep_aspect_ratio,
        ),
    )

    return {"job_id": job.job_id}


@router.get("/projects/{project_id}/episodes/{episode_id}/locations")
async def list_locations(
    project_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_episode_for_user(db, project_id, episode_id, current_user.id)
    locations = db.query(Location).filter(Location.episode_id == episode_id).all()
    return [
        {
            "id": l.id,
            "ref_key": l.ref_key,
            "name": l.name,
            "description": l.description,
            "mood_notes": l.mood_notes,
            "location_spec_en": l.location_spec_en,
            "status": l.status,
            "reference_photo_url": l.reference_photo_url,
            "converted_photo_url": l.converted_photo_url,
            "image_count": len(l.images),
            "image_url": l.images[0].image_url if l.images else None,
        }
        for l in locations
    ]


@router.post("/projects/{project_id}/episodes/{episode_id}/locations/upload-photo")
async def upload_location_photo_pre(
    project_id: int,
    episode_id: int,
    ref_key: str = "",
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """제안 단계에서 장소 사진을 미리 업로드한다 (location 레코드 생성 전)."""
    _get_episode_for_user(db, project_id, episode_id, current_user.id)

    from app.image_util import validate_and_process

    raw = await file.read()
    try:
        processed, mime = validate_and_process(
            raw,
            original_content_type=file.content_type or "",
            original_filename=file.filename or "",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    folder = ref_key or "temp"
    url = upload_image(
        image_bytes=processed,
        path_prefix=f"episodes/{episode_id}/locations/{folder}/photos",
        filename="user_ref.jpg",
        mime_type=mime,
    )

    return {"url": url}


@router.post("/locations/{location_id}/photo")
async def upload_location_photo(
    location_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """장소 참고 사진 업로드 → 비전으로 묘사 추출 (무료, 이미지 변환은 옵션)."""
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    from app.image_util import validate_and_process

    raw = await file.read()
    try:
        processed, mime = validate_and_process(
            raw,
            original_content_type=file.content_type or "",
            original_filename=file.filename or "",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    url = upload_image(
        image_bytes=processed,
        path_prefix=f"episodes/{location.episode_id}/locations/{location.ref_key}/photos",
        filename="user_ref.jpg",
        mime_type=mime,
    )
    location.reference_photo_url = url
    location.converted_photo_url = None  # 기존 변환본 초기화
    db.commit()

    # 비전으로 묘사 추출 (패킷 무료) — 이미지 변환은 하지 않음
    spatial_desc = await extract_photo_description(location, db)

    return {
        "id": location.id,
        "reference_photo_url": url,
        "converted_photo_url": None,
        "description": location.description,
        "location_spec_en": location.location_spec_en,
    }


@router.post("/locations/{location_id}/reconvert")
async def reconvert_location_photo(
    location_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """장소 사진 재변환 (1패킷)."""
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    if not location.reference_photo_url:
        raise HTTPException(status_code=400, detail="업로드된 사진이 없습니다")

    # 패킷 사전 확인: 사진→일러스트 재변환 = 1패킷
    require_packets(current_user.id, 1, db)

    style = db.query(Style).filter(Style.episode_id == location.episode_id).first()
    style_prompt = style.prompt_snippet if style else STYLE_PRESETS["korean_webtoon"]["prompt"]
    ep = db.query(Episode).filter(Episode.id == location.episode_id).first()
    ep_ar = get_aspect_ratio(ep.gate_status) if ep else "9:16"
    converted_url = await convert_photo_to_illustration(location, style_prompt, db, aspect_ratio=ep_ar)

    return {
        "id": location.id,
        "converted_photo_url": converted_url,
    }


@router.delete("/locations/{location_id}/photo")
async def delete_location_photo(
    location_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """장소 참고 사진 삭제 (AI 생성 레퍼런스로 되돌림)."""
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    location.reference_photo_url = None
    location.converted_photo_url = None
    db.commit()

    return {"id": location.id, "reference_photo_url": None, "converted_photo_url": None}


@router.delete("/locations/{location_id}")
async def delete_location(
    location_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """장소 삭제. 컷이 참조 중이면 거부."""
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    from app.storyboard.models import Cut
    # 이 장소를 참조하는 컷 수 확인
    referring_cuts = (
        db.query(Cut)
        .filter(Cut.episode_id == location.episode_id)
        .all()
    )
    ref_count = sum(
        1 for c in referring_cuts
        if (c.spec or {}).get("location_id") == location.ref_key
    )
    if ref_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"{ref_count}개 컷이 이 장소를 쓰고 있어요. 컷의 장소를 먼저 바꿔주세요.",
        )

    # 연결된 이미지 삭제
    from app.locations.models import LocationImage
    db.query(LocationImage).filter(LocationImage.location_id == location.id).delete()
    db.delete(location)
    db.commit()

    return {"deleted": True, "id": location_id}


def _get_episode_for_user(db, project_id, episode_id, user_id):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == user_id, Project.deleted_at.is_(None)).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    episode = db.query(Episode).filter(Episode.id == episode_id, Episode.project_id == project_id, Episode.deleted_at.is_(None)).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    return episode
