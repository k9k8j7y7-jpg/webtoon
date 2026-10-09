"""작가·공개 공용 헬퍼 — showcase(갤러리·뷰어)·admin·social 라우터가 함께 쓴다."""

import re
import unicodedata

from sqlalchemy.orm import Session

from app.projects.models import Episode
from app.storyboard.models import Cut
from app.users.models import User

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
        return {"nickname": None, "avatar": None}
    return {"nickname": user.nickname, "avatar": user.avatar_path}


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
