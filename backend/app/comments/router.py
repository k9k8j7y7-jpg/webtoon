"""댓글·답글·신고·차단 (지시서-구독알림 2단계)."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.admin.deps import require_admin
from app.auth.deps import get_current_user, get_optional_user
from app.comments.models import Comment, CommentReport, UserBlock
from app.database import get_db
from app.projects.models import Episode, Project
from app.social.service import author_payload, notify
from app.users.models import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["comments"])

MAX_BODY = 500
PAGE_SIZE = 30
REPORT_REASONS = {"spam": "스팸·광고", "abuse": "욕설·비방", "sexual": "음란·선정", "other": "기타"}
BLOCKED_DETAIL = "작성할 수 없어요"


def _public_episode(db: Session, episode_id: int, user: User | None) -> tuple[Episode, Project]:
    """댓글은 공개 에피소드에만 — 비공개면 소유자만 열람(작성은 공개 상태에서만)."""
    row = (
        db.query(Episode, Project)
        .join(Project, Episode.project_id == Project.id)
        .filter(Episode.id == episode_id, Episode.deleted_at == None, Project.deleted_at == None)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Episode not found")
    ep, proj = row
    if not ep.is_public and (user is None or user.id != proj.user_id):
        raise HTTPException(status_code=404, detail="Episode not found")
    return ep, proj


def _is_blocked(db: Session, author_id: int, user_id: int) -> bool:
    return db.query(UserBlock.id).filter(
        UserBlock.author_id == author_id, UserBlock.blocked_user_id == user_id
    ).first() is not None


def _comment_dict(c: Comment, users: dict, author_id: int, viewer: User | None) -> dict:
    gone = c.status != "visible"
    writer = users.get(c.user_id)
    can_delete = (
        not gone and viewer is not None
        and (viewer.id == c.user_id or viewer.id == author_id or bool(viewer.is_admin))
    )
    return {
        "id": c.id,
        "parent_id": c.parent_id,
        "body": None if gone else c.body,
        "status": c.status,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "user": None if gone else author_payload(writer),
        "is_author": not gone and c.user_id == author_id,  # "작가" 배지
        "is_mine": viewer is not None and viewer.id == c.user_id,
        "can_delete": can_delete,
        "can_block": (not gone and viewer is not None and viewer.id == author_id and c.user_id != author_id),
    }


# ── 목록 ─────────────────────────────────────────────────────

@router.get("/episodes/{episode_id}/comments")
def list_comments(
    episode_id: int,
    before: int | None = Query(None, description="이 id보다 오래된 최상위 댓글 (더 보기)"),
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
):
    """최상위 댓글 최신순 30개 + 각 답글(오래된순 전부). 삭제된 최상위 댓글은 답글이 있을 때만 자리 표시."""
    ep, proj = _public_episode(db, episode_id, viewer)

    q = db.query(Comment).filter(Comment.episode_id == ep.id, Comment.parent_id == None)
    if before:
        q = q.filter(Comment.id < before)
    tops = q.order_by(Comment.id.desc()).limit(PAGE_SIZE + 1).all()
    has_more = len(tops) > PAGE_SIZE
    tops = tops[:PAGE_SIZE]

    top_ids = [c.id for c in tops]
    replies = (
        db.query(Comment)
        .filter(Comment.parent_id.in_(top_ids), Comment.status == "visible")
        .order_by(Comment.id.asc())
        .all()
    ) if top_ids else []

    user_ids = {c.user_id for c in tops} | {r.user_id for r in replies}
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}

    by_parent: dict[int, list] = {}
    for r in replies:
        by_parent.setdefault(r.parent_id, []).append(_comment_dict(r, users, proj.user_id, viewer))

    items = []
    for c in tops:
        kids = by_parent.get(c.id, [])
        if c.status != "visible" and not kids:
            continue  # 답글 없는 삭제 댓글은 숨김
        items.append({**_comment_dict(c, users, proj.user_id, viewer), "replies": kids})

    blocked = viewer is not None and viewer.id != proj.user_id and _is_blocked(db, proj.user_id, viewer.id)
    return {
        "items": items,
        "has_more": has_more,
        "next_before": tops[-1].id if has_more and tops else None,
        "comment_count": ep.comment_count,
        "can_write": viewer is not None and ep.is_public and not blocked,
        "blocked": blocked,
    }


# ── 작성 ─────────────────────────────────────────────────────

class CommentCreate(BaseModel):
    body: str
    parent_id: int | None = None


@router.post("/episodes/{episode_id}/comments")
def create_comment(
    episode_id: int,
    req: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ep, proj = _public_episode(db, episode_id, current_user)
    if not ep.is_public:
        raise HTTPException(status_code=400, detail="공개된 작품에만 댓글을 쓸 수 있어요")
    if not current_user.nickname:
        raise HTTPException(status_code=400, detail="NICKNAME_REQUIRED")
    if current_user.id != proj.user_id and _is_blocked(db, proj.user_id, current_user.id):
        raise HTTPException(status_code=403, detail=BLOCKED_DETAIL)

    body = (req.body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="내용을 입력해 주세요")
    if len(body) > MAX_BODY:
        raise HTTPException(status_code=400, detail=f"{MAX_BODY}자 이내로 써 주세요")

    parent = None
    if req.parent_id is not None:
        parent = db.query(Comment).filter(Comment.id == req.parent_id, Comment.episode_id == ep.id).first()
        if not parent or parent.status != "visible":
            raise HTTPException(status_code=404, detail="원댓글을 찾을 수 없어요")
        if parent.parent_id is not None:
            raise HTTPException(status_code=400, detail="답글에는 답글을 달 수 없어요")

    comment = Comment(episode_id=ep.id, user_id=current_user.id, parent_id=parent.id if parent else None, body=body)
    db.add(comment)
    db.query(Episode).filter(Episode.id == ep.id).update({Episode.comment_count: Episode.comment_count + 1})
    db.flush()

    # 알림: 댓글 → 작가, 답글 → 원댓글 작성자 (자기 자신에게는 안 보냄)
    title = ep.title or proj.title or ""
    link = f"/view/{ep.share_token}#comment-{comment.id}"
    snippet = body[:80]
    if parent is None:
        if proj.user_id != current_user.id:
            notify(db, proj.user_id, "comment",
                   title=f"{current_user.nickname}님이 '{title}'에 댓글을 남겼어요",
                   body=snippet, link=link, actor_id=current_user.id)
    elif parent.user_id != current_user.id:
        notify(db, parent.user_id, "reply",
               title=f"{current_user.nickname}님이 내 댓글에 답글을 남겼어요",
               body=snippet, link=link, actor_id=current_user.id)

    db.commit()
    db.refresh(comment)
    logger.info("comment ep=%s id=%s user=%s parent=%s", ep.id, comment.id, current_user.id, comment.parent_id)
    users = {current_user.id: current_user}
    return {**_comment_dict(comment, users, proj.user_id, current_user), "replies": []}


# ── 삭제 ─────────────────────────────────────────────────────

def _soft_remove(db: Session, comment: Comment, status: str) -> None:
    """status 변경 + comment_count 감소(이미 사라진 댓글은 그대로)."""
    if comment.status == "visible":
        db.query(Episode).filter(Episode.id == comment.episode_id, Episode.comment_count > 0).update(
            {Episode.comment_count: Episode.comment_count - 1}
        )
    comment.status = status


@router.delete("/comments/{comment_id}")
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """본인·작품 작가·관리자. 관리자가 남의 댓글을 지우면 hidden, 그 외 deleted."""
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment or comment.status != "visible":
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없어요")
    author_id = db.query(Project.user_id).join(Episode, Episode.project_id == Project.id).filter(
        Episode.id == comment.episode_id
    ).scalar()

    is_owner = current_user.id == comment.user_id
    if not (is_owner or current_user.id == author_id or current_user.is_admin):
        raise HTTPException(status_code=403, detail="삭제할 권한이 없어요")

    by_admin_only = current_user.is_admin and not is_owner and current_user.id != author_id
    _soft_remove(db, comment, "hidden" if by_admin_only else "deleted")
    db.commit()
    logger.info("comment delete id=%s by=%s status=%s", comment.id, current_user.id, comment.status)
    return {"id": comment.id, "status": comment.status}


# ── 신고 ─────────────────────────────────────────────────────

class ReportCreate(BaseModel):
    reason: str


@router.post("/comments/{comment_id}/report")
def report_comment(
    comment_id: int,
    req: ReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if req.reason not in REPORT_REASONS:
        raise HTTPException(status_code=400, detail="신고 사유를 선택해 주세요")
    comment = db.query(Comment).filter(Comment.id == comment_id, Comment.status == "visible").first()
    if not comment:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없어요")
    if comment.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="내 댓글은 신고할 수 없어요")
    db.add(CommentReport(comment_id=comment.id, reporter_id=current_user.id, reason=req.reason))
    try:
        db.commit()
    except IntegrityError:  # 이미 신고함 — 같은 결과로 응답
        db.rollback()
    return {"reported": True}


# ── 차단 (작가 → 사용자) ─────────────────────────────────────

class BlockRequest(BaseModel):
    user_id: int


@router.post("/authors/block")
def block_user(
    req: BlockRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """현재 사용자(작가)가 user_id를 차단 — 내 작품 전체에 댓글·답글 불가. 기존 댓글은 그대로."""
    if req.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="나 자신은 차단할 수 없어요")
    if not db.query(User.id).filter(User.id == req.user_id).first():
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없어요")
    if not _is_blocked(db, current_user.id, req.user_id):
        db.add(UserBlock(author_id=current_user.id, blocked_user_id=req.user_id))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
    return {"blocked": True}


@router.delete("/authors/block")
def unblock_user(
    user_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(UserBlock).filter(
        UserBlock.author_id == current_user.id, UserBlock.blocked_user_id == user_id
    ).delete()
    db.commit()
    return {"blocked": False}


@router.get("/me/blocks")
def my_blocks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """내가 차단한 사용자 목록 (설정에서 해제용)."""
    rows = (
        db.query(User, UserBlock.created_at)
        .join(UserBlock, UserBlock.blocked_user_id == User.id)
        .filter(UserBlock.author_id == current_user.id)
        .order_by(UserBlock.created_at.desc())
        .all()
    )
    return [
        {**author_payload(u), "blocked_at": at.isoformat() if at else None}
        for u, at in rows
    ]


# ── 관리자: 신고 처리 ────────────────────────────────────────

@router.get("/admin/reports")
def admin_list_reports(
    status: str = Query("open", pattern="^(open|resolved|dismissed|all)$"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """신고를 댓글 단위로 묶어 반환 (신고 수·사유별 건수·최근 신고 시각)."""
    q = db.query(CommentReport)
    if status != "all":
        q = q.filter(CommentReport.status == status)
    reports = q.order_by(CommentReport.created_at.desc()).all()

    grouped: dict[int, dict] = {}
    for r in reports:
        g = grouped.setdefault(r.comment_id, {"comment_id": r.comment_id, "count": 0, "reasons": {},
                                              "last_reported_at": None, "statuses": set()})
        g["count"] += 1
        g["reasons"][r.reason] = g["reasons"].get(r.reason, 0) + 1
        g["statuses"].add(r.status)
        ts = r.created_at.isoformat() if r.created_at else None
        if ts and (g["last_reported_at"] is None or ts > g["last_reported_at"]):
            g["last_reported_at"] = ts

    if not grouped:
        return []
    comments = {c.id: c for c in db.query(Comment).filter(Comment.id.in_(grouped.keys())).all()}
    ep_ids = {c.episode_id for c in comments.values()}
    eps = {e.id: e for e in db.query(Episode).filter(Episode.id.in_(ep_ids)).all()}
    users = {u.id: u for u in db.query(User).filter(User.id.in_({c.user_id for c in comments.values()})).all()}

    result = []
    for cid, g in grouped.items():
        c = comments.get(cid)
        if not c:
            continue
        ep = eps.get(c.episode_id)
        writer = users.get(c.user_id)
        result.append({
            "comment_id": cid,
            "body": c.body,
            "comment_status": c.status,
            "writer": {"id": c.user_id, "nickname": writer.nickname if writer else None,
                       "email": writer.email if writer else None},
            "episode": {"id": c.episode_id, "title": ep.title if ep else None,
                        "share_token": ep.share_token if ep else None},
            "count": g["count"],
            "reasons": {REPORT_REASONS.get(k, k): v for k, v in g["reasons"].items()},
            "status": "open" if "open" in g["statuses"] else sorted(g["statuses"])[0],
            "last_reported_at": g["last_reported_at"],
        })
    result.sort(key=lambda x: (x["status"] != "open", -(x["count"])))
    return result


class ReportAction(BaseModel):
    action: str  # delete | dismiss


@router.post("/admin/reports/{comment_id}/resolve")
def admin_resolve_report(
    comment_id: int,
    req: ReportAction,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """댓글 단위 처리 — delete: 댓글 숨김(hidden) + 열린 신고 resolved / dismiss: 열린 신고 dismissed."""
    if req.action not in ("delete", "dismiss"):
        raise HTTPException(status_code=400, detail="action은 delete 또는 dismiss")
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없어요")

    if req.action == "delete":
        _soft_remove(db, comment, "hidden")
    new_status = "resolved" if req.action == "delete" else "dismissed"
    updated = db.query(CommentReport).filter(
        CommentReport.comment_id == comment_id, CommentReport.status == "open"
    ).update({CommentReport.status: new_status}, synchronize_session=False)
    db.commit()
    logger.info("report resolve comment=%s action=%s reports=%s by=%s", comment_id, req.action, updated, admin.id)
    return {"comment_id": comment_id, "comment_status": comment.status, "reports_updated": updated}
