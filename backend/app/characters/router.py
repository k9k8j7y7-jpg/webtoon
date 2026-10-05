"""게이트 3 — 캐릭터 엔드포인트. API-Spec 5장."""

import json

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func, text

from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User
from app.projects.models import Project, Episode
from app.characters.models import Character, CharacterImage, CharacterOutfit, EpisodeCharacter
from app.characters.service import generate_character_sheets, build_character_description, build_appearance_en, extract_appearance_from_photos
from app.storage import upload_image
from app.jobs import create_job, run_job_in_background
from app.workflow.gate import get_gate_number
from app.workflow.service import invalidate_asset
from app.styles.models import Style, STYLE_PRESETS
from app.storyboard.models import CutAssetRef
from app.packets.service import require_packets
from app.story.service import _is_animal_character

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

    # 패킷 사전 확인: 생성 대상 캐릭터 수 × 2패킷 (피커 연결·실사 캐릭터는 스킵)
    gen_count = 0
    for cd in characters_data:
        rk = cd.get("ref_key", "")
        existing = (
            db.query(Character)
            .join(EpisodeCharacter, EpisodeCharacter.character_id == Character.id)
            .filter(EpisodeCharacter.episode_id == episode_id, Character.ref_key == rk)
            .first()
        )
        if existing and (existing.episode_id != episode_id or existing.is_photo_real):
            continue
        gen_count += 1
    if gen_count > 0:
        require_packets(current_user.id, gen_count * 2, db)

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

    return _character_detail(character, ep_count, db)


def _planning_character(episode: Episode | None, ref_key: str) -> dict | None:
    """에피소드 기획(planning.characters)에서 ref_key로 인물을 찾는다."""
    if not episode:
        return None
    for pc in ((episode.script or {}).get("planning") or {}).get("characters") or []:
        if pc.get("ref_key") == ref_key:
            return pc
    return None


def _is_animal_for(character: Character, db: Session) -> bool:
    """동물 캐릭터 판정 — 게이트1 판정 규칙(_is_animal_character)과 통일.

    기획 인물의 gender가 "기타"가 아니면(남/여) 동물 아님.
    """
    episode = db.query(Episode).filter(Episode.id == character.episode_id).first()
    pc = _planning_character(episode, character.ref_key)
    if pc:
        gender = (pc.get("gender") or "").strip()
        if gender and gender != "기타":
            return False
        return _is_animal_character(pc)
    return _is_animal_character({"name": character.name, "description": character.description})


def _character_detail(character: Character, ep_count: int, db: Session) -> dict:
    return {
        "id": character.id,
        "episode_id": character.episode_id,
        "ref_key": character.ref_key,
        "name": character.name,
        "description": character.description,
        "appearance_en": character.appearance_en,
        "reference_photos": character.reference_photos,
        "is_photo_real": character.is_photo_real,
        "consent_given": character.consent_given,
        "is_animal": _is_animal_for(character, db),
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
            "is_photo_real": c.is_photo_real,
            "image_count": len(c.images),
        }
        for c in characters
    ]


class CharacterStubRequest(BaseModel):
    ref_key: str


@router.post("/projects/{project_id}/episodes/{episode_id}/characters/stub")
async def create_character_stub(
    project_id: int,
    episode_id: int,
    body: CharacterStubRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """대본 인물의 캐릭터 레코드만 만든다(시트 생성 없음, 0패킷) — 실사 캐릭터 추가용.

    이미 이 에피소드에 연결된 같은 ref_key 캐릭터가 있으면 그대로 반환.
    """
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)
    gate = get_gate_number(episode.gate_status)
    if gate != 3:
        raise HTTPException(status_code=400, detail=f"Current gate is {gate}, characters require gate 3")

    pc = _planning_character(episode, body.ref_key)
    if not pc:
        raise HTTPException(status_code=404, detail="대본 등장인물에 없는 캐릭터입니다")

    character = (
        db.query(Character)
        .join(EpisodeCharacter, EpisodeCharacter.character_id == Character.id)
        .filter(EpisodeCharacter.episode_id == episode_id, Character.ref_key == body.ref_key)
        .first()
    )
    if not character:
        # 이전 unlink로 EC 없이 남은 고아 레코드 재활용
        character = (
            db.query(Character)
            .filter(Character.episode_id == episode_id, Character.ref_key == body.ref_key)
            .first()
        )
        if not character:
            style = db.query(Style).filter(Style.episode_id == episode_id).first()
            character = Character(
                ref_key=body.ref_key,
                episode_id=episode_id,
                project_id=project_id,
                name=pc.get("name", ""),
                description=pc.get("description", ""),
                style=style.preset_key if style else None,
                status="draft",
            )
            db.add(character)
            db.flush()
            db.add(CharacterOutfit(
                character_id=character.id, outfit_key="default", label="기본 의상", is_default=True,
            ))
        db.add(EpisodeCharacter(episode_id=episode_id, character_id=character.id))
        db.commit()
        db.refresh(character)

    ep_count = (
        db.query(sa_func.count(EpisodeCharacter.episode_id))
        .filter(EpisodeCharacter.character_id == character.id)
        .scalar()
    )
    return _character_detail(character, ep_count, db)


