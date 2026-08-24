"""게이트 3 — 캐릭터 엔드포인트. API-Spec 5장."""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func, text

from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User
from app.projects.models import Project, Episode
from app.characters.models import Character, CharacterImage, CharacterOutfit, EpisodeCharacter
from app.characters.service import generate_character_sheets, build_character_description
from app.jobs import create_job, run_job_in_background
from app.workflow.gate import get_gate_number
from app.workflow.service import invalidate_asset
from app.styles.models import Style, STYLE_PRESETS
from app.storyboard.models import CutAssetRef

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
    style_preset_key = style.preset_key if style else "korean_webtoon"

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
            style_preset_key=style_preset_key,
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

    ep_count = (
        db.query(sa_func.count(EpisodeCharacter.episode_id))
        .filter(EpisodeCharacter.character_id == character_id)
        .scalar()
    )

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
        "user_id": character.user_id,
        "episode_count": ep_count,
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


# ── P3: 프로젝트 캐릭터 목록 (집계형 1콜) ───────────────────────

@router.get("/projects/{project_id}/characters")
async def list_project_characters(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """프로젝트 소속 캐릭터 전체 — 대표이미지 + 연결 에피소드 수 포함."""
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == current_user.id, Project.deleted_at.is_(None))
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    characters = (
        db.query(Character)
        .filter(Character.project_id == project_id)
        .all()
    )

    result = []
    for c in characters:
        # 연결 에피소드 수
        ep_count = (
            db.query(sa_func.count(EpisodeCharacter.episode_id))
            .filter(EpisodeCharacter.character_id == c.id)
            .scalar()
        )
        # 대표 이미지 (front 우선)
        front_img = next((img for img in c.images if img.type == "front"), None)
        front_url = front_img.image_url if front_img else (c.images[0].image_url if c.images else None)

        result.append({
            "id": c.id,
            "ref_key": c.ref_key,
            "name": c.name,
            "style": c.style,
            "status": c.status,
            "user_id": c.user_id,
            "front_image_url": front_url,
            "episode_count": ep_count,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })

    return result


# ── P3: 불러오기(연결) ─────────────────────────────────────────

class LinkCharacterRequest(BaseModel):
    character_id: int


@router.post("/projects/{project_id}/episodes/{episode_id}/characters/link")
async def link_character(
    project_id: int,
    episode_id: int,
    body: LinkCharacterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """기존 캐릭터를 에피소드에 연결 (생성/복제 없음)."""
    _get_episode_for_user(db, project_id, episode_id, current_user.id)

    character = db.query(Character).filter(Character.id == body.character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    # 같은 프로젝트 또는 user_id 승격 캐릭터만 허용
    if character.project_id != project_id and character.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="이 캐릭터에 접근할 수 없습니다")

    # 중복 연결 검사 (멱등)
    existing = (
        db.query(EpisodeCharacter)
        .filter(EpisodeCharacter.episode_id == episode_id, EpisodeCharacter.character_id == body.character_id)
        .first()
    )
    if existing:
        return {"linked": True, "character_id": body.character_id, "already_linked": True}

    # ref_key 중복 검사: 대상 에피소드에 연결된 전체 캐릭터의 ref_key 대조
    conflicting = (
        db.query(Character.ref_key)
        .join(EpisodeCharacter, EpisodeCharacter.character_id == Character.id)
        .filter(EpisodeCharacter.episode_id == episode_id, Character.ref_key == character.ref_key)
        .first()
    )
    if conflicting:
        raise HTTPException(
            status_code=409,
            detail=f"이 에피소드에 이미 같은 ref_key '{character.ref_key}'를 가진 캐릭터가 있습니다",
        )

    ec = EpisodeCharacter(episode_id=episode_id, character_id=body.character_id)
    db.add(ec)
    db.commit()

    return {"linked": True, "character_id": body.character_id, "already_linked": False}


# ── P3: 연결 해제 ──────────────────────────────────────────────

@router.delete("/projects/{project_id}/episodes/{episode_id}/characters/{character_id}/link")
async def unlink_character(
    project_id: int,
    episode_id: int,
    character_id: int,
    force: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """에피소드에서 캐릭터 연결 해제 (본체 유지).

    참조 컷이 있으면 409 + 경고 반환. ?force=true로 강제 해제.
    """
    _get_episode_for_user(db, project_id, episode_id, current_user.id)

    ec = (
        db.query(EpisodeCharacter)
        .filter(EpisodeCharacter.episode_id == episode_id, EpisodeCharacter.character_id == character_id)
        .first()
    )
    if not ec:
        raise HTTPException(status_code=404, detail="연결을 찾을 수 없습니다")

    # cut_asset_refs에서 이 에피소드의 컷이 이 캐릭터를 참조하는지 조회
    character = db.query(Character).filter(Character.id == character_id).first()
    referencing_cuts = []
    if character:
        refs = (
            db.query(CutAssetRef.cut_id)
            .filter(
                CutAssetRef.episode_id == episode_id,
                CutAssetRef.asset_type == "character",
                CutAssetRef.asset_ref == character.ref_key,
            )
            .all()
        )
        referencing_cuts = [r.cut_id for r in refs]

    if referencing_cuts and not force:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "이 캐릭터를 참조하는 컷이 있습니다. 연결을 해제하려면 force=true를 사용하세요.",
                "referencing_cuts": referencing_cuts,
            },
        )

    db.delete(ec)
    db.commit()

    return {"unlinked": True, "character_id": character_id}


