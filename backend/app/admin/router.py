from datetime import date, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.database import get_db
from app.admin.deps import require_admin
from app.users.models import User
from app.projects.models import Episode
from app.storyboard.models import GenerationLog

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats")
def get_admin_stats(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """운영 대시보드 통계."""
    today_start = datetime.combine(date.today(), datetime.min.time())

    # 전체 회원 수
    total_users = db.query(func.count(User.id)).scalar()

    # 오늘 가입 수
    today_signups = db.query(func.count(User.id)).filter(
        User.created_at >= today_start
    ).scalar()

    # 오늘 이미지 생성 수 (generation_logs)
    today_generations = db.query(func.count(GenerationLog.id)).filter(
        GenerationLog.created_at >= today_start
    ).scalar()

    # 패킷 판매 누계 (orders 테이블, raw SQL — ORM 모델 없음)
    row = db.execute(
        text("SELECT COALESCE(SUM(amount), 0) FROM orders WHERE status = 'paid'")
    ).scalar()
    total_revenue = int(row)

    # 오늘 갤러리 조회수 합
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
