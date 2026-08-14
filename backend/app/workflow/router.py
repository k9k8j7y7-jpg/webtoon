"""워크플로우 엔드포인트 — 게이트 3 승인 + Job 폴링. API-Spec 5장, 9장."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User
from app.projects.models import Project, Episode
from app.characters.models import Character
from app.locations.models import Location
from app.storyboard.models import Cut
from app.workflow.gate import approve_gate, get_gate_number, GATE_KEYS
from app.jobs import get_job

router = APIRouter(tags=["workflow"])


class ApproveRequest(BaseModel):
    auto_advance: bool = False


@router.post("/projects/{project_id}/episodes/{episode_id}/assets/approve")
async def approve_assets(
    project_id: int,
    episode_id: int,
    body: ApproveRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """게이트 3 승인 → 캐릭터·장소 status=approved, current_gate=4."""
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)

    gate = get_gate_number(episode.gate_status)
    if gate != 3:
        raise HTTPException(status_code=400, detail=f"Current gate is {gate}, not gate 3")

    # 캐릭터·장소 전부 approved로
    characters = db.query(Character).filter(Character.episode_id == episode_id).all()
    for c in characters:
        c.status = "approved"

    locations = db.query(Location).filter(Location.episode_id == episode_id).all()
    for l in locations:
        l.status = "approved"

    # 게이트 전진
    new_status = approve_gate(episode.gate_status, 3)
    if body and body.auto_advance:
        new_status["auto_advance"] = True
    episode.gate_status = new_status

    db.commit()
    db.refresh(episode)

    return {
        "approved": True,
        "current_gate": new_status["current_gate"],
        "characters_approved": len(characters),
        "locations_approved": len(locations),
        "gate_status": new_status,
    }


class RevertRequest(BaseModel):
    target_gate: int


@router.post("/projects/{project_id}/episodes/{episode_id}/revert")
async def revert_to_gate(
    project_id: int,
    episode_id: int,
    body: RevertRequest,
    dry_run: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """이전 게이트로 되돌아가기. dry_run=true면 영향 목록만 반환."""
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)
    current_gate = get_gate_number(episode.gate_status)
    target = body.target_gate

    if target < 1 or target >= current_gate:
        raise HTTPException(status_code=400, detail=f"Cannot revert to gate {target} (current: {current_gate})")

    # 영향 범위 계산
    impact = {
        "target_gate": target,
        "current_gate": current_gate,
        "gates_invalidated": [],
        "characters_count": 0,
        "locations_count": 0,
        "cuts_count": 0,
    }

    # 이후 게이트 중 approved/draft인 것
    gs = episode.gate_status
    for gate_num in range(target + 1, 6):
        key = GATE_KEYS[gate_num - 1]
        gate_data = gs["gates"].get(key, {})
        if gate_data.get("status") in ("approved", "draft"):
            labels = {
                "1_planning": "기획", "2_script": "대본", "3_assets": "자산",
                "4_storyboard": "콘티", "5_review": "이미지",
            }
            impact["gates_invalidated"].append(labels.get(key, key))

    # 자산 수 (게이트3 이후가 무효화 대상이면)
    if target <= 2:
        impact["characters_count"] = db.query(Character).filter(
            Character.episode_id == episode_id,
            Character.status.in_(["approved", "pending"]),
        ).count()
        impact["locations_count"] = db.query(Location).filter(
            Location.episode_id == episode_id,
            Location.status.in_(["approved", "pending"]),
        ).count()

    # 컷 수 (게이트4 이후가 무효화 대상이면)
    if target <= 3:
        impact["cuts_count"] = db.query(Cut).filter(
            Cut.episode_id == episode_id,
            Cut.status.in_(["approved", "pending"]),
        ).count()

    if dry_run:
        return {"impact": impact}

    # 실제 되돌아가기 실행
    new_gs = {**gs, "gates": {**gs["gates"]}}

    # target 게이트를 draft로
    target_key = GATE_KEYS[target - 1]
    new_gs["gates"][target_key] = {"status": "draft", "approved_at": None}
    new_gs["current_gate"] = target

    # 이후 게이트를 invalidated로
    for gate_num in range(target + 1, 6):
        key = GATE_KEYS[gate_num - 1]
        gate_data = new_gs["gates"].get(key, {})
        if gate_data.get("status") in ("approved", "draft"):
            new_gs["gates"][key] = {"status": "invalidated", "approved_at": None}

    episode.gate_status = new_gs

    # 자산 무효화 (stale 표시, 삭제 안 함)
    if target <= 2:
        db.query(Character).filter(
            Character.episode_id == episode_id,
            Character.status.in_(["approved", "pending"]),
        ).update({"status": "invalidated"}, synchronize_session="fetch")
        db.query(Location).filter(
            Location.episode_id == episode_id,
            Location.status.in_(["approved", "pending"]),
        ).update({"status": "invalidated"}, synchronize_session="fetch")

    if target <= 3:
        db.query(Cut).filter(
            Cut.episode_id == episode_id,
            Cut.status.in_(["approved", "pending"]),
        ).update({"status": "invalidated"}, synchronize_session="fetch")

    db.commit()
    db.refresh(episode)

    return {
        "reverted": True,
        "target_gate": target,
        "gate_status": episode.gate_status,
        "impact": impact,
    }


@router.get("/jobs/{job_id}")
async def poll_job(job_id: str):
    """Job 상태 폴링. API-Spec 9장."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job.to_dict()


def _get_episode_for_user(db, project_id, episode_id, user_id):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == user_id, Project.deleted_at.is_(None)).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    episode = db.query(Episode).filter(Episode.id == episode_id, Episode.project_id == project_id, Episode.deleted_at.is_(None)).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    return episode