# ── P3: 캐릭터 삭제 (보수적) ───────────────────────────────────

@router.delete("/characters/{character_id}")
async def delete_character(
    character_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """캐릭터 삭제. episode_characters 연결 0건인 경우에만 허용."""
    character = db.query(Character).filter(Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    # 연결 에피소드 확인
    linked_episodes = (
        db.query(EpisodeCharacter.episode_id)
        .filter(EpisodeCharacter.character_id == character_id)
        .all()
    )
    if linked_episodes:
        ep_ids = [e.episode_id for e in linked_episodes]
        raise HTTPException(
            status_code=409,
            detail={
                "message": "에피소드에 연결된 캐릭터는 삭제할 수 없습니다. 먼저 연결을 해제해주세요.",
                "linked_episode_ids": ep_ids,
            },
        )

    # 스토리지 파일 삭제
    import os
    from app.storage import LOCAL_STORAGE_DIR
    for img in character.images:
        if img.image_url and img.image_url.startswith("/storage/"):
            file_path = os.path.join(LOCAL_STORAGE_DIR, img.image_url[len("/storage/"):])
            if os.path.isfile(file_path):
                os.remove(file_path)
    for outfit in character.outfits:
        for oi in outfit.images:
            if oi.image_url and oi.image_url.startswith("/storage/"):
                file_path = os.path.join(LOCAL_STORAGE_DIR, oi.image_url[len("/storage/"):])
                if os.path.isfile(file_path):
                    os.remove(file_path)

    # DB 연쇄 삭제 (raw SQL — ORM eager-loaded 관계와 StaleDataError 방지)
    for outfit in character.outfits:
        db.execute(text("DELETE FROM outfit_images WHERE outfit_id = :oid"), {"oid": outfit.id})
    db.execute(text("DELETE FROM character_outfits WHERE character_id = :cid"), {"cid": character_id})
    db.execute(text("DELETE FROM character_images WHERE character_id = :cid"), {"cid": character_id})
    db.execute(text("DELETE FROM characters WHERE id = :cid"), {"cid": character_id})
    db.commit()

    return {"deleted": True, "character_id": character_id}


# ── P3: 라이브러리 승격/해제 ───────────────────────────────────

@router.post("/characters/{character_id}/promote")
async def promote_character(
    character_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """캐릭터를 내 라이브러리에 승격 (user_id 설정)."""
    character = db.query(Character).filter(Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    character.user_id = current_user.id
    db.commit()
    return {"promoted": True, "character_id": character_id, "user_id": current_user.id}


@router.post("/characters/{character_id}/demote")
async def demote_character(
    character_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """캐릭터를 내 라이브러리에서 해제 (user_id 제거)."""
    character = db.query(Character).filter(Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    if character.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="자신이 승격한 캐릭터만 해제할 수 있습니다")
    character.user_id = None
    db.commit()
    return {"demoted": True, "character_id": character_id}


# ── P3: 내 라이브러리 목록 ─────────────────────────────────────

@router.get("/users/me/characters")
async def list_my_library_characters(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """user_id로 승격된 내 라이브러리 캐릭터 목록."""
    characters = (
        db.query(Character)
        .filter(Character.user_id == current_user.id)
        .all()
    )
    result = []
    for c in characters:
        ep_count = (
            db.query(sa_func.count(EpisodeCharacter.episode_id))
            .filter(EpisodeCharacter.character_id == c.id)
            .scalar()
        )
        front_img = next((img for img in c.images if img.type == "front"), None)
        front_url = front_img.image_url if front_img else (c.images[0].image_url if c.images else None)

        result.append({
            "id": c.id,
            "ref_key": c.ref_key,
            "name": c.name,
            "style": c.style,
            "project_id": c.project_id,
            "status": c.status,
            "front_image_url": front_url,
            "episode_count": ep_count,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })

    return result


# ── P3: 재생성 경고 데이터 ─────────────────────────────────────

@router.get("/characters/{character_id}/link-info")
async def get_character_link_info(
    character_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """캐릭터 연결 정보 — 재생성 경고 표시용."""
    character = db.query(Character).filter(Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    linked = (
        db.query(EpisodeCharacter.episode_id)
        .filter(EpisodeCharacter.character_id == character_id)
        .all()
    )

    return {
        "character_id": character_id,
        "episode_count": len(linked),
        "linked_episode_ids": [e.episode_id for e in linked],
    }


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
