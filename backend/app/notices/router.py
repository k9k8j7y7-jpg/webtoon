from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime

from app.database import get_db
from app.notices.models import Notice

router = APIRouter(prefix="/notices", tags=["notices"])


@router.get("/active")
def get_active_notice(db: Session = Depends(get_db)):
    """활성 공지 1건 반환 (최신 우선). 없으면 null."""
    now = datetime.utcnow()
    notice = (
        db.query(Notice)
        .filter(
            Notice.is_active == True,
            Notice.starts_at <= now,
            (Notice.ends_at == None) | (Notice.ends_at >= now),
        )
        .order_by(Notice.id.desc())
        .first()
    )
    if not notice:
        return None
    return {
        "id": notice.id,
        "title": notice.title,
        "body": notice.body,
        "notice_type": notice.notice_type,
    }