class CharacterUpdateRequest(BaseModel):
    name: str | None = None
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

    # name은 외형 무관 — appearance_en 재생성 불필요
    if body.name is not None:
        character.name = body.name.strip()

    appearance_fields = ["gender", "age_group", "hair_style", "hair_color", "body_type", "mood", "detail_notes"]
    appearance_changed = False
    for field in appearance_fields:
        val = getattr(body, field)
        if val is not None:
            setattr(character, field, val)
            appearance_changed = True

    if appearance_changed:
        # 구조화 필드로 description 자동 재조립
        character.description = build_character_description(character)
        # appearance_en 재생성 (영문 외형 명세 — 컷 프롬프트 주입용)
        character.appearance_en = await build_appearance_en(character)

    db.commit()

    return {
        "id": character.id,
        "name": character.name,
        "description": character.description,
        "appearance_en": character.appearance_en,
        "gender": character.gender,
        "age_group": character.age_group,
        "hair_style": character.hair_style,
        "hair_color": character.hair_color,
        "body_type": character.body_type,
        "mood": character.mood,
        "detail_notes": character.detail_notes,
    }


class RegenerateRequest(BaseModel):
    use_photo_reference: bool = False


@router.post("/characters/{character_id}/regenerate", status_code=202)
async def regenerate_character(
    character_id: int,
    body: RegenerateRequest | None = None,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """캐릭터 시트 재생성. 기존 이미지는 유지(stale)."""
    character = db.query(Character).filter(Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    # 실사 캐릭터는 시트 재생성 불가
    if character.is_photo_real:
        raise HTTPException(
            status_code=400,
            detail="실사 캐릭터는 시트를 생성하지 않습니다. [사진 교체]를 사용하세요.",
        )

    use_photo = (body.use_photo_reference if body else False) and bool(character.reference_photos)

    # 패킷 사전 확인: 캐릭터 시트 재생성 = 2패킷
    require_packets(current_user.id, 2, db)

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
            use_photo_reference=use_photo,
        ),
    )

    return {"job_id": job.job_id, "cuts_invalidated": inv["cuts_invalidated"]}


# ── 1-1c: 캐릭터 실사진 업로드 + 외형 추출 ─────────────────────

