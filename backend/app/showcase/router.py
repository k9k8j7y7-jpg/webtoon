import hashlib
import time
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.deps import get_optional_user
from app.users.models import User
from app.projects.models import Episode, Project, ShowcaseLike
from app.storyboard.models import Cut
from app.products.models import Product
from app.social.models import AuthorSubscription
from app.social.service import author_payload, default_category, first_cut_image

router = APIRouter(prefix="/showcase", tags=["showcase"])

# ── 조회수 중복 완화: 인메모리 (기기/세션당 24시간 1회) ──────────
_view_seen: dict[str, float] = {}          # "ep_id:fp" → timestamp
_VIEW_TTL = 86400                          # 24h


def _make_fingerprint(request: Request) -> str:
    """IP + User-Agent 해시 → 64자 hex fingerprint."""
    client_ip = request.client.host if request.client else "unknown"
    ua = request.headers.get("user-agent", "")
    raw = f"{client_ip}|{ua}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _record_view(episode_id: int, fp: str, db: Session) -> None:
    """조회수 증가 (중복 완화). 만료된 엔트리 lazy 정리."""
    key = f"{episode_id}:{fp}"
    now = time.time()

    # lazy cleanup (100건마다)
    if len(_view_seen) > 10000:
        expired = [k for k, t in _view_seen.items() if now - t > _VIEW_TTL]
        for k in expired:
            del _view_seen[k]

    if key in _view_seen and now - _view_seen[key] < _VIEW_TTL:
        return  # 이미 카운트됨

    _view_seen[key] = now
    db.query(Episode).filter(Episode.id == episode_id).update(
        {Episode.view_count: Episode.view_count + 1}
    )
    db.commit()


# ── 갤러리 목록 ──────────────────────────────────────────────

@router.get("/episodes")
def list_showcase_episodes(
    scope: str = Query("featured", pattern="^(featured|all)$"),
    db: Session = Depends(get_db),
):
    """공개 갤러리 목록 (카테고리별 그룹).
    scope=featured(기본, 랜딩) → 관리자 추천작 / scope=all(갤러리 전체) → 작가 공개작 전부."""
    q = (
        db.query(Episode, Project, User)
        .join(Project, Episode.project_id == Project.id)
        .join(User, Project.user_id == User.id)
        .filter(Episode.is_public == True, Episode.deleted_at == None, Project.deleted_at == None)
    )
    if scope == "featured":
        q = q.filter(Episode.featured == True)
        q = q.order_by(Episode.id.desc())
    else:
        q = q.order_by(Episode.published_at.desc(), Episode.id.desc())

    result = {"short": [], "series": [], "ad": []}
    for ep, proj, author in q.all():
        cat = ep.showcase_category or default_category(ep)
        result.setdefault(cat, []).append({
            "share_token": ep.share_token,
            "title": ep.title or proj.title,
            "genre": proj.genre,
            "thumbnail_url": first_cut_image(db, ep.id),
            "view_count": ep.view_count,
            "like_count": ep.like_count,
            "author": author_payload(author),
        })

    return result


# ── 공개 뷰어 ────────────────────────────────────────────────

@router.get("/view/{share_token}")
def get_viewer_data(
    share_token: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """공개 뷰어 데이터 — is_public이면 누구나, 아니면 소유자만."""
    episode = db.query(Episode).filter(
        Episode.share_token == share_token,
        Episode.deleted_at == None,
    ).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    project = db.query(Project).filter(Project.id == episode.project_id).first()

    # 접근 제어: 공개(is_public)가 아니면 소유자만
    if not episode.is_public:
        if current_user is None or current_user.id != project.user_id:
            raise HTTPException(status_code=403, detail="Access denied")

    # 조회수 기록
    fp = _make_fingerprint(request)
    _record_view(episode.id, fp, db)
    db.refresh(episode)

    cuts = (
        db.query(Cut)
        .filter(Cut.episode_id == episode.id, Cut.image_url != None)
        .order_by(Cut.cut_number)
        .all()
    )

    # 제품 목록 (광고 에피소드용 — 뷰어에서 product_items 렌더에 필요)
    ep_products = db.query(Product).filter(Product.episode_id == episode.id).all()

    from app.workflow.gate import get_page_format
    author = db.query(User).filter(User.id == project.user_id).first()
    is_me = current_user is not None and current_user.id == project.user_id
    is_subscribed = False
    if current_user is not None and not is_me:
        is_subscribed = db.query(AuthorSubscription.id).filter(
            AuthorSubscription.follower_id == current_user.id,
            AuthorSubscription.author_id == project.user_id,
        ).first() is not None

    return {
        "title": episode.title or project.title,
        "episode_no": episode.episode_no,
        "author": author_payload(author),
        "episode_id": episode.id,  # 댓글 API용
        "comment_count": episode.comment_count,
        "is_me": is_me,
        "is_subscribed": is_subscribed,
        "is_public": bool(episode.is_public),
        "view_count": episode.view_count,
        "like_count": episode.like_count,
        "page_format": get_page_format(episode.gate_status or {}),
        "products": [
            {"id": p.id, "name": p.name, "photo_url": p.photo_url}
            for p in ep_products if p.photo_url
        ],
        "cuts": [
            {
                "cut_number": c.cut_number,
                "image_url": c.image_url,
                "dialogue": (c.spec or {}).get("dialogue", []),
                "sfx_items": (c.spec or {}).get("sfx_items", []),
                "effect_items": (c.spec or {}).get("effect_items", []),
                "product_items": (c.spec or {}).get("product_items", []),
                "pngbubble_items": (c.spec or {}).get("pngbubble_items", []),
                "characters": (c.spec or {}).get("characters", []),
            }
            for c in cuts
        ],
    }


# ── 좋아요 토글 ──────────────────────────────────────────────

@router.post("/like/{share_token}")
def toggle_like(
    share_token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """좋아요 토글 (비로그인 포함). fingerprint 기반 중복 방지."""
    episode = db.query(Episode).filter(
        Episode.share_token == share_token,
        Episode.is_public == True,
        Episode.deleted_at == None,
    ).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    fp = _make_fingerprint(request)

    existing = db.query(ShowcaseLike).filter(
        ShowcaseLike.episode_id == episode.id,
        ShowcaseLike.fingerprint == fp,
    ).first()

    if existing:
        # 취소
        db.delete(existing)
        db.query(Episode).filter(Episode.id == episode.id).update(
            {Episode.like_count: Episode.like_count - 1}
        )
        db.commit()
        db.refresh(episode)
        return {"liked": False, "like_count": episode.like_count}
    else:
        # 증가
        db.add(ShowcaseLike(episode_id=episode.id, fingerprint=fp))
        db.query(Episode).filter(Episode.id == episode.id).update(
            {Episode.like_count: Episode.like_count + 1}
        )
        db.commit()
        db.refresh(episode)
        return {"liked": True, "like_count": episode.like_count}


# ── 좋아요 상태 조회 ─────────────────────────────────────────

@router.get("/like/{share_token}")
def get_like_status(
    share_token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """현재 클라이언트의 좋아요 여부 + 총 수."""
    episode = db.query(Episode).filter(
        Episode.share_token == share_token,
        Episode.is_public == True,
        Episode.deleted_at == None,
    ).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    fp = _make_fingerprint(request)
    liked = db.query(ShowcaseLike).filter(
        ShowcaseLike.episode_id == episode.id,
        ShowcaseLike.fingerprint == fp,
    ).first() is not None

    return {"liked": liked, "like_count": episode.like_count}
