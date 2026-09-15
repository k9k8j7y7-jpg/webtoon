import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.database import get_db
from app.admin.deps import require_admin
from app.users.models import User
from app.projects.models import Episode, Project
from app.storyboard.models import GenerationLog
from app.packets.service import grant_packets
from app.notices.models import Notice

router = APIRouter(prefix="/admin", tags=["admin"])


# ── 1단계: 운영 대시보드 ─────────────────────────────────────

@router.get("/stats")
def get_admin_stats(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """운영 대시보드 통계."""
    today_start = datetime.combine(date.today(), datetime.min.time())

    total_users = db.query(func.count(User.id)).scalar()

    today_signups = db.query(func.count(User.id)).filter(
        User.created_at >= today_start
    ).scalar()

    today_generations = db.query(func.count(GenerationLog.id)).filter(
        GenerationLog.created_at >= today_start
    ).scalar()

    row = db.execute(
        text("SELECT COALESCE(SUM(amount), 0) FROM orders WHERE status = 'paid'")
    ).scalar()
    total_revenue = int(row)

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


# ── 2단계: 갤러리 노출 관리 ──────────────────────────────────

@router.get("/episodes")
def list_all_episodes(
    project_id: int | None = Query(None),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """관리자용 전체 에피소드 목록 (프로젝트 필터 가능)."""
    q = (
        db.query(Episode, Project)
        .join(Project, Episode.project_id == Project.id)
        .filter(Episode.deleted_at == None)
    )
    if project_id is not None:
        q = q.filter(Episode.project_id == project_id)

    episodes = q.order_by(Episode.id.desc()).all()

    return [
        {
            "id": ep.id,
            "title": ep.title or proj.title,
            "project_id": proj.id,
            "project_title": proj.title,
            "gate_status": ep.gate_status,
            "showcase": bool(ep.showcase),
            "showcase_category": ep.showcase_category,
            "share_token": ep.share_token,
            "view_count": ep.view_count,
            "like_count": ep.like_count,
        }
        for ep, proj in episodes
    ]


@router.get("/projects")
def list_projects_for_filter(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """프로젝트 필터 드롭다운용 목록."""
    projects = (
        db.query(Project)
        .filter(Project.deleted_at == None)
        .order_by(Project.id.desc())
        .all()
    )
    return [{"id": p.id, "title": p.title} for p in projects]


class ShowcaseToggleRequest(BaseModel):
    showcase: bool
    showcase_category: str | None = None


@router.post("/episodes/{episode_id}/showcase")
def toggle_showcase(
    episode_id: int,
    req: ShowcaseToggleRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """에피소드 showcase 노출 토글 + 카테고리 설정."""
    episode = db.query(Episode).filter(
        Episode.id == episode_id, Episode.deleted_at == None
    ).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    # 카테고리 검증
    valid_categories = {"short", "series", "ad"}
    if req.showcase and req.showcase_category and req.showcase_category not in valid_categories:
        raise HTTPException(status_code=400, detail=f"Invalid category: {req.showcase_category}")

    episode.showcase = req.showcase

    if req.showcase:
        episode.showcase_category = req.showcase_category or "short"
        # share_token 없으면 자동 생성
        if not episode.share_token:
            episode.share_token = str(uuid.uuid4())
    else:
        # 노출 해제 시 카테고리는 유지 (재노출 시 편의), share_token도 유지
        pass

    db.commit()
    db.refresh(episode)

    return {
        "id": episode.id,
        "showcase": bool(episode.showcase),
        "showcase_category": episode.showcase_category,
        "share_token": episode.share_token,
    }


# ── 3단계: 패킷 운영 ────────────────────────────────────────

@router.get("/users")
def list_users(
    search: str | None = Query(None),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """회원 목록 (닉네임/이메일 검색 가능, 패킷 잔량 포함)."""
    q = db.query(User).order_by(User.id.desc())
    if search:
        like = f"%{search}%"
        q = q.filter(
            (User.display_name.like(like)) | (User.email.like(like))
        )
    users = q.all()

    # 패킷 잔량 일괄 조회
    balances = {}
    if users:
        uids = [u.id for u in users]
        rows = db.execute(
            text("SELECT user_id, balance FROM packet_balances WHERE user_id IN :uids"),
            {"uids": tuple(uids)},
        ).fetchall()
        balances = {r[0]: r[1] for r in rows}

    return [
        {
            "id": u.id,
            "display_name": u.display_name,
            "email": u.email,
            "provider": u.provider,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "balance": balances.get(u.id, 0),
        }
        for u in users
    ]


class PacketGrantRequest(BaseModel):
    user_id: int
    amount: int
    memo: str = ""


@router.post("/packets/grant")
def admin_grant_packets(
    req: PacketGrantRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """관리자 패킷 지급/차감. amount > 0 지급, < 0 차감."""
    if req.amount == 0:
        raise HTTPException(status_code=400, detail="수량은 0이 아니어야 합니다")

    target = db.query(User).filter(User.id == req.user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="회원을 찾을 수 없습니다")

    if req.amount > 0:
        new_balance = grant_packets(req.user_id, req.amount, db)
    else:
        # 차감: charge_packets는 402를 던질 수 있음 — 관리자 차감은 음수 허용
        from app.packets.service import _ensure_balance
        _ensure_balance(req.user_id, db)
        row = db.execute(
            text("SELECT balance FROM packet_balances WHERE user_id = :uid FOR UPDATE"),
            {"uid": req.user_id},
        ).fetchone()
        new_balance = row[0] + req.amount  # amount is negative
        if new_balance < 0:
            new_balance = 0
        db.execute(
            text("UPDATE packet_balances SET balance = :bal WHERE user_id = :uid"),
            {"bal": new_balance, "uid": req.user_id},
        )
        db.execute(
            text(
                "INSERT INTO packet_transactions (user_id, delta, reason, ref_log_id, balance_after) "
                "VALUES (:uid, :delta, 'admin_grant', NULL, :bal)"
            ),
            {"uid": req.user_id, "delta": req.amount, "bal": new_balance},
        )

    db.commit()
    return {
        "user_id": req.user_id,
        "delta": req.amount,
        "balance": new_balance,
    }


@router.get("/orders")
def list_orders(
    status_filter: str | None = Query(None),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """주문 목록 (상태 필터 가능)."""
    sql = (
        "SELECT o.id, o.order_id, o.user_id, u.display_name, o.product_code, "
        "o.amount, o.packet_delta, o.status, o.paid_at, o.created_at "
        "FROM orders o JOIN users u ON o.user_id = u.id "
    )
    params = {}

    if status_filter and status_filter in ("pending", "paid", "failed", "cancelled"):
        sql += "WHERE o.status = :status "
        params["status"] = status_filter

    sql += "ORDER BY o.created_at DESC LIMIT 200"

    rows = db.execute(text(sql), params).fetchall()

    # pending 건수
    pending_count = db.execute(
        text("SELECT COUNT(*) FROM orders WHERE status = 'pending'")
    ).scalar()

    return {
        "pending_count": pending_count,
        "orders": [
            {
                "id": r[0],
                "order_id": r[1],
                "user_id": r[2],
                "user_name": r[3],
                "product_code": r[4],
                "amount": r[5],
                "packet_delta": r[6],
                "status": r[7],
                "paid_at": r[8].isoformat() if r[8] else None,
                "created_at": r[9].isoformat() if r[9] else None,
            }
            for r in rows
        ],
    }


@router.post("/orders/expire-pending")
def expire_pending_orders(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """24시간 이상 된 pending 주문을 일괄 만료(failed) 처리."""
    cutoff = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    result = db.execute(
        text(
            "UPDATE orders SET status = 'failed' "
            "WHERE status = 'pending' AND created_at < :cutoff"
        ),
        {"cutoff": cutoff},
    )
    db.commit()
    return {"expired_count": result.rowcount}


# ── 4단계: 공지 관리 ─────────────────────────────────────────

def _notice_to_dict(n: Notice) -> dict:
    return {
        "id": n.id,
        "title": n.title,
        "body": n.body,
        "notice_type": n.notice_type,
        "is_active": bool(n.is_active),
        "starts_at": n.starts_at.isoformat() if n.starts_at else None,
        "ends_at": n.ends_at.isoformat() if n.ends_at else None,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


@router.get("/notices")
def list_notices(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """공지 전체 목록 (최신순)."""
    notices = db.query(Notice).order_by(Notice.id.desc()).all()
    return [_notice_to_dict(n) for n in notices]


class NoticeCreateRequest(BaseModel):
    title: str
    body: str = ""
    notice_type: str = "info"
    is_active: bool = True
    starts_at: str | None = None
    ends_at: str | None = None


@router.post("/notices")
def create_notice(
    req: NoticeCreateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """공지 등록. 활성화 시 기존 활성 공지 자동 비활성."""
    valid_types = {"info", "warning", "maintenance", "update"}
    if req.notice_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid type: {req.notice_type}")

    # 활성 공지 1건 원칙: 새 공지 활성화 시 기존 활성 공지 전부 비활성
    if req.is_active:
        db.query(Notice).filter(Notice.is_active == True).update(
            {Notice.is_active: False}
        )

    notice = Notice(
        title=req.title,
        body=req.body,
        notice_type=req.notice_type,
        is_active=req.is_active,
        starts_at=datetime.fromisoformat(req.starts_at) if req.starts_at else datetime.utcnow(),
        ends_at=datetime.fromisoformat(req.ends_at) if req.ends_at else None,
    )
    db.add(notice)
    db.commit()
    db.refresh(notice)
    return _notice_to_dict(notice)


class NoticeUpdateRequest(BaseModel):
    title: str | None = None
    body: str | None = None
    notice_type: str | None = None
    is_active: bool | None = None
    starts_at: str | None = None
    ends_at: str | None = None


@router.post("/notices/{notice_id}")
def update_notice(
    notice_id: int,
    req: NoticeUpdateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """공지 수정. 활성화 시 기존 활성 공지 자동 비활성."""
    notice = db.query(Notice).filter(Notice.id == notice_id).first()
    if not notice:
        raise HTTPException(status_code=404, detail="Notice not found")

    valid_types = {"info", "warning", "maintenance", "update"}

    # 활성화 토글: 기존 활성 공지 비활성
    if req.is_active is True and not notice.is_active:
        db.query(Notice).filter(
            Notice.is_active == True, Notice.id != notice_id
        ).update({Notice.is_active: False})

    if req.title is not None:
        notice.title = req.title
    if req.body is not None:
        notice.body = req.body
    if req.notice_type is not None and req.notice_type in valid_types:
        notice.notice_type = req.notice_type
    if req.is_active is not None:
        notice.is_active = req.is_active
    if req.starts_at is not None:
        notice.starts_at = datetime.fromisoformat(req.starts_at)
    if req.ends_at is not None:
        notice.ends_at = datetime.fromisoformat(req.ends_at) if req.ends_at else None

    db.commit()
    db.refresh(notice)
    return _notice_to_dict(notice)
