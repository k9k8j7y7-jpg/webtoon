"""모션 웹툰 라우터 — POST/DELETE/GET /cuts/{id}/motion."""

import logging

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User
from app.storyboard.models import Cut
from app.characters.models import Character, EpisodeCharacter
from app.projects.models import Episode
from app.packets.service import require_packets
from app.jobs import create_job, get_job, run_job_in_background
from app.config import get_settings
from app.workflow.gate import get_gate_number, get_aspect_ratio

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(tags=["motion"])


class MotionRequest(BaseModel):
    subject_ids: list[int]  # character DB id 목록
    intensity: str = "subtle"  # subtle | normal


class MotionSelectRequest(BaseModel):
    candidate_id: str  # "c1" | "c2"


@router.post("/cuts/{cut_id}/motion", status_code=202)
async def create_motion(
    cut_id: str,
    body: MotionRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """컷 이미지 → 모션 영상 생성 시작."""
    cut = db.query(Cut).filter(Cut.cut_id == cut_id).first()
    if not cut:
        raise HTTPException(status_code=404, detail="Cut not found")

    episode = db.query(Episode).filter(Episode.id == cut.episode_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    gate = get_gate_number(episode.gate_status)
    if gate < 5:
        raise HTTPException(status_code=400, detail=f"Current gate is {gate}, motion requires gate 5")

    # 이미지 필수
    if not cut.image_url:
        raise HTTPException(status_code=400, detail="이미지가 없는 컷이에요")

    # 이미 진행 중?
    motion = (cut.spec or {}).get("motion", {})
    if motion.get("status") in ("queued", "running"):
        raise HTTPException(status_code=409, detail="이미 영상을 만들고 있어요")

    # 실사 캐릭터 체크
    spec = cut.spec or {}
    char_ids_in_cut = [c.get("character_id") for c in spec.get("characters", []) if c.get("character_id")]
    if char_ids_in_cut:
        photo_real_count = (
            db.query(Character)
            .join(EpisodeCharacter, EpisodeCharacter.character_id == Character.id)
            .filter(
                EpisodeCharacter.episode_id == cut.episode_id,
                Character.ref_key.in_(char_ids_in_cut),
                Character.is_photo_real == True,
            )
            .count()
        )
        if photo_real_count > 0:
            raise HTTPException(status_code=400, detail="실사 캐릭터 컷은 아직 지원하지 않아요")

    # intensity 검증
    if body.intensity not in ("subtle", "normal"):
        raise HTTPException(status_code=400, detail="intensity는 subtle 또는 normal이에요")

    # 패킷 확인
    require_packets(current_user.id, settings.MOTION_PACKETS, db)

    # 대상 캐릭터 외형 설명 조회 (이름은 Veo 안전필터에 걸리므로 사용 안 함)
    from app.motion.prompts import _describe_subject
    subject_descs = []
    for sid in body.subject_ids:
        char = db.query(Character).filter(Character.id == sid).first()
        if char:
            is_animal = bool(getattr(char, "is_animal", False))
            subject_descs.append(_describe_subject(char.appearance_en, is_animal))

    # 기존 motion이 있으면 파일 삭제 (다시 만들기)
    if motion.get("status") in ("done", "failed"):
        from app.motion.service import _delete_video_files
        _delete_video_files(cut.episode_id, cut_id)
        logger.info("Motion remake: deleted old files for cut=%s", cut_id)

    # spec.motion 초기화
    from sqlalchemy.orm.attributes import flag_modified
    spec = dict(cut.spec)
    job = create_job(total=settings.MOTION_CANDIDATES)
    spec["motion"] = {
        "status": "queued",
        "subject_ids": body.subject_ids,
        "intensity": body.intensity,
        "candidates": [],
        "selected": None,
        "export_path": None,
        "packets_charged": settings.MOTION_PACKETS,
        "job_id": job.job_id,
        "error": None,
        "updated_at": None,
    }
    cut.spec = spec
    flag_modified(cut, "spec")

    # 패킷 선차감
    from app.packets.service import charge_packets
    charge_packets(current_user.id, settings.MOTION_PACKETS, "generation", None, db, f"motion cut={cut_id}")

    db.commit()

    # 백그라운드 실행 — ORM 객체 속성을 변수로 미리 추출 (세션 닫힘 방지)
    bg_episode_id = cut.episode_id
    bg_project_id = episode.project_id
    bg_user_id = current_user.id
    bg_intensity = body.intensity
    bg_job_id = job.job_id
    bg_aspect_ratio = get_aspect_ratio(episode.gate_status)
    bg_image_url = cut.image_url

    from app.motion.service import run_motion_pipeline

    async def _run():
        return await run_motion_pipeline(
            cut_id=cut_id,
            episode_id=bg_episode_id,
            project_id=bg_project_id,
            user_id=bg_user_id,
            subject_descs=subject_descs,
            intensity=bg_intensity,
            job_id=bg_job_id,
            aspect_ratio=bg_aspect_ratio,
            image_url=bg_image_url,
        )

    run_job_in_background(background_tasks, bg_job_id, _run())

    return {"job_id": job.job_id, "packets_charged": settings.MOTION_PACKETS}


@router.get("/cuts/{cut_id}/motion")
async def get_motion(
    cut_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """컷의 모션 상태 조회."""
    cut = db.query(Cut).filter(Cut.cut_id == cut_id).first()
    if not cut:
        raise HTTPException(status_code=404, detail="Cut not found")

    motion = (cut.spec or {}).get("motion")
    if not motion or motion.get("status") == "none":
        return {"status": "none"}

    # job 대기 순번
    position = None
    if motion.get("job_id") and motion.get("status") in ("queued", "running"):
        j = get_job(motion["job_id"])
        if j:
            position = j.progress.get("stage")

    return {
        "status": motion.get("status"),
        "candidates": motion.get("candidates", []),
        "selected": motion.get("selected"),
        "export_path": motion.get("export_path"),
        "job_id": motion.get("job_id"),
        "position": position,
        "error": motion.get("error"),
    }


@router.post("/cuts/{cut_id}/motion/select")
async def select_motion(
    cut_id: str,
    body: MotionSelectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """후보 선택."""
    cut = db.query(Cut).filter(Cut.cut_id == cut_id).first()
    if not cut:
        raise HTTPException(status_code=404, detail="Cut not found")

    spec = dict(cut.spec)
    motion = spec.get("motion", {})
    if motion.get("status") != "done":
        raise HTTPException(status_code=400, detail="영상이 아직 준비되지 않았어요")

    candidates = motion.get("candidates", [])
    selected = None
    for c in candidates:
        if c["id"] == body.candidate_id:
            selected = c
            break
    if not selected:
        raise HTTPException(status_code=400, detail="후보를 찾을 수 없어요")

    motion["selected"] = body.candidate_id
    spec["motion"] = motion

    from sqlalchemy.orm.attributes import flag_modified
    cut.spec = spec
    flag_modified(cut, "spec")
    db.commit()

    # export mp4 생성 (말풍선 합성)
    from app.motion.service import generate_export_mp4
    export_path = generate_export_mp4(cut_id, cut.episode_id)

    return {"ok": True, "selected": body.candidate_id, "video_url": selected.get("path"), "export_path": export_path}


@router.delete("/cuts/{cut_id}/motion")
async def delete_motion(
    cut_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """모션 삭제 (이미지는 유지)."""
    cut = db.query(Cut).filter(Cut.cut_id == cut_id).first()
    if not cut:
        raise HTTPException(status_code=404, detail="Cut not found")

    spec = dict(cut.spec)
    motion = spec.get("motion")
    if not motion or motion.get("status") == "none":
        return {"ok": True, "deleted": 0}

    # 파일 삭제
    from app.motion.service import _delete_video_files
    deleted = _delete_video_files(cut.episode_id, cut_id)

    # spec 초기화
    spec["motion"] = {"status": "none"}
    from sqlalchemy.orm.attributes import flag_modified
    cut.spec = spec
    flag_modified(cut, "spec")
    db.commit()

    logger.info("Motion deleted: cut=%s, files=%d", cut_id, deleted)
    return {"ok": True, "deleted": deleted}


@router.get("/cuts/{cut_id}/motion/export")
async def export_motion(
    cut_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """선택된 모션 export mp4 (말풍선 합성) 다운로드 URL 반환. 없으면 생성."""
    cut = db.query(Cut).filter(Cut.cut_id == cut_id).first()
    if not cut:
        raise HTTPException(status_code=404, detail="Cut not found")

    motion = (cut.spec or {}).get("motion", {})
    selected_id = motion.get("selected")
    if not selected_id:
        raise HTTPException(status_code=400, detail="선택된 영상이 없어요")

    # export_path가 있으면 바로 반환
    export_path = motion.get("export_path")
    if export_path:
        return {"video_url": export_path}

    # 없으면 생성
    from app.motion.service import generate_export_mp4
    export_path = generate_export_mp4(cut_id, cut.episode_id)
    if export_path:
        return {"video_url": export_path}

    # 대사 없으면 원본 mp4
    for c in motion.get("candidates", []):
        if c["id"] == selected_id and c.get("path"):
            return {"video_url": c["path"]}

    raise HTTPException(status_code=404, detail="영상 파일을 찾을 수 없어요")


# ── 릴스 영상 ────────────────────────────────────────────────

@router.post("/projects/{project_id}/episodes/{episode_id}/reel", status_code=202)
async def create_reel(
    project_id: int,
    episode_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """릴스 영상(컷 이어붙이기 9:16 MP4) 생성."""
    episode = db.query(Episode).filter(
        Episode.id == episode_id, Episode.project_id == project_id,
    ).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    gate = get_gate_number(episode.gate_status)
    if gate < 5:
        raise HTTPException(status_code=400, detail=f"Current gate is {gate}, reel requires gate 5")

    # 이미지 있는 컷 확인
    cut_count = db.query(Cut).filter(
        Cut.episode_id == episode_id, Cut.image_url.isnot(None),
    ).count()
    if cut_count == 0:
        raise HTTPException(status_code=400, detail="이미지가 있는 컷이 없어요")

    # 이미 진행 중?
    gs = episode.gate_status or {}
    reel = gs.get("reel", {})
    if reel.get("status") in ("queued", "running"):
        raise HTTPException(status_code=409, detail="이미 릴스를 만들고 있어요")

    # 패킷 확인 + 차감
    require_packets(current_user.id, 1, db)
    from app.packets.service import charge_packets
    charge_packets(current_user.id, 1, "generation", None, db, f"reel ep={episode_id}")

    # gate_status.reel 초기화
    from sqlalchemy.orm.attributes import flag_modified
    job = create_job(total=cut_count + 1)
    gs["reel"] = {"status": "queued", "job_id": job.job_id}
    episode.gate_status = gs
    flag_modified(episode, "gate_status")
    db.commit()

    # BackgroundTasks — ORM 객체 대신 id만
    bg_episode_id = episode_id
    bg_project_id = project_id
    bg_user_id = current_user.id
    bg_nickname = current_user.nickname or "작가"
    bg_job_id = job.job_id

    from app.motion.reel import generate_reel

    async def _run():
        return await generate_reel(
            episode_id=bg_episode_id,
            project_id=bg_project_id,
            user_id=bg_user_id,
            nickname=bg_nickname,
            job_id=bg_job_id,
        )

    run_job_in_background(background_tasks, bg_job_id, _run())
    return {"job_id": job.job_id, "cut_count": cut_count, "packets_charged": 1}


@router.get("/projects/{project_id}/episodes/{episode_id}/reel")
async def get_reel(
    project_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """릴스 상태·URL 조회."""
    episode = db.query(Episode).filter(
        Episode.id == episode_id, Episode.project_id == project_id,
    ).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    gs = episode.gate_status or {}
    reel = gs.get("reel")
    if not reel:
        return {"status": "none"}

    # stale 판정
    from app.motion.reel import _compute_source_hash
    cuts = db.query(Cut).filter(
        Cut.episode_id == episode_id, Cut.image_url.isnot(None),
    ).order_by(Cut.cut_number).all()
    cut_data = []
    for c in cuts:
        spec = c.spec or {}
        motion = spec.get("motion", {})
        cut_data.append({
            "image_url": c.image_url,
            "motion": motion,
        })
    current_hash = _compute_source_hash(cut_data)
    is_stale = reel.get("source_hash") and reel["source_hash"] != current_hash

    return {
        "status": reel.get("status"),
        "path": reel.get("path"),
        "version": reel.get("version"),
        "cut_count": reel.get("cut_count"),
        "duration_sec": reel.get("duration_sec"),
        "size_kb": reel.get("size_kb"),
        "is_stale": is_stale,
        "job_id": reel.get("job_id"),
        "error": reel.get("error"),
    }


@router.delete("/projects/{project_id}/episodes/{episode_id}/reel")
async def delete_reel(
    project_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """릴스 삭제."""
    episode = db.query(Episode).filter(
        Episode.id == episode_id, Episode.project_id == project_id,
    ).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    gs = dict(episode.gate_status or {})
    reel = gs.get("reel", {})
    path = reel.get("path")

    # 파일 삭제
    if path:
        local = Path(LOCAL_STORAGE_DIR) / path.replace("/storage/", "")
        if local.exists():
            local.unlink()

    gs["reel"] = {"status": "none"}
    from sqlalchemy.orm.attributes import flag_modified
    episode.gate_status = gs
    flag_modified(episode, "gate_status")
    db.commit()

    return {"ok": True}
