"""Series CRUD — P2 최소 골격. P4에서 본격 확장."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User
from app.projects.models import Project, Series

router = APIRouter(tags=["series"])


class SeriesCreate(BaseModel):
    title: str
    bible: dict | None = None
    outline: dict | None = None


@router.post("/projects/{project_id}/series", status_code=status.HTTP_201_CREATED)
def create_series(
    project_id: int,
    body: SeriesCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """시리즈 생성 (테이블 검증용 최소 API)."""
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == current_user.id, Project.deleted_at.is_(None))
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    series = Series(
        project_id=project_id,
        title=body.title,
        bible=body.bible,
        outline=body.outline,
    )
    db.add(series)
    db.commit()
    db.refresh(series)

    return {
        "id": series.id,
        "project_id": series.project_id,
        "title": series.title,
        "created_at": series.created_at.isoformat(),
    }


@router.get("/series/{series_id}")
def get_series(
    series_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """시리즈 조회."""
    series = db.query(Series).filter(Series.id == series_id).first()
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")

    # 소유권 확인
    project = (
        db.query(Project)
        .filter(Project.id == series.project_id, Project.user_id == current_user.id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Series not found")

    return {
        "id": series.id,
        "project_id": series.project_id,
        "title": series.title,
        "bible": series.bible,
        "outline": series.outline,
        "created_at": series.created_at.isoformat(),
        "updated_at": series.updated_at.isoformat(),
    }
