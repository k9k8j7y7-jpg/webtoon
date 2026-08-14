"""게이트 2 — 대본 엔드포인트. API-Spec 4장."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User
from app.projects.models import Project, Episode
from app.script.service import generate_script, extract_character_names, extract_location_names
from app.workflow.gate import approve_gate, get_gate_number
from app.workflow.service import compute_invalidation_scope, invalidate_from_gate

router = APIRouter(tags=["gate2-script"])


class ApproveRequest(BaseModel):
    auto_advance: bool = False


@router.get("/projects/{project_id}/episodes/{episode_id}/script")
async def get_script(
    project_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)
    script = (episode.script or {}).get("script")
    if not script:
        return None
    return script


@router.post("/projects/{project_id}/episodes/{episode_id}/script")
async def create_script(
    project_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)

    gate = get_gate_number(episode.gate_status)
    if gate != 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Current gate is {gate}, script requires gate 2",
        )

    # 기획 데이터 가져오기
    planning = (episode.script or {}).get("planning")
    if not planning:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Planning data not found. Complete gate 1 first.",
        )

    result = await generate_script(planning)

    # 대본 저장
    script_data = dict(episode.script) if episode.script else {}
    script_data["script"] = result
    episode.script = script_data
    db.commit()
    db.refresh(episode)

    return result


@router.put("/projects/{project_id}/episodes/{episode_id}/script")
async def update_script(
    project_id: int,
    episode_id: int,
    body: dict,
    dry_run: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """대본 수정. dry_run=true면 무효화 영향만 미리보기."""
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)

    old_script = (episode.script or {}).get("script", {})
    new_script = body.get("script", old_script)

    # diff 판정 (Backend-State-Model 3.2)
    old_chars = extract_character_names(old_script)
    new_chars = extract_character_names(new_script)
    old_locs = extract_location_names(old_script)
    new_locs = extract_location_names(new_script)

    invalidation = {
        "characters": list((old_chars - new_chars) | (new_chars - old_chars)),
        "locations": list((old_locs - new_locs) | (new_locs - old_locs)),
        "cuts_affected": old_chars != new_chars or old_locs != new_locs,
    }

    if dry_run:
        message_parts = []
        if invalidation["characters"]:
            message_parts.append(f"캐릭터 {invalidation['characters']}가 변경됩니다")
        if invalidation["locations"]:
            message_parts.append(f"장소 {invalidation['locations']}가 변경됩니다")
        if not message_parts:
            message_parts.append("캐릭터/장소 변경 없음. 콘티·이미지만 재확정 필요.")

        return {
            "invalidation_preview": {
                "characters": invalidation["characters"],
                "locations": invalidation["locations"],
                "cuts_affected": invalidation["cuts_affected"],
                "message": " / ".join(message_parts),
            }
        }

    # 무효화 범위 판정 (State-Model 3.2)
    scope = compute_invalidation_scope(old_script, new_script)

    # 실제 수정 적용
    script_data = dict(episode.script) if episode.script else {}
    script_data["script"] = new_script
    episode.script = script_data

    # 무효화 전파 실행 (게이트 2에서 수정)
    invalidation_result = invalidate_from_gate(episode, from_gate=2, scope=scope, db=db)

    db.commit()
    db.refresh(episode)

    return {
        "script": new_script,
        "invalidation": invalidation_result,
        "gate_status": episode.gate_status,
    }


@router.post("/projects/{project_id}/episodes/{episode_id}/script/approve")
async def approve_script(
    project_id: int,
    episode_id: int,
    body: ApproveRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)

    gate = get_gate_number(episode.gate_status)
    if gate != 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Current gate is {gate}, not gate 2",
        )

    new_status = approve_gate(episode.gate_status, 2)
    if body and body.auto_advance:
        new_status["auto_advance"] = True
    episode.gate_status = new_status
    db.commit()
    db.refresh(episode)

    return {
        "approved": True,
        "current_gate": new_status["current_gate"],
        "gate_status": new_status,
    }


# ── 게이트 상태 조회 (API-Spec 9장) ──

@router.get("/projects/{project_id}/episodes/{episode_id}/status")
async def get_episode_status(
    project_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)
    return episode.gate_status


def _get_episode_for_user(db: Session, project_id: int, episode_id: int, user_id: int) -> Episode:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == user_id, Project.deleted_at.is_(None))
        .first()
    )
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    episode = (
        db.query(Episode)
        .filter(Episode.id == episode_id, Episode.project_id == project_id, Episode.deleted_at.is_(None))
        .first()
    )
    if not episode:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Episode not found")

    return episode
