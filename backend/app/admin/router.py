import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.database import get_db
from app.admin.deps import require_admin
from app.users.models import User
from app.projects.models import Episode, Project
from app.storyboard.models import GenerationLog

router = APIRouter(prefix="/admin", tags=["admin"])


# ── 1단계: 운영 대시보드 ─────────────────────────────────────

@router.get("/stats")
def get_admin_stats(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """운영 대시보드 통계."""
    today_start = datetime.combine(date.today(), datetime.min.time())

    total_users = db.query(func.count(User.id)).scalar()

    today_signups = db.query(func.count(User.id)).filter(
        User.created_at >= today_start
    ).scalar()

    today_generations = db.query(func.count(GenerationLog.id)).filter(
        GenerationLog.created_at >= today_start
    ).scalar()

    row = db.execute(
        text("SELECT COALESCE(SUM(amount), 0) FROM orders WHERE status = 'paid'")
    ).scalar()
    total_revenue = int(row)

    today_views = db.query(func.coalesce(func.sum(Episode.view_count), 0)).filter(
        Episode.showcase == True
    ).scalar()

    return {
        "total_users": total_users,
        "today_signups": today_signups,
        "today_generations": today_generations,
        "total_revenue": total_revenue,
        "today_gallery_views": today_views,
    }


# ── 2단계: 갤러리 노출 관리 ──────────────────────────────────

@router.get("/episodes")
def list_all_episodes(
    project_id: int | None = Query(None),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """관리자용 전체 에피소드 목록 (프로젝트 필터 가능)."""
    q = (
        db.query(Episode, Project)
        .join(Project, Episode.project_id == Project.id)
        .filter(Episode.deleted_at == None)
    )
    if project_id is not None:
        q = q.filter(Episode.project_id == project_id)

    episodes = q.order_by(Episode.id.desc()).all()

    return [
        {
            "id": ep.id,
            "title": ep.title or proj.title,
            "project_id": proj.id,
            "project_title": proj.title,
            "gate_status": ep.gate_status,
            "showcase": bool(ep.showcase),
            "showcase_category": ep.showcase_category,
            "share_token": ep.share_token,
            "view_count": ep.view_count,
            "like_count": ep.like_count,
        }
        for ep, proj in episodes
    ]


@router.get("/projects")
def list_projects_for_filter(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """프로젝트 필터 드롭다운용 목록."""
    projects = (
        db.query(Project)
        .filter(Project.deleted_at == None)
        .order_by(Project.id.desc())
        .all()
    )
    return [{"id": p.id, "title": p.title} for p in projects]


class ShowcaseToggleRequest(BaseModel):
    showcase: bool
    showcase_category: str | None = None


@router.patch("/episodes/{episode_id}/showcase")
def toggle_showcase(
    episode_id: int,
    req: ShowcaseToggleRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """에피소드 showcase 노출 토글 + 카테고리 설정."""
    episode = db.query(Episode).filter(
        Episode.id == episode_id, Episode.deleted_at == None
    ).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    # 카테고리 검증
    valid_categories = {"short", "series", "ad"}
    if req.showcase and req.showcase_category and req.showcase_category not in valid_categories:
        raise HTTPException(status_code=400, detail=f"Invalid category: {req.showcase_category}")

    episode.showcase = req.showcase

    if req.showcase:
        episode.showcase_category = req.showcase_category or "short"
        # share_token 없으면 자동 생성
        if not episode.share_token:
            episode.share_token = str(uuid.uuid4())
    else:
        # 노출 해제 시 카테고리는 유지 (재노출 시 편의), share_token도 유지
        pass

    db.commit()
    db.refresh(episode)

    return {
        "id": episode.id,
        "showcase": bool(episode.showcase),
        "showcase_category": episode.showcase_category,
        "share_token": episode.share_token,
    }
