"""작가·공개 공용 헬퍼 — showcase(갤러리·뷰어)·admin·social 라우터가 함께 쓴다."""

import logging
import re
import unicodedata

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.projects.models import Episode
from app.social.models import Notification
from app.storyboard.models import Cut
from app.users.models import User

logger = logging.getLogger(__name__)

NICKNAME_RE = re.compile(r"^[가-힣A-Za-z0-9_]{2,20}$")
RESERVED_NICKNAMES = {"admin", "관리자", "운영자", "ezitoon", "이지툰", "작가"}


def normalize_nickname(raw: str) -> str:
    return unicodedata.normalize("NFC", (raw or "").strip())


def validate_nickname(nickname: str) -> str | None:
    """형식 오류 메시지 반환, 통과면 None."""
    if not NICKNAME_RE.match(nickname):
        return "닉네임은 2~20자 한글·영문·숫자·밑줄(_)만 쓸 수 있어요"
    if nickname.lower() in RESERVED_NICKNAMES:
        return "사용할 수 없는 닉네임이에요"
    return None


def author_payload(user: User | None) -> dict:
    """공개 화면용 작가 정보. 실명(display_name)·user_id는 노출하지 않는다."""
    if user is None:
        return {"id": None, "nickname": None, "avatar": None}
    return {"id": user.id, "nickname": user.nickname, "avatar": user.avatar_path}


# ── 알림 단일 진입점 ─────────────────────────────────────────
# 모든 알림(새 화·댓글·답글·문의 답변)은 notify()/notify_followers()로만 만든다.
# commit은 호출부 트랜잭션에 맡긴다(알림만 남고 본 작업이 롤백되는 일 방지).

def notify(
    db: Session,
    user_id: int,
    type: str,
    title: str,
    body: str | None = None,
    link: str | None = None,
    actor_id: int | None = None,
) -> None:
    db.add(Notification(
        user_id=user_id, type=type, title=title[:200],
        body=(body or None) and body[:500], link=link, actor_id=actor_id,
    ))


def notify_followers(db: Session, author: User, episode: Episode, title: str) -> int:
    """작가 구독자 전원에게 새 화 알림 — INSERT … SELECT 한 번(구독자 수와 무관하게 단일 쿼리)."""
    nickname = author.nickname or "작가"
    result = db.execute(
        text(
            "INSERT INTO notifications (user_id, type, title, body, link, actor_id) "
            "SELECT follower_id, 'new_episode', :title, :body, :link, :actor "
            "FROM author_subscriptions WHERE author_id = :actor"
        ),
        {
            "title": f"{nickname} 작가의 새 웹툰",
            "body": f"'{title}'"[:500],
            "link": f"/view/{episode.share_token}",
            "actor": author.id,
        },
    )
    count = result.rowcount or 0
    logger.info("notify_followers author=%s ep=%s count=%s", author.id, episode.id, count)
    return count


def default_category(episode: Episode) -> str:
    """갤러리 카테고리 자동 결정 (광고 > 연작 > 단편)."""
    if (episode.gate_status or {}).get("is_ad"):
        return "ad"
    if episode.series_id:
        return "series"
    return "short"


def first_cut_image(db: Session, episode_id: int) -> str | None:
    cut = (
        db.query(Cut)
        .filter(Cut.episode_id == episode_id, Cut.image_url != None)
        .order_by(Cut.cut_number)
        .first()
    )
    return cut.image_url if cut else None
