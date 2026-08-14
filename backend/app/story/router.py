"""게이트 1 — 기획 엔드포인트. API-Spec 3장."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User
from app.projects.models import Project, Episode
from app.story.service import generate_planning, suggest_characters
from app.workflow.gate import approve_gate, get_gate_number

router = APIRouter(tags=["gate1-planning"])


class CharacterInput(BaseModel):
    name: str
    gender: str | None = None
    age: int | str | None = None


class PlanningRequest(BaseModel):
    idea: str
    mood: str | None = None
    characters: list[CharacterInput] | None = None


class SuggestCharactersRequest(BaseModel):
    idea: str


class ApproveRequest(BaseModel):
    auto_advance: bool = False


@router.get("/projects/{project_id}/episodes/{episode_id}/planning")
async def get_planning(
    project_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)
    planning = (episode.script or {}).get("planning")
    if not planning:
        return None
    # title/logline/synopsis는 에피소드 컬럼이 최신 (수정 반영)
    planning["title"] = episode.title or planning.get("title")
    planning["logline"] = episode.logline or planning.get("logline")
    planning["synopsis"] = episode.synopsis or planning.get("synopsis")
    return planning


@router.post("/projects/{project_id}/episodes/{episode_id}/planning/suggest-characters")
async def suggest_characters_endpoint(
    project_id: int,
    episode_id: int,
    body: SuggestCharactersRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_episode_for_user(db, project_id, episode_id, current_user.id)
    characters = await suggest_characters(body.idea)
    return {"characters": characters}


@router.post("/projects/{project_id}/episodes/{episode_id}/planning")
async def create_planning(
    project_id: int,
    episode_id: int,
    body: PlanningRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)

    gate = get_gate_number(episode.gate_status)
    if gate != 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Current gate is {gate}, planning requires gate 1",
        )

    chars = [c.model_dump() for c in body.characters] if body.characters else None
    result = await generate_planning(body.idea, body.mood, chars)

    # 에피소드에 기획 결과 저장 (사용자가 입력한 제목이 있으면 유지)
    if not episode.title:
        episode.title = result.get("title")
    episode.logline = result.get("logline")
    episode.synopsis = result.get("synopsis")
    # world와 characters는 script JSON에 임시 저장 (3단계에서 script로 확장)
    episode.script = {
        "planning": result,
    }
    db.commit()
    db.refresh(episode)

    return result


@router.put("/projects/{project_id}/episodes/{episode_id}/planning")
async def update_planning(
    project_id: int,
    episode_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)

    # 사용자 수정 반영
    if "title" in body:
        episode.title = body["title"]
    if "logline" in body:
        episode.logline = body["logline"]
    if "synopsis" in body:
        episode.synopsis = body["synopsis"]
    if "planning" in body and episode.script:
        script = dict(episode.script)
        script["planning"] = body["planning"]
        episode.script = script

    db.commit()
    db.refresh(episode)

    return {"status": "updated"}


@router.post("/projects/{project_id}/episodes/{episode_id}/planning/approve")
async def approve_planning(
    project_id: int,
    episode_id: int,
    body: ApproveRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)

    gate = get_gate_number(episode.gate_status)
    if gate != 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Current gate is {gate}, not gate 1",
        )

    new_status = approve_gate(episode.gate_status, 1)
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
