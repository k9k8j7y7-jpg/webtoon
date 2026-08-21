"""게이트 3 — 캐릭터 엔드포인트. API-Spec 5장."""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User
from app.projects.models import Project, Episode
from app.characters.models import Character, EpisodeCharacter
from app.characters.service import generate_character_sheets, build_character_description
from app.jobs import create_job, run_job_in_background
from app.workflow.gate import get_gate_number
from app.workflow.service import invalidate_asset
from app.styles.models import Style, STYLE_PRESETS

router = APIRouter(tags=["gate3-characters"])


@router.post("/projects/{project_id}/episodes/{episode_id}/characters", status_code=202)
async def create_characters(
    project_id: int,
    episode_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """대본 인물 → 캐릭터 시트 생성. 비동기(202 + job_id)."""
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)

    gate = get_gate_number(episode.gate_status)
    if gate != 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Current gate is {gate}, characters require gate 3",
        )

    # 기획에서 캐릭터 목록 추출
    planning = (episode.script or {}).get("planning", {})
    characters_data = planning.get("characters", [])
    if not characters_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No characters found in planning data",
        )

    # 스타일 프롬프트 (에피소드에 선택된 스타일 사용, 미선택 시 기본값)
    style = db.query(Style).filter(Style.episode_id == episode_id).first()
    style_prompt = style.prompt_snippet if style else STYLE_PRESETS["korean_webtoon"]["prompt"]

    # Job 생성 + 백그라운드 실행
    job = create_job(total=len(characters_data))
    ref_keys = [c.get("ref_key", "") for c in characters_data]

    run_job_in_background(
        background_tasks,
        job.job_id,
        generate_character_sheets(
            episode_id=episode_id,
            characters_data=characters_data,
            style_prompt=style_prompt,
            job_id=job.job_id,
            db=db,
            project_id=project_id,
        ),
    )

    return {"job_id": job.job_id, "characters": ref_keys}


@router.get("/characters/{character_id}")
async def get_character(
    character_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    character = db.query(Character).filter(Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    return {
        "id": character.id,
        "ref_key": character.ref_key,
        "name": character.name,
        "description": character.description,
        "gender": character.gender,
        "age_group": character.age_group,
        "hair_style": character.hair_style,
        "hair_color": character.hair_color,
        "body_type": character.body_type,
        "mood": character.mood,
        "detail_notes": character.detail_notes,
        "status": character.status,
        "images": [
            {
                "type": img.type,
                "label": img.label,
                "url": img.image_url,
                "seed": img.seed,
            }
            for img in character.images
        ],
        "outfits": [
            {
                "outfit_key": o.outfit_key,
                "label": o.label,
                "is_default": o.is_default,
                "images": [{"url": oi.image_url} for oi in o.images],
            }
            for o in character.outfits
        ],
    }


@router.get("/projects/{project_id}/episodes/{episode_id}/characters")
async def list_characters(
    project_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_episode_for_user(db, project_id, episode_id, current_user.id)
    characters = (
        db.query(Character)
        .join(EpisodeCharacter, EpisodeCharacter.character_id == Character.id)
        .filter(EpisodeCharacter.episode_id == episode_id)
        .all()
    )
    return [
        {
            "id": c.id,
            "ref_key": c.ref_key,
            "name": c.name,
            "status": c.status,
            "image_count": len(c.images),
        }
        for c in characters
    ]


class CharacterUpdateRequest(BaseModel):
    gender: str | None = None
    age_group: str | None = None
    hair_style: str | None = None
    hair_color: str | None = None
    body_type: str | None = None
    mood: str | None = None
    detail_notes: str | None = None


@router.put("/characters/{character_id}")
async def update_character(
    character_id: int,
    body: CharacterUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """캐릭터 조건 수정. 이미지 재생성은 별도."""
    character = db.query(Character).filter(Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    for field in ["gender", "age_group", "hair_style", "hair_color", "body_type", "mood", "detail_notes"]:
        val = getattr(body, field)
        if val is not None:
            setattr(character, field, val)

    # 구조화 필드로 description 자동 재조립
    character.description = build_character_description(character)
    db.commit()

    return {
        "id": character.id,
        "name": character.name,
        "description": character.description,
        "gender": character.gender,
        "age_group": character.age_group,
        "hair_style": character.hair_style,
        "hair_color": character.hair_color,
        "body_type": character.body_type,
        "mood": character.mood,
        "detail_notes": character.detail_notes,
    }


@router.post("/characters/{character_id}/regenerate", status_code=202)
async def regenerate_character(
    character_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """캐릭터 시트 재생성. 기존 이미지는 유지(stale)."""
    character = db.query(Character).filter(Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    # 관련 컷 무효화 (State-Model 3.4)
    inv = invalidate_asset(character.episode_id, "character", character.ref_key, db)
    db.commit()

    style = db.query(Style).filter(Style.episode_id == character.episode_id).first()
    style_prompt = style.prompt_snippet if style else STYLE_PRESETS["korean_webtoon"]["prompt"]
    job = create_job(total=1)

    run_job_in_background(
        background_tasks,
        job.job_id,
        generate_character_sheets(
            episode_id=character.episode_id,
            characters_data=[{
                "ref_key": character.ref_key,
                "name": character.name,
                "description": character.description,
            }],
            style_prompt=style_prompt,
            job_id=job.job_id,
            db=db,
            project_id=character.project_id,
        ),
    )

    return {"job_id": job.job_id, "cuts_invalidated": inv["cuts_invalidated"]}


def _get_episode_for_user(db: Session, project_id: int, episode_id: int, user_id: int) -> Episode:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == user_id, Project.deleted_at.is_(None))
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    episode = (
        db.query(Episode)
        .filter(Episode.id == episode_id, Episode.project_id == project_id, Episode.deleted_at.is_(None))
        .first()
    )
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    return episode
