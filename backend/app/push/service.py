"""웹푸시 발송 — notify()/notify_followers()가 BackgroundTasks로 호출한다.

응답을 보낸 뒤(본 트랜잭션 commit 후) 별도 세션으로 실행되므로 실패해도 본 작업·알림센터 기록에는 영향 없다.
"""

import json
import logging

from pywebpush import WebPushException, webpush

from app.config import get_settings
from app.database import SessionLocal
from app.push.models import PushSubscription
from app.users.models import DEFAULT_NOTIFY_PREFS, User

logger = logging.getLogger(__name__)

APP_BASE = "/WEBTOON"  # 알림 link는 라우터 경로(/view/…) — 서비스워커가 열 실제 URL은 서브 경로 포함
PUSH_ICON = f"{APP_BASE}/icons/icon-192.png"
PUSH_TTL = 60 * 60 * 24  # 기기가 꺼져 있으면 하루까지 보관

# 알림 type → notify_prefs 키 (목록에 없는 type은 항상 발송)
PREF_KEY_BY_TYPE = {
    "new_episode": "new_episode",
    "comment": "comment",
    "reply": "reply",
    "inquiry_answer": "inquiry",
}


def push_enabled() -> bool:
    s = get_settings()
    return bool(s.VAPID_PUBLIC and s.VAPID_PRIVATE and s.VAPID_SUBJECT)


def merged_prefs(user: User) -> dict:
    prefs = dict(DEFAULT_NOTIFY_PREFS)
    if isinstance(user.notify_prefs, dict):
        prefs.update({k: bool(v) for k, v in user.notify_prefs.items() if k in DEFAULT_NOTIFY_PREFS})
    return prefs


def send_push(user_ids: list[int], type: str, title: str, body: str | None, link: str | None, notification_id: int | None = None) -> None:
    """user_ids의 모든 구독 기기로 발송. 설정에서 끈 사용자는 건너뛰고, 만료(404/410) 구독은 삭제."""
    if not user_ids or not push_enabled():
        return
    settings = get_settings()
    pref_key = PREF_KEY_BY_TYPE.get(type)
    payload_dict = {
        "title": title,
        "body": body or "",
        "icon": PUSH_ICON,
        "link": f"{APP_BASE}{link}" if link and link.startswith("/") else (link or f"{APP_BASE}/"),
        "tag": type,
    }
    if notification_id is not None:
        payload_dict["notification_id"] = notification_id
    payload = json.dumps(payload_dict, ensure_ascii=False)

    db = SessionLocal()
    sent = skipped = removed = failed = 0
    try:
        users = db.query(User).filter(User.id.in_(set(user_ids))).all()
        targets = [u.id for u in users if pref_key is None or merged_prefs(u).get(pref_key, True)]
        skipped = len(users) - len(targets)
        if not targets:
            return
        subs = db.query(PushSubscription).filter(PushSubscription.user_id.in_(targets)).all()
        for sub in subs:
            try:
                webpush(
                    subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                    data=payload,
                    vapid_private_key=settings.VAPID_PRIVATE,
                    vapid_claims={"sub": settings.VAPID_SUBJECT},
                    ttl=PUSH_TTL,
                    timeout=10,
                )
                sent += 1
            except WebPushException as e:
                status = e.response.status_code if e.response is not None else None
                if status in (404, 410):
                    db.delete(sub)
                    removed += 1
                else:
                    failed += 1
                    logger.warning("webpush fail sub=%s status=%s err=%s", sub.id, status, str(e)[:200])
            except Exception as e:  # 네트워크 등 — 다른 기기 발송은 계속
                failed += 1
                logger.warning("webpush error sub=%s err=%s", sub.id, str(e)[:200])
        if removed:
            db.commit()
    except Exception:
        logger.exception("send_push failed type=%s", type)
    finally:
        db.close()
        logger.info("send_push type=%s users=%s sent=%s skipped_prefs=%s removed=%s failed=%s",
                    type, len(user_ids), sent, skipped, removed, failed)
