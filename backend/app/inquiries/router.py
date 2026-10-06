"""1:1 문의 게시판 API."""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.deps import get_current_user
from app.admin.deps import require_admin
from app.users.models import User
from app.inquiries.models import Inquiry, InquiryMessage
from app.image_util import validate_and_process
from app.storage import upload_image

router = APIRouter(tags=["inquiries"])

VALID_CATEGORIES = {"bug", "howto", "payment", "feature", "other"}
VALID_STATUSES = {"received", "checking", "answered", "closed"}
CATEGORY_LABELS = {
    "bug": "버그·오류",
    "howto": "사용법",
    "payment": "결제·패킷",
    "feature": "기능 제안",
    "other": "기타",
}
STATUS_LABELS = {
    "received": "접수",
    "checking": "확인 중",
    "answered": "답변 완료",
    "closed": "종료",
}


def _inquiry_to_dict(inq: Inquiry, include_device: bool = False) -> dict:
    d = {
        "id": inq.id,
        "user_id": inq.user_id,
        "category": inq.category,
        "category_label": CATEGORY_LABELS.get(inq.category, inq.category),
        "title": inq.title,
        "content": inq.content,
        "episode_id": inq.episode_id,
        "status": inq.status,
        "status_label": STATUS_LABELS.get(inq.status, inq.status),
        "satisfaction": inq.satisfaction,
        "attachments": inq.attachments or [],
        "answered_at": inq.answered_at.isoformat() if inq.answered_at else None,
        "user_read_at": inq.user_read_at.isoformat() if inq.user_read_at else None,
        "created_at": inq.created_at.isoformat() if inq.created_at else None,
        "updated_at": inq.updated_at.isoformat() if inq.updated_at else None,
    }
    if include_device:
        d["device_info"] = inq.device_info
    return d


def _message_to_dict(msg: InquiryMessage) -> dict:
    return {
        "id": msg.id,
        "inquiry_id": msg.inquiry_id,
        "user_id": msg.user_id,
        "is_admin": bool(msg.is_admin),
        "body": msg.body,
        "attachments": msg.attachments or [],
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
    }


# ── 사용자 API ──────────────────────────────────────────


@router.post("/inquiries")
async def create_inquiry(
    category: str = Form(...),
    title: str = Form(...),
    content: str = Form(...),
    episode_id: Optional[int] = Form(None),
    device_ua: Optional[str] = Form(None),
    device_type: Optional[str] = Form(None),
    screen_width: Optional[int] = Form(None),
    files: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """문의 등록 (FormData multipart — 첨부 최대 3장)."""
    if category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"잘못된 카테고리: {category}")
    if not title.strip():
        raise HTTPException(status_code=400, detail="제목을 입력해 주세요.")
    if not content.strip():
        raise HTTPException(status_code=400, detail="내용을 입력해 주세요.")
    if len(files) > 3:
        raise HTTPException(status_code=400, detail="스크린샷은 최대 3장까지 첨부할 수 있어요.")

    # 문의 생성
    device_info = None
    if device_ua or device_type or screen_width:
        device_info = {
            "ua": device_ua,
            "device_type": device_type,
            "screen_width": screen_width,
        }

    inquiry = Inquiry(
        user_id=current_user.id,
        category=category,
        title=title.strip(),
        content=content.strip(),
        episode_id=episode_id,
        device_info=device_info,
    )
    db.add(inquiry)
    db.flush()  # id 확보

    # 첨부 업로드
    attachment_urls = []
    for f in files:
        raw = await f.read()
        processed, mime = validate_and_process(raw)
        url = upload_image(processed, f"inquiries/{inquiry.id}/attachments", mime_type=mime)
        attachment_urls.append(url)

    if attachment_urls:
        inquiry.attachments = attachment_urls

    db.commit()
    db.refresh(inquiry)
    return _inquiry_to_dict(inquiry)


