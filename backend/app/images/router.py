"""게이트 5 — 이미지 생성·재생성·대사수정·되돌리기. API-Spec 7장."""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.auth.deps import get_current_user
from app.users.models import User
from app.projects.models import Project, Episode
from app.storyboard.models import Cut
from app.images.service import generate_all_cuts, generate_cut_image
from app.jobs import create_job, run_job_in_background
from app.workflow.gate import get_gate_number
from app.packets.service import require_packets

router = APIRouter(tags=["gate5-images"])


class RegenerateRequest(BaseModel):
    mode: str = "reseed"  # reseed | emotion | pose | outfit
    seed: int | None = None
    params: dict | None = None


@router.post("/projects/{project_id}/episodes/{episode_id}/generate", status_code=202)
async def generate_images(
    project_id: int,
    episode_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """승인된 컷 명세 → 이미지 일괄 생성. 비동기."""
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)

    gate = get_gate_number(episode.gate_status)
    if gate != 5:
        raise HTTPException(status_code=400, detail=f"Current gate is {gate}, generate requires gate 5")

    cuts_count = (
        db.query(Cut)
        .filter(Cut.episode_id == episode_id, Cut.status.in_(["pending", "invalidated", "regenerating"]))
        .count()
    )
    if cuts_count == 0:
        raise HTTPException(status_code=400, detail="No pending cuts to generate")

    # 패킷 사전 확인: 컷 1개 = 1패킷
    require_packets(current_user.id, cuts_count, db)

    job = create_job(total=cuts_count)

    # Background task는 별도 스레드에서 실행되므로 자체 DB 세션 필요
    async def _generate():
        bg_db = SessionLocal()
        try:
            result = await generate_all_cuts(
                episode_id=episode_id,
                project_id=project_id,
                user_id=current_user.id,
                job_id=job.job_id,
                db=bg_db,
            )
            return result
        finally:
            bg_db.close()

    run_job_in_background(background_tasks, job.job_id, _generate())

    return {"job_id": job.job_id, "total_cuts": cuts_count}


