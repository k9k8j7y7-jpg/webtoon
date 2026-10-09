"""작가 공개·작가 페이지 (지시서-구독알림 1a)."""

import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, get_optional_user
from app.database import get_db
from app.projects.models import Episode, Project
from app.social.models import AuthorSubscription, Notification
from app.social.service import (
    author_payload, default_category, first_cut_image, normalize_nickname, notify_followers,
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

    # 새 화 알림은 최초 공개 1회만 (비공개→재공개는 published_at이 남아 있어 알림 없음)
    notified = 0
    if first_publish:
        title = episode.title or db.query(Project.title).filter(Project.id == episode.project_id).scalar() or ""
        notified = notify_followers(db, current_user, episode, title)

    db.commit()
    db.refresh(episode)
    logger.info("publish ep=%s user=%s first=%s notified=%s", episode.id, current_user.id, first_publish, notified)
    return {**_publish_state(episode), "first_publish": first_publish, "notified": notified}


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


# ── 구독 ─────────────────────────────────────────────────────

def _subscriber_count(db: Session, author_id: int) -> int:
    return db.query(func.count(AuthorSubscription.id)).filter(
        AuthorSubscription.author_id == author_id
    ).scalar()


@router.post("/authors/{author_id}/subscribe")
def subscribe_author(
    author_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if author_id == current_user.id:
        raise HTTPException(status_code=400, detail="내 작가 페이지는 구독할 수 없어요")
    author = db.query(User).filter(User.id == author_id, User.nickname != None).first()
    if not author:
        raise HTTPException(status_code=404, detail="작가를 찾을 수 없어요")
    exists = db.query(AuthorSubscription.id).filter(
        AuthorSubscription.follower_id == current_user.id,
        AuthorSubscription.author_id == author_id,
    ).first()
    if not exists:
        db.add(AuthorSubscription(follower_id=current_user.id, author_id=author_id))
        try:
            db.commit()
        except IntegrityError:  # 연타 경합 — 이미 구독됨
            db.rollback()
    return {"subscribed": True, "subscriber_count": _subscriber_count(db, author_id)}


@router.delete("/authors/{author_id}/subscribe")
def unsubscribe_author(
    author_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(AuthorSubscription).filter(
        AuthorSubscription.follower_id == current_user.id,
        AuthorSubscription.author_id == author_id,
    ).delete()
    db.commit()
    return {"subscribed": False, "subscriber_count": _subscriber_count(db, author_id)}


@router.get("/me/subscriptions")
def my_subscriptions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """구독 작가 목록(최근 구독순) + 새 화 피드(구독 작가 공개작, published_at 최신순 50편)."""
    authors = (
        db.query(User, AuthorSubscription.created_at)
        .join(AuthorSubscription, AuthorSubscription.author_id == User.id)
        .filter(AuthorSubscription.follower_id == current_user.id)
        .order_by(AuthorSubscription.created_at.desc())
        .all()
    )
    author_ids = [u.id for u, _ in authors]
    by_id = {u.id: u for u, _ in authors}

    feed = []
    if author_ids:
        rows = (
            db.query(Episode, Project)
            .join(Project, Episode.project_id == Project.id)
            .filter(
                Project.user_id.in_(author_ids),
                Project.deleted_at == None,
                Episode.is_public == True,
                Episode.deleted_at == None,
            )
            .order_by(Episode.published_at.desc(), Episode.id.desc())
            .limit(50)
            .all()
        )
        feed = [
            {
                "share_token": ep.share_token,
                "title": ep.title or proj.title,
                "category": ep.showcase_category or default_category(ep),
                "thumbnail_url": first_cut_image(db, ep.id),
                "published_at": ep.published_at.isoformat() if ep.published_at else None,
                "author": author_payload(by_id[proj.user_id]),
            }
            for ep, proj in rows
        ]

    return {
        "authors": [
            {**author_payload(u), "bio": u.bio, "subscribed_at": at.isoformat() if at else None}
            for u, at in authors
        ],
        "feed": feed,
    }


# ── 알림센터 ─────────────────────────────────────────────────

def _notification_dict(n: Notification, actors: dict) -> dict:
    return {
        "id": n.id,
        "type": n.type,
        "title": n.title,
        "body": n.body,
        "link": n.link,
        "is_read": bool(n.is_read),
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "actor": author_payload(actors.get(n.actor_id)) if n.actor_id else None,
    }


def _unread_count(db: Session, user_id: int) -> int:
    return db.query(func.count(Notification.id)).filter(
        Notification.user_id == user_id, Notification.is_read == False
    ).scalar()


@router.get("/notifications")
def list_notifications(
    limit: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    limit = max(1, min(limit, 100))
    items = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(limit)
        .all()
    )
    actor_ids = {n.actor_id for n in items if n.actor_id}
    actors = {u.id: u for u in db.query(User).filter(User.id.in_(actor_ids)).all()} if actor_ids else {}
    return {
        "items": [_notification_dict(n, actors) for n in items],
        "unread_count": _unread_count(db, current_user.id),
    }


@router.get("/notifications/unread-count")
def notifications_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {"unread_count": _unread_count(db, current_user.id)}


@router.post("/notifications/read-all")
def read_all_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(Notification).filter(
        Notification.user_id == current_user.id, Notification.is_read == False
    ).update({Notification.is_read: True}, synchronize_session=False)
    db.commit()
    return {"unread_count": 0}


@router.post("/notifications/{notification_id}/read")
def read_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(Notification).filter(
        Notification.id == notification_id, Notification.user_id == current_user.id
    ).update({Notification.is_read: True}, synchronize_session=False)
    db.commit()
    return {"unread_count": _unread_count(db, current_user.id)}