@router.get("/inquiries")
async def list_my_inquiries(
    period: str = Query("all", regex="^(1w|1m|3m|all)$"),
    category: Optional[str] = Query(None),
    inquiry_status: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """내 문의 목록 (기간·카테고리·상태 필터)."""
    q = db.query(Inquiry).filter(Inquiry.user_id == current_user.id)

    if period != "all":
        days = {"1w": 7, "1m": 30, "3m": 90}[period]
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        q = q.filter(Inquiry.created_at >= cutoff)
    if category and category in VALID_CATEGORIES:
        q = q.filter(Inquiry.category == category)
    if inquiry_status and inquiry_status in VALID_STATUSES:
        q = q.filter(Inquiry.status == inquiry_status)

    inquiries = q.order_by(Inquiry.created_at.desc()).all()
    return [_inquiry_to_dict(inq) for inq in inquiries]


@router.get("/inquiries/unread-count")
async def get_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """관리자 답변 후 사용자가 아직 안 읽은 문의 건수."""
    count = (
        db.query(func.count(Inquiry.id))
        .filter(
            Inquiry.user_id == current_user.id,
            Inquiry.answered_at.isnot(None),
            (Inquiry.user_read_at.is_(None)) | (Inquiry.user_read_at < Inquiry.answered_at),
        )
        .scalar()
    )
    return {"unread_count": count}


@router.get("/inquiries/{inquiry_id}")
async def get_inquiry_detail(
    inquiry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """문의 상세 + 메시지 목록. 본인만 조회 가능."""
    inquiry = db.query(Inquiry).filter(Inquiry.id == inquiry_id).first()
    if not inquiry:
        raise HTTPException(status_code=404, detail="문의를 찾을 수 없습니다.")
    if inquiry.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="권한이 없습니다.")

    messages = (
        db.query(InquiryMessage)
        .filter(InquiryMessage.inquiry_id == inquiry_id)
        .order_by(InquiryMessage.created_at.asc())
        .all()
    )

    # 읽음 처리
    if inquiry.user_id == current_user.id and inquiry.answered_at:
        inquiry.user_read_at = datetime.now(timezone.utc)
        db.commit()

    result = _inquiry_to_dict(inquiry, include_device=current_user.is_admin)
    result["messages"] = [_message_to_dict(m) for m in messages]
    return result


@router.post("/inquiries/{inquiry_id}/messages")
async def add_message(
    inquiry_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """사용자 추가 댓글 또는 관리자 답변."""
    inquiry = db.query(Inquiry).filter(Inquiry.id == inquiry_id).first()
    if not inquiry:
        raise HTTPException(status_code=404, detail="문의를 찾을 수 없습니다.")

    is_admin = bool(current_user.is_admin)
    if not is_admin and inquiry.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="권한이 없습니다.")

    text = (body.get("body") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="내용을 입력해 주세요.")

    msg = InquiryMessage(
        inquiry_id=inquiry_id,
        user_id=current_user.id,
        is_admin=1 if is_admin else 0,
        body=text,
    )
    db.add(msg)

    # 관리자 답변이면 상태·시간 갱신
    if is_admin:
        inquiry.status = "answered"
        inquiry.answered_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(msg)
    return _message_to_dict(msg)


@router.post("/inquiries/{inquiry_id}/satisfaction")
async def set_satisfaction(
    inquiry_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """만족도 설정 (1=good, -1=bad). 본인만, 1회."""
    inquiry = db.query(Inquiry).filter(Inquiry.id == inquiry_id).first()
    if not inquiry:
        raise HTTPException(status_code=404, detail="문의를 찾을 수 없습니다.")
    if inquiry.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="권한이 없습니다.")
    if inquiry.satisfaction is not None:
        raise HTTPException(status_code=400, detail="이미 평가하셨습니다.")

    value = body.get("satisfaction")
    if value not in (1, -1):
        raise HTTPException(status_code=400, detail="satisfaction은 1(좋아요) 또는 -1(아쉬워요)이어야 합니다.")

    inquiry.satisfaction = value
    db.commit()
    return {"status": "ok", "satisfaction": value}


# ── 관리자 API ──────────────────────────────────────────


@router.get("/admin/inquiries")
async def admin_list_inquiries(
    period: str = Query("all", regex="^(1w|1m|3m|all)$"),
    category: Optional[str] = Query(None),
    inquiry_status: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """관리자: 전체 문의 목록 + 미답변 건수."""
    q = db.query(Inquiry)

    if period != "all":
        days = {"1w": 7, "1m": 30, "3m": 90}[period]
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        q = q.filter(Inquiry.created_at >= cutoff)
    if category and category in VALID_CATEGORIES:
        q = q.filter(Inquiry.category == category)
    if inquiry_status and inquiry_status in VALID_STATUSES:
        q = q.filter(Inquiry.status == inquiry_status)

    inquiries = q.order_by(Inquiry.created_at.desc()).all()

    unanswered = (
        db.query(func.count(Inquiry.id))
        .filter(Inquiry.status.in_(["received", "checking"]))
        .scalar()
    )

    return {
        "inquiries": [_inquiry_to_dict(inq, include_device=True) for inq in inquiries],
        "unanswered_count": unanswered,
    }


@router.post("/admin/inquiries/{inquiry_id}/status")
async def admin_update_status(
    inquiry_id: int,
    body: dict,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """관리자: 문의 상태 변경."""
    inquiry = db.query(Inquiry).filter(Inquiry.id == inquiry_id).first()
    if not inquiry:
        raise HTTPException(status_code=404, detail="문의를 찾을 수 없습니다.")

    new_status = body.get("status")
    if new_status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"잘못된 상태: {new_status}")

    inquiry.status = new_status
    if new_status == "answered" and not inquiry.answered_at:
        inquiry.answered_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": new_status}
