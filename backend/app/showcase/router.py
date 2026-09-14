from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.deps import get_optional_user
from app.users.models import User
from app.projects.models import Episode, Project
from app.storyboard.models import Cut

router = APIRouter(prefix="/showcase", tags=["showcase"])


@router.get("/episodes")
def list_showcase_episodes(db: Session = Depends(get_db)):
    """공개 갤러리용 showcase 에피소드 목록 (카테고리별 그룹)."""
    episodes = (
        db.query(Episode, Project)
        .join(Project, Episode.project_id == Project.id)
        .filter(Episode.showcase == True, Episode.deleted_at == None)
        .order_by(Episode.id.desc())
        .all()
    )

    result = {"short": [], "series": [], "ad": []}
    for ep, proj in episodes:
        first_cut = (
            db.query(Cut)
            .filter(Cut.episode_id == ep.id, Cut.image_url != None)
            .order_by(Cut.cut_number)
            .first()
        )
        cat = ep.showcase_category or "short"
        if cat not in result:
            result[cat] = []
        result[cat].append({
            "share_token": ep.share_token,
            "title": ep.title or proj.title,
            "genre": proj.genre,
            "thumbnail_url": first_cut.image_url if first_cut else None,
        })

    return result


@router.get("/view/{share_token}")
def get_viewer_data(
    share_token: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """공개 뷰어 데이터 — showcase=true이면 누구나, 아니면 소유자만."""
    episode = db.query(Episode).filter(
        Episode.share_token == share_token,
        Episode.deleted_at == None,
    ).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    project = db.query(Project).filter(Project.id == episode.project_id).first()

    # 접근 제어: showcase가 아니면 소유자만
    if not episode.showcase:
        if current_user is None or current_user.id != project.user_id:
            raise HTTPException(status_code=403, detail="Access denied")

    cuts = (
        db.query(Cut)
        .filter(Cut.episode_id == episode.id, Cut.image_url != None)
        .order_by(Cut.cut_number)
        .all()
    )

    return {
        "title": episode.title or project.title,
        "episode_no": episode.episode_no,
        "cuts": [
            {
                "cut_number": c.cut_number,
                "image_url": c.image_url,
                "dialogue": (c.spec or {}).get("dialogue", []),
                "sfx_items": (c.spec or {}).get("sfx_items", []),
                "effect_items": (c.spec or {}).get("effect_items", []),
                "characters": (c.spec or {}).get("characters", []),
            }
            for c in cuts
        ],
    }