@router.post("/cuts/{cut_id}/regenerate", status_code=202)
async def regenerate_cut(
    cut_id: str,
    body: RegenerateRequest | None = None,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """부분 재생성. 컷 하나만 재생성."""
    cut = db.query(Cut).filter(Cut.cut_id == cut_id).first()
    if not cut:
        raise HTTPException(status_code=404, detail="Cut not found")

    episode = db.query(Episode).filter(Episode.id == cut.episode_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    # 패킷 사전 확인: 재생성 1컷 = 1패킷
    require_packets(current_user.id, 1, db)

    # 재생성 파라미터 적용
    if body and body.params:
        spec = dict(cut.spec)
        if body.mode == "emotion" and "emotion" in body.params:
            for char in spec.get("characters", []):
                if "character_id" in body.params:
                    if char.get("character_id") == body.params["character_id"]:
                        char["emotion"] = body.params["emotion"]
                else:
                    char["emotion"] = body.params["emotion"]
            cut.spec = spec
        elif body.mode == "pose" and "pose" in body.params:
            for char in spec.get("characters", []):
                if "character_id" in body.params:
                    if char.get("character_id") == body.params["character_id"]:
                        char["pose"] = body.params["pose"]
                else:
                    char["pose"] = body.params["pose"]
            cut.spec = spec

        # 연출 강도 덮어쓰기 (모드 무관하게 params.drama_level 있으면 저장)
        if "drama_level" in body.params:
            from app.prompts.drama import VALID_LEVELS
            dl = body.params["drama_level"]
            if dl in VALID_LEVELS:
                spec = dict(cut.spec)
                spec["drama_level"] = dl
                cut.spec = spec

    # 재생성에 필요한 정보를 미리 추출
    regen_seed = body.seed if body and body.seed else None
    regen_episode_id = cut.episode_id
    regen_project_id = episode.project_id
    regen_user_id = current_user.id

    # spec 수정사항을 미리 저장
    if body and body.params:
        db.commit()

    job = create_job(total=1)

    async def _regen():
        bg_db = SessionLocal()
        try:
            bg_cut = bg_db.query(Cut).filter(Cut.cut_id == cut_id).first()
            if regen_seed:
                bg_cut.seed = regen_seed
            else:
                bg_cut.seed = None
            result = await generate_cut_image(
                cut=bg_cut,
                episode_id=regen_episode_id,
                project_id=regen_project_id,
                user_id=regen_user_id,
                db=bg_db,
            )
            bg_db.commit()
            return result
        finally:
            bg_db.close()

    run_job_in_background(background_tasks, job.job_id, _regen())

    return {"job_id": job.job_id, "packets_will_charge": 1}


@router.delete("/cuts/{cut_id}/drama-level")
async def clear_drama_level(
    cut_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """컷의 연출 강도 덮어쓰기를 제거한다 (에피소드 기본값으로 되돌리기)."""
    cut = db.query(Cut).filter(Cut.cut_id == cut_id).first()
    if not cut:
        raise HTTPException(status_code=404, detail="Cut not found")
    spec = dict(cut.spec)
    if "drama_level" in spec:
        del spec["drama_level"]
        cut.spec = spec
        db.commit()
    return {"ok": True}


@router.put("/cuts/{cut_id}/dialogue")
async def update_dialogue(
    cut_id: str,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """대사만 수정 → 재조판 (이미지 재생성 없음, 과금 없음)."""
    cut = db.query(Cut).filter(Cut.cut_id == cut_id).first()
    if not cut:
        raise HTTPException(status_code=404, detail="Cut not found")

    spec = dict(cut.spec)
    dialogue = body.get("dialogue", [])
    spec["dialogue"] = dialogue
    sfx_items = body.get("sfx_items")
    if sfx_items is not None:
        spec["sfx_items"] = sfx_items
    effect_items = body.get("effect_items")
    if effect_items is not None:
        from app.storyboard.router import _validate_effect_items
        _validate_effect_items(effect_items)
        spec["effect_items"] = effect_items
    product_items = body.get("product_items")
    if product_items is not None:
        from app.storyboard.router import _validate_product_items
        _validate_product_items(product_items)
        spec["product_items"] = product_items
    pngbubble_items = body.get("pngbubble_items")
    if pngbubble_items is not None:
        from app.storyboard.router import _validate_pngbubble_items
        _validate_pngbubble_items(pngbubble_items)
        spec["pngbubble_items"] = pngbubble_items
    cut.spec = spec

    # 원본 이미지 위에 재조판 (12종 말풍선 자동 매핑)
    if cut.image_url:
        from app.composition.service import compose_cut
        composed_url = compose_cut(cut.image_url, dialogue, cut.episode_id, cut.cut_id, cut_spec=spec)
        cut.composed_image_url = composed_url

    db.commit()

    return {"cut_id": cut_id, "composed_image_url": cut.composed_image_url, "updated": True, "credits_charged": 0}


@router.post("/cuts/{cut_id}/revert")
async def revert_cut(
    cut_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """직전 버전으로 되돌리기 1단계."""
    cut = db.query(Cut).filter(Cut.cut_id == cut_id).first()
    if not cut:
        raise HTTPException(status_code=404, detail="Cut not found")

    if not cut.prev_image_url:
        raise HTTPException(status_code=400, detail="No previous version to revert to")

    # image_url ↔ prev_image_url 교환
    cut.image_url, cut.prev_image_url = cut.prev_image_url, cut.image_url
    cut.version = max((cut.version or 1) - 1, 1)

    # spec도 업데이트
    spec = dict(cut.spec)
    if spec.get("generation"):
        gen = dict(spec["generation"])
        gen["image_url"], gen["previous_image_url"] = gen.get("previous_image_url"), gen.get("image_url")
        spec["generation"] = gen
    cut.spec = spec

    db.commit()
    return {"cut_id": cut_id, "reverted": True, "image_url": cut.image_url}


@router.post("/cuts/{cut_id}/copy-report")
async def copy_report(
    cut_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """카피 글자 오류 신고: 비전 검사 → 틀림이면 환불 + 재생성, 맞으면 200."""
    cut = db.query(Cut).filter(Cut.cut_id == cut_id).first()
    if not cut:
        raise HTTPException(status_code=404, detail="Cut not found")

    episode = db.query(Episode).filter(Episode.id == cut.episode_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    # 프로젝트 소유 확인
    project = db.query(Project).filter(
        Project.id == episode.project_id, Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # onecut_ad 전용
    from app.workflow.gate import get_purpose, get_idea_brief
    purpose = get_purpose(episode.gate_status)
    if purpose != "onecut_ad":
        raise HTTPException(status_code=400, detail="카피 신고는 한 컷 광고만 가능합니다")

    # 같은 버전에 신고 1회만 (중복 환불 방지)
    spec = cut.spec or {}
    gen = spec.get("generation", {})
    version = gen.get("version", cut.version or 1)
    reported_versions = spec.get("copy_reported_versions", [])
    if version in reported_versions:
        raise HTTPException(status_code=409, detail="이 버전은 이미 신고했습니다")

    # 기대 카피 텍스트 추출
    ib = get_idea_brief(episode.gate_status) or {}
    copy_sel = ib.get("copy_selected", 0)
    copies = ib.get("copy_candidates", [])
    chosen = copies[copy_sel] if isinstance(copy_sel, int) and copy_sel < len(copies) else (copies[0] if copies else {})
    head = chosen.get("head", "")
    sub = chosen.get("sub", "")

    if not head and not sub:
        raise HTTPException(status_code=400, detail="카피가 없습니다")

    # 비전 검사
    from app.prompts.copy_render import check_copy_text
    from app.images.service import _load_image_bytes

    img_url = cut.image_url
    img_bytes = _load_image_bytes(img_url) if img_url else None
    if not img_bytes:
        raise HTTPException(status_code=400, detail="이미지를 찾을 수 없습니다")

    check = check_copy_text(img_bytes, head, sub)

    # 신고 버전 기록 (검사 결과와 무관하게)
    updated_spec = dict(spec)
    reported = list(reported_versions)
    reported.append(version)
    updated_spec["copy_reported_versions"] = reported
    cut.spec = updated_spec
    db.flush()

    if check.get("head_ok", True) and check.get("sub_ok", True):
        # 글자가 맞음
        db.commit()
        return {"ok": True, "message": "글자는 정확해요", "check": check}

    # 글자 틀림 → 1패킷 환불 + 재생성
    import logging
    logger = logging.getLogger(__name__)
    logger.warning(
        "Copy report: cut=%s version=%d MISMATCH → refund + regen. check=%s",
        cut_id, version, check,
    )

    from app.packets.service import grant_packets
    grant_packets(current_user.id, 1, db)
    logger.warning(
        "Copy error refund: user=%d cut=%s version=%d (admin_grant 1 packet)",
        current_user.id, cut_id, version,
    )

    # 재생성 (1패킷 재차감 → 결과적으로 무료)
    require_packets(current_user.id, 1, db)
    db.commit()

    regen_episode_id = cut.episode_id
    regen_project_id = episode.project_id
    regen_user_id = current_user.id

    job = create_job(total=1)

    async def _regen():
        bg_db = SessionLocal()
        try:
            bg_cut = bg_db.query(Cut).filter(Cut.cut_id == cut_id).first()
            bg_cut.seed = None  # 새 시드
            result = await generate_cut_image(
                cut=bg_cut,
                episode_id=regen_episode_id,
                project_id=regen_project_id,
                user_id=regen_user_id,
                db=bg_db,
            )
            bg_db.commit()
            return result
        finally:
            bg_db.close()

    run_job_in_background(background_tasks, job.job_id, _regen())

    return {
        "ok": False,
        "message": "글자 오류 확인 — 패킷을 돌려드리고 다시 그려요",
        "job_id": job.job_id,
        "check": check,
    }


def _get_episode_for_user(db, project_id, episode_id, user_id):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == user_id, Project.deleted_at.is_(None)).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    episode = db.query(Episode).filter(Episode.id == episode_id, Episode.project_id == project_id, Episode.deleted_at.is_(None)).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    return episode
