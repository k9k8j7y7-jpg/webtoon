"""작가 공개·작가 페이지 (지시서-구독알림 1a)."""

import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, get_optional_user
from app.database import get_db
from app.projects.models import Episode, Project
from app.social.models import AuthorSubscription
from app.social.service import (
    author_payload, default_category, first_cut_image, normalize_nickname,
)
from app.storyboard.models import Cut
from app.users.models import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["social"])


def _get_own_episode(db: Session, episode_id: int, user: User) -> Episode:
    episode = (
        db.query(Episode)
        .join(Project, Episode.project_id == Project.id)
        .filter(
            Episode.id == episode_id,
            Episode.deleted_at == None,
            Project.deleted_at == None,
            Project.user_id == user.id,
        )
        .first()
    )
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    return episode


def _publish_state(episode: Episode) -> dict:
    return {
        "id": episode.id,
        "is_public": bool(episode.is_public),
        "featured": bool(episode.featured),
        "published_at": episode.published_at.isoformat() if episode.published_at else None,
        "share_token": episode.share_token,
        "showcase_category": episode.showcase_category,
    }


# ── 작가 공개 / 비공개 ───────────────────────────────────────

@router.post("/episodes/{episode_id}/publish")
def publish_episode(
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """본인 에피소드 공개. 닉네임 없으면 400 NICKNAME_REQUIRED(프론트가 닉네임 모달)."""
    episode = _get_own_episode(db, episode_id, current_user)

    if not current_user.nickname:
        raise HTTPException(status_code=400, detail="NICKNAME_REQUIRED")

    has_image = db.query(Cut.id).filter(
        Cut.episode_id == episode.id, Cut.image_url != None
    ).first()
    if not has_image:
        raise HTTPException(status_code=400, detail="이미지가 생성된 컷이 있어야 공개할 수 있어요")

    first_publish = episode.published_at is None
    episode.is_public = True
    if first_publish:
        episode.published_at = datetime.utcnow()
    if not episode.share_token:
        episode.share_token = str(uuid.uuid4())
    if not episode.showcase_category:
        episode.showcase_category = default_category(episode)

    db.commit()
    db.refresh(episode)
    logger.info("publish ep=%s user=%s first=%s", episode.id, current_user.id, first_publish)
    # 1b: first_publish일 때 구독자 알림(notify) 연결 예정
    return {**_publish_state(episode), "first_publish": first_publish}


@router.post("/episodes/{episode_id}/unpublish")
def unpublish_episode(
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """본인 에피소드 비공개. 랜딩 추천(featured)도 함께 내린다. share_token·published_at은 유지."""
    episode = _get_own_episode(db, episode_id, current_user)
    episode.is_public = False
    episode.featured = False
    episode.showcase = False  # 레거시 미러
    db.commit()
    db.refresh(episode)
    logger.info("unpublish ep=%s user=%s", episode.id, current_user.id)
    return _publish_state(episode)


# ── 작가 페이지 ──────────────────────────────────────────────

@router.get("/authors/{nickname}")
def get_author_page(
    nickname: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """작가 프로필 + 공개 작품(최신 공개순) + 구독자 수. 비로그인 열람 가능."""
    author = db.query(User).filter(User.nickname == normalize_nickname(nickname)).first()
    if not author:
        raise HTTPException(status_code=404, detail="작가를 찾을 수 없어요")

    rows = (
        db.query(Episode, Project)
        .join(Project, Episode.project_id == Project.id)
        .filter(
            Project.user_id == author.id,
            Project.deleted_at == None,
            Episode.is_public == True,
            Episode.deleted_at == None,
        )
        .order_by(Episode.published_at.desc(), Episode.id.desc())
        .all()
    )

    subscriber_count = db.query(func.count(AuthorSubscription.id)).filter(
        AuthorSubscription.author_id == author.id
    ).scalar()

    is_subscribed = False
    if current_user is not None and current_user.id != author.id:
        is_subscribed = db.query(AuthorSubscription.id).filter(
            AuthorSubscription.follower_id == current_user.id,
            AuthorSubscription.author_id == author.id,
        ).first() is not None

    return {
        "author": {**author_payload(author), "bio": author.bio},
        "subscriber_count": subscriber_count,
        "is_subscribed": is_subscribed,
        "is_me": current_user is not None and current_user.id == author.id,
        "works": [
            {
                "share_token": ep.share_token,
                "title": ep.title or proj.title,
                "genre": proj.genre,
                "category": ep.showcase_category or default_category(ep),
                "thumbnail_url": first_cut_image(db, ep.id),
                "view_count": ep.view_count,
                "like_count": ep.like_count,
                "published_at": ep.published_at.isoformat() if ep.published_at else None,
            }
            for ep, proj in rows
        ],
    }
