"""Export 엔드포인트 — API-Spec 8장."""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.auth.deps import get_current_user
from app.users.models import User
from app.projects.models import Project, Episode
from app.storyboard.models import Cut
from app.export.service import run_export
from app.jobs import create_job, run_job_in_background

router = APIRouter(tags=["export"])


class ExportRequest(BaseModel):
    format: str = "png_cuts"  # png_cuts | vertical_single | instagram_carousel


@router.post("/projects/{project_id}/episodes/{episode_id}/export", status_code=202)
async def export_episode(
    project_id: int,
    episode_id: int,
    body: ExportRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """완성 웹툰을 지정 포맷으로 내보낸다. 비동기."""
    # 권한 확인
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id,
        Project.deleted_at.is_(None),
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    episode = db.query(Episode).filter(
        Episode.id == episode_id,
        Episode.project_id == project_id,
        Episode.deleted_at.is_(None),
    ).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    # 이미지가 있는 컷이 있는지 확인
    has_images = db.query(Cut).filter(
        Cut.episode_id == episode_id,
        Cut.image_url.isnot(None),
    ).count()
    if not has_images:
        raise HTTPException(status_code=400, detail="No generated images to export")

    valid_formats = ["png_cuts", "vertical_single", "instagram_carousel"]
    if body.format not in valid_formats:
        raise HTTPException(status_code=400, detail=f"Invalid format. Use: {valid_formats}")

    job = create_job(total=1)

    async def _export():
        bg_db = SessionLocal()
        try:
            result = await run_export(episode_id, body.format, bg_db)
            return result
        finally:
            bg_db.close()

    run_job_in_background(background_tasks, job.job_id, _export())

    return {"job_id": job.job_id}
