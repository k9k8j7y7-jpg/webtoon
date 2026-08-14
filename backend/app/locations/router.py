"""게이트 3 — 장소 엔드포인트. API-Spec 5장."""

import re

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User
from app.projects.models import Project, Episode
from app.locations.models import Location
from app.locations.service import generate_location_images
from app.jobs import create_job, run_job_in_background
from app.workflow.gate import get_gate_number
from app.styles.models import Style, STYLE_PRESETS

router = APIRouter(tags=["gate3-locations"])


class LocationsGenerateRequest(BaseModel):
    locations: list[dict] | None = None  # 사용자가 편집한 장소 목록 (없으면 대본에서 추출)


class LocationUpdateRequest(BaseModel):
    name: str | None = None
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
    if gate != 3:
        raise HTTPException(status_code=400, detail=f"Current gate is {gate}, locations require gate 3")

    # 사용자 확정 목록이 있으면 사용, 없으면 대본에서 추출
    if body and body.locations:
        locations_data = body.locations
    else:
        script_data = (episode.script or {}).get("script", {})
        locations_data = script_data.get("locations", [])

    if not locations_data:
        raise HTTPException(status_code=400, detail="No locations found")

    style = db.query(Style).filter(Style.episode_id == episode_id).first()
    style_prompt = style.prompt_snippet if style else STYLE_PRESETS["korean_webtoon"]["prompt"]
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
        "status": location.status,
        "images": [{"url": img.image_url, "seed": img.seed} for img in location.images],
    }


@router.put("/locations/{location_id}")
async def update_location(
    location_id: int,
    body: LocationUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """장소 분위기(mood_notes) 수정. 이름 변경은 이미지가 있으면 차단(수정 7)."""
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    # 수정 7: 이미지가 있는 장소의 이름(정체성) 변경 차단
    if body.name and body.name != location.name and len(location.images) > 0:
        raise HTTPException(
            status_code=400,
            detail="장소를 다른 곳으로 바꾸려면 대본에서 수정해주세요. 분위기(무드) 조정만 여기서 가능합니다.",
        )

    if body.name is not None:
        location.name = body.name
    if body.mood_notes is not None:
        location.mood_notes = body.mood_notes or None

    db.commit()
    return {
        "id": location.id,
        "ref_key": location.ref_key,
        "name": location.name,
        "mood_notes": location.mood_notes,
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
            "mood_notes": l.mood_notes,
            "status": l.status,
            "image_count": len(l.images),
        }
        for l in locations
    ]


def _get_episode_for_user(db, project_id, episode_id, user_id):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == user_id, Project.deleted_at.is_(None)).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    episode = db.query(Episode).filter(Episode.id == episode_id, Episode.project_id == project_id, Episode.deleted_at.is_(None)).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    return episode