@router.post("/characters/{character_id}/photos")
async def upload_character_photos(
    character_id: int,
    files: list[UploadFile] = File(...),
    is_animal: bool = Query(default=False),
    is_photo_real: bool = Query(default=False),
    consent_given: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """캐릭터 실사진 1~3장 업로드 + 비전 외형 추출.

    is_photo_real=true + consent_given=true일 때 실사 캐릭터로 설정.
    Returns: 업로드 URL 배열 + 추출된 구조화 필드 JSON.
    """
    character = db.query(Character).filter(Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    # 실사 캐릭터 동의 검증
    if is_photo_real and not consent_given:
        raise HTTPException(status_code=400, detail="초상권 동의가 필요합니다")

    if len(files) > 3:
        raise HTTPException(status_code=400, detail="최대 3장까지 가능합니다")

    from app.image_util import validate_and_process

    # 파일 검증 + 처리
    photo_bytes_list: list[bytes] = []
    urls: list[str] = []
    for i, file in enumerate(files):
        raw = await file.read()
        try:
            processed, mime = validate_and_process(
                raw,
                original_content_type=file.content_type or "",
                original_filename=file.filename or "",
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"파일 {i+1}: {e}")
        photo_bytes_list.append(processed)

        url = upload_image(
            image_bytes=processed,
            path_prefix=f"characters/{character_id}/photos",
            filename=f"ref_{i}.jpg",
            mime_type=mime,
        )
        urls.append(url)

    # DB에 URL 배열 + 실사 플래그 저장
    character.reference_photos = urls
    if is_photo_real:
        character.is_photo_real = True
        character.consent_given = True
    db.commit()

    # 비전 외형 추출
    extracted = await extract_appearance_from_photos(photo_bytes_list, is_animal=is_animal)

    # 동물: appearance_en을 바로 DB에 저장
    if is_animal and extracted.get("appearance_en"):
        character.appearance_en = extracted["appearance_en"]
        db.commit()

    # 실사 캐릭터: appearance_en 저장 (얼굴·체형 기술)
    if is_photo_real and extracted.get("appearance_en"):
        character.appearance_en = extracted["appearance_en"]
        db.commit()

    return {
        "id": character.id,
        "reference_photos": urls,
        "is_photo_real": character.is_photo_real,
        "consent_given": character.consent_given,
        "extracted": extracted,
    }


@router.post("/characters/{character_id}/photos/replace")
async def replace_character_photos(
    character_id: int,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """실사 캐릭터 사진 교체 (기존 사진 대체)."""
    character = db.query(Character).filter(Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    if not character.is_photo_real:
        raise HTTPException(status_code=400, detail="실사 캐릭터만 사진 교체가 가능합니다")

    if len(files) > 3:
        raise HTTPException(status_code=400, detail="최대 3장까지 가능합니다")

    from app.image_util import validate_and_process

    urls: list[str] = []
    photo_bytes_list: list[bytes] = []
    for i, file in enumerate(files):
        raw = await file.read()
        try:
            processed, mime = validate_and_process(
                raw,
                original_content_type=file.content_type or "",
                original_filename=file.filename or "",
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"파일 {i+1}: {e}")
        photo_bytes_list.append(processed)

        url = upload_image(
            image_bytes=processed,
            path_prefix=f"characters/{character_id}/photos",
            filename=f"ref_{i}.jpg",
            mime_type=mime,
        )
        urls.append(url)

    character.reference_photos = urls
    db.commit()

    # 외형 재추출
    extracted = await extract_appearance_from_photos(photo_bytes_list)
    if extracted.get("appearance_en"):
        character.appearance_en = extracted["appearance_en"]
        db.commit()

    # 관련 컷 무효화
    inv = invalidate_asset(character.episode_id, "character", character.ref_key, db)
    db.commit()

    return {
        "id": character.id,
        "reference_photos": urls,
        "appearance_en": character.appearance_en,
        "cuts_invalidated": inv["cuts_invalidated"],
    }


@router.delete("/characters/{character_id}/photos")
async def delete_character_photos(
    character_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """캐릭터 실사진 삭제."""
    character = db.query(Character).filter(Character.id == character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    character.reference_photos = None
    db.commit()

    return {"id": character.id, "reference_photos": None}


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
            "is_photo_real": c.is_photo_real,
            "front_image_url": front_url,
            "episode_count": ep_count,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })

    return result


# ── P3: 불러오기(연결) ─────────────────────────────────────────

class LinkCharacterRequest(BaseModel):
    character_id: int
    override_ref_key: str | None = None  # 대본 ref_key 매핑용


def _get_unmatched_script_ref_keys(episode, episode_id, db) -> list[str]:
    """대본에서 참조하는 character_id 중 에피소드 캐릭터에 없는 것들을 반환."""
    script_data = (episode.script or {}).get("script", {})
    script_char_ids = set()
    for scene in script_data.get("scenes", []):
        for cut in scene.get("cuts", []):
            for ch in cut.get("characters", []):
                cid = ch.get("character_id")
                if cid:
                    script_char_ids.add(cid)
    if not script_char_ids:
        return []
    linked_refs = {
        c.ref_key for c in
        db.query(Character.ref_key)
        .join(EpisodeCharacter, EpisodeCharacter.character_id == Character.id)
        .filter(EpisodeCharacter.episode_id == episode_id)
        .all()
    }
    return sorted(script_char_ids - linked_refs)


@router.post("/projects/{project_id}/episodes/{episode_id}/characters/link")
async def link_character(
    project_id: int,
    episode_id: int,
    body: LinkCharacterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """기존 캐릭터를 에피소드에 연결.

    override_ref_key가 있으면 에피소드 범위에서 캐릭터의 ref_key를 덮어쓴다
    (원본 라이브러리 캐릭터는 불변 — 에피소드 전용 복제본 생성).
    """
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)

    character = db.query(Character).filter(Character.id == body.character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    # 같은 프로젝트 또는 user_id 승격 캐릭터만 허용
    if character.project_id != project_id and character.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="이 캐릭터에 접근할 수 없습니다")

    # 스타일 불일치 차단 (실사 캐릭터는 스타일 무관 — 스킵)
    if not character.is_photo_real:
        from app.styles.models import Style
        ep_style = db.query(Style).filter(Style.episode_id == episode_id).first()
        if ep_style and character.style and character.style != ep_style.preset_key:
            raise HTTPException(
                status_code=400,
                detail=f"스타일이 다릅니다 (에피소드: {ep_style.preset_key}, 캐릭터: {character.style}). 같은 스타일의 캐릭터만 불러올 수 있습니다.",
            )

    # 중복 연결 검사 (멱등)
    existing = (
        db.query(EpisodeCharacter)
        .filter(EpisodeCharacter.episode_id == episode_id, EpisodeCharacter.character_id == body.character_id)
        .first()
    )
    if existing:
        return {"linked": True, "character_id": body.character_id, "already_linked": True}

    # ref_key 결정: override_ref_key 또는 자동 매핑
    effective_ref_key = body.override_ref_key
    if not effective_ref_key:
        # 대본에서 미매핑 ref_key 계산
        unmatched = _get_unmatched_script_ref_keys(episode, episode_id, db)
        if len(unmatched) == 1:
            effective_ref_key = unmatched[0]
        elif len(unmatched) > 1:
            # 후보 목록 반환 — 프론트에서 선택 후 재요청
            return {
                "linked": False,
                "needs_mapping": True,
                "candidates": unmatched,
                "character_id": body.character_id,
                "character_name": character.name,
                "character_ref_key": character.ref_key,
            }

    # ref_key 덮어쓰기가 필요하면 에피소드 전용 복제본 생성
    actual_char_id = body.character_id
    if effective_ref_key and effective_ref_key != character.ref_key:
        # ref_key 중복 검사 (덮어쓸 키 기준)
        conflicting = (
            db.query(Character.ref_key)
            .join(EpisodeCharacter, EpisodeCharacter.character_id == Character.id)
            .filter(EpisodeCharacter.episode_id == episode_id, Character.ref_key == effective_ref_key)
            .first()
        )
        if conflicting:
            raise HTTPException(
                status_code=409,
                detail=f"이 에피소드에 이미 ref_key '{effective_ref_key}'를 가진 캐릭터가 있습니다",
            )
        # 복제본 생성 (ref_key만 변경, 이미지는 원본 공유)
        from app.characters.models import CharacterImage
        clone = Character(
            episode_id=episode_id,
            project_id=character.project_id,
            ref_key=effective_ref_key,
            name=character.name,
            description=character.description,
            appearance_en=character.appearance_en,
            reference_photos=character.reference_photos,
            is_photo_real=character.is_photo_real,
            consent_given=character.consent_given,
            gender=character.gender,
            age_group=character.age_group,
            hair_style=character.hair_style,
            hair_color=character.hair_color,
            body_type=character.body_type,
            mood=character.mood,
            detail_notes=character.detail_notes,
            style=character.style,
            status=character.status,
        )
        db.add(clone)
        db.flush()  # clone.id 확보

        # 이미지 복제 (URL 공유)
        orig_images = db.query(CharacterImage).filter(CharacterImage.character_id == character.id).all()
        for img in orig_images:
            db.add(CharacterImage(
                character_id=clone.id,
                type=img.type,
                label=img.label,
                image_url=img.image_url,
                seed=img.seed,
            ))

        actual_char_id = clone.id
    else:
        # 원본 ref_key 중복 검사
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

    ec = EpisodeCharacter(episode_id=episode_id, character_id=actual_char_id)
    db.add(ec)
    db.commit()

    return {
        "linked": True,
        "character_id": actual_char_id,
        "already_linked": False,
        "ref_key_mapped": effective_ref_key or character.ref_key,
    }


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
            "is_photo_real": c.is_photo_real,
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


# ── 백필: appearance_en 일괄 생성 ─────────────────────────────

@router.post("/characters/backfill-appearance")
async def backfill_appearance_en(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """appearance_en이 NULL인 캐릭터에 대해 description 기반 초안 생성."""
    from app.adapters.gemini import generate_text, AI_TOKENS_SHORT

    characters = db.query(Character).filter(Character.appearance_en.is_(None)).all()
    results = []

    for c in characters:
        source = c.description or c.name or ""
        if not source.strip():
            results.append({"id": c.id, "name": c.name, "status": "skipped_empty"})
            continue

        try:
            c.appearance_en = await generate_text(
                prompt=(
                    f"Extract ONLY the fixed visual/physical appearance traits from this character description. "
                    f"Output concise English phrases (e.g. 'black horn-rimmed glasses, short black hair, slim build'). "
                    f"Exclude personality, mood, role. Output ONLY the traits, nothing else.\n\n"
                    f"{source}"
                ),
                temperature=0.2,
                max_output_tokens=AI_TOKENS_SHORT,
            )
            c.appearance_en = c.appearance_en.strip().replace("\n", " ")
            results.append({"id": c.id, "name": c.name, "status": "generated", "appearance_en": c.appearance_en})
        except Exception as e:
            results.append({"id": c.id, "name": c.name, "status": "failed", "error": str(e)})

    db.commit()
    return {"total": len(characters), "results": results}


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
