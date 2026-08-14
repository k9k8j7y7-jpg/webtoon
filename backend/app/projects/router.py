from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User
from app.projects.models import Project, ProjectMemory, Episode
from app.projects.schemas import (
    ProjectCreate, ProjectUpdate, ProjectResponse,
    EpisodeCreate, EpisodeResponse,
)
from app.workflow.gate import create_initial_gate_status

router = APIRouter(prefix="/projects", tags=["projects"])


# ── Project CRUD ──────────────────────────────

@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    body: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = Project(
        user_id=current_user.id,
        title=body.title,
        genre=body.genre,
        language=body.language,
        visibility=body.visibility,
    )
    db.add(project)
    db.flush()

    # 프로젝트 메모리 초기화 (AI Context Manager용)
    memory = ProjectMemory(project_id=project.id, rules={})
    db.add(memory)

    db.commit()
    db.refresh(project)
    return project


@router.get("", response_model=list[ProjectResponse])
def list_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    projects = (
        db.query(Project)
        .filter(Project.user_id == current_user.id, Project.deleted_at.is_(None))
        .order_by(Project.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return projects


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = _get_user_project(db, project_id, current_user.id)
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: int,
    body: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = _get_user_project(db, project_id, current_user.id)
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(project, key, value)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import datetime, timezone

    project = _get_user_project(db, project_id, current_user.id)
    project.deleted_at = datetime.now(timezone.utc)
    db.commit()


# ── Episode CRUD ──────────────────────────────

@router.post("/{project_id}/episodes", response_model=EpisodeResponse, status_code=status.HTTP_201_CREATED)
def create_episode(
    project_id: int,
    body: EpisodeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_user_project(db, project_id, current_user.id)

    episode = Episode(
        project_id=project_id,
        episode_no=body.episode_no,
        title=body.title,
        gate_status=create_initial_gate_status(),
    )
    db.add(episode)
    db.commit()
    db.refresh(episode)
    return episode


@router.get("/{project_id}/episodes", response_model=list[EpisodeResponse])
def list_episodes(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_user_project(db, project_id, current_user.id)

    episodes = (
        db.query(Episode)
        .filter(Episode.project_id == project_id, Episode.deleted_at.is_(None))
        .order_by(Episode.episode_no)
        .all()
    )
    return episodes


@router.delete("/{project_id}/episodes/{episode_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_episode(
    project_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import datetime, timezone

    _get_user_project(db, project_id, current_user.id)
    episode = _get_episode(db, episode_id, project_id)
    episode.deleted_at = datetime.now(timezone.utc)
    db.commit()


@router.get("/{project_id}/episodes/{episode_id}", response_model=EpisodeResponse)
def get_episode(
    project_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_user_project(db, project_id, current_user.id)
    episode = _get_episode(db, episode_id, project_id)
    return episode


# ── Helpers ───────────────────────────────────

def _get_user_project(db: Session, project_id: int, user_id: int) -> Project:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == user_id, Project.deleted_at.is_(None))
        .first()
    )
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def _get_episode(db: Session, episode_id: int, project_id: int) -> Episode:
    episode = (
        db.query(Episode)
        .filter(Episode.id == episode_id, Episode.project_id == project_id, Episode.deleted_at.is_(None))
        .first()
    )
    if not episode:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Episode not found")
    return episode
