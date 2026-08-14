"""게이트 3 — 스타일 엔드포인트. API-Spec 5장."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User
from app.projects.models import Project, Episode
from app.styles.models import Style, STYLE_PRESETS
from app.workflow.gate import get_gate_number

router = APIRouter(tags=["gate3-styles"])


class StyleSelectRequest(BaseModel):
    preset_key: str


@router.get("/styles/presets")
async def list_style_presets():
    """사용 가능한 스타일 프리셋 목록."""
    return {
        "core": [
            {"key": k, "label": v["label"], "tier": "core"}
            for k, v in STYLE_PRESETS.items() if v["tier"] == "core"
        ],
        "beta": [
            {"key": k, "label": v["label"], "tier": "beta"}
            for k, v in STYLE_PRESETS.items() if v["tier"] == "beta"
        ],
    }


@router.put("/projects/{project_id}/episodes/{episode_id}/style")
async def select_style(
    project_id: int,
    episode_id: int,
    body: StyleSelectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """스타일 락 선택."""
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)

    gate = get_gate_number(episode.gate_status)
    if gate != 3:
        raise HTTPException(status_code=400, detail=f"Current gate is {gate}, style requires gate 3")

    if body.preset_key not in STYLE_PRESETS:
        raise HTTPException(status_code=400, detail=f"Unknown preset: {body.preset_key}")

    preset = STYLE_PRESETS[body.preset_key]

    # 기존 스타일 있으면 업데이트, 없으면 생성
    style = db.query(Style).filter(Style.episode_id == episode_id).first()
    if style:
        style.preset_key = body.preset_key
        style.tier = preset["tier"]
        style.prompt_snippet = preset["prompt"]
    else:
        style = Style(
            episode_id=episode_id,
            preset_key=body.preset_key,
            tier=preset["tier"],
            prompt_snippet=preset["prompt"],
        )
        db.add(style)

    db.commit()
    return {"preset_key": body.preset_key, "label": preset["label"], "tier": preset["tier"]}


@router.get("/projects/{project_id}/episodes/{episode_id}/style")
async def get_style(
    project_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_episode_for_user(db, project_id, episode_id, current_user.id)
    style = db.query(Style).filter(Style.episode_id == episode_id).first()
    if not style:
        return {"preset_key": None, "message": "No style selected yet"}
    return {"preset_key": style.preset_key, "tier": style.tier}


def _get_episode_for_user(db, project_id, episode_id, user_id):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == user_id, Project.deleted_at.is_(None)).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    episode = db.query(Episode).filter(Episode.id == episode_id, Episode.project_id == project_id, Episode.deleted_at.is_(None)).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    return episode
