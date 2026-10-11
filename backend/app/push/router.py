"""웹푸시 구독·알림 설정 (지시서-구독알림 3단계)."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.config import get_settings
from app.database import get_db
from app.push.models import PushSubscription
from app.push.service import merged_prefs, push_enabled
from app.users.models import DEFAULT_NOTIFY_PREFS, User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["push"])


@router.get("/push/public-key")
def get_public_key():
    """브라우저 구독(applicationServerKey)용 VAPID 공개키. 미설정이면 enabled=false."""
    return {"enabled": push_enabled(), "public_key": get_settings().VAPID_PUBLIC or None}


class SubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class SubscribeBody(BaseModel):
    endpoint: str
    keys: SubscriptionKeys


class UnsubscribeBody(BaseModel):
    endpoint: str


@router.post("/push/subscribe")
def subscribe(
    body: SubscribeBody,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """PushSubscription.toJSON() 그대로 받는다. 같은 endpoint면 갱신(기기에서 다른 계정으로 로그인한 경우 소유자 이전)."""
    endpoint = body.endpoint.strip()
    if not endpoint.startswith("https://") or len(endpoint) > 500:
        raise HTTPException(status_code=400, detail="잘못된 구독 정보예요")
    if len(body.keys.p256dh) > 200 or len(body.keys.auth) > 100:
        raise HTTPException(status_code=400, detail="잘못된 구독 정보예요")

    ua = (request.headers.get("user-agent") or "")[:300] or None
    sub = db.query(PushSubscription).filter(PushSubscription.endpoint == endpoint).first()
    if sub:
        sub.user_id = current_user.id
        sub.p256dh = body.keys.p256dh
        sub.auth = body.keys.auth
        sub.user_agent = ua
    else:
        db.add(PushSubscription(
            user_id=current_user.id, endpoint=endpoint,
            p256dh=body.keys.p256dh, auth=body.keys.auth, user_agent=ua,
        ))
    db.commit()
    logger.info("push subscribe user=%s new=%s", current_user.id, sub is None)
    return {"subscribed": True}


@router.delete("/push/subscribe")
def unsubscribe(
    body: UnsubscribeBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """본인 구독만 삭제. 없으면 그대로 성공(멱등)."""
    deleted = (
        db.query(PushSubscription)
        .filter(PushSubscription.endpoint == body.endpoint.strip(), PushSubscription.user_id == current_user.id)
        .delete(synchronize_session=False)
    )
    db.commit()
    logger.info("push unsubscribe user=%s deleted=%s", current_user.id, deleted)
    return {"subscribed": False}


@router.get("/me/notify-prefs")
def get_notify_prefs(current_user: User = Depends(get_current_user)):
    return merged_prefs(current_user)


@router.put("/me/notify-prefs")
def update_notify_prefs(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """부분 갱신 — 알려진 키(new_episode·comment·reply·inquiry)의 bool만 반영."""
    prefs = merged_prefs(current_user)
    for key, value in body.items():
        if key not in DEFAULT_NOTIFY_PREFS:
            raise HTTPException(status_code=400, detail=f"알 수 없는 알림 종류: {key}")
        if not isinstance(value, bool):
            raise HTTPException(status_code=400, detail="true/false 값만 쓸 수 있어요")
        prefs[key] = value
    current_user.notify_prefs = prefs  # 새 dict 할당 — JSON 컬럼 변경 감지
    db.commit()
    return prefs
