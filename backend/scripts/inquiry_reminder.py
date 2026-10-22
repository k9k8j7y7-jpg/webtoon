"""24시간 미답변 문의 관리자 재알림 (하루 1회 cron).

Usage:
  cd /home/bitnami/project-t/backend
  source venv/bin/activate
  python3 scripts/inquiry_reminder.py

Cron (매일 09:00 KST = 00:00 UTC):
  0 0 * * * cd /home/bitnami/project-t/backend && source venv/bin/activate && python3 scripts/inquiry_reminder.py >> /tmp/inquiry_reminder.log 2>&1
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta, timezone
from sqlalchemy import text
from app.database import SessionLocal
from app.social.service import notify
from app.push.service import send_push

KST = timezone(timedelta(hours=9))

def main():
    db = SessionLocal()
    try:
        # 24시간 이상 미답변(received/checking) 문의 건수
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        rows = db.execute(text(
            "SELECT COUNT(*) FROM inquiries "
            "WHERE status IN ('received', 'checking') AND created_at < :cutoff"
        ), {"cutoff": cutoff}).fetchone()
        unanswered = rows[0] if rows else 0

        if unanswered == 0:
            print(f"[{datetime.now(KST).isoformat()}] 미답변 문의 0건 — 알림 생략")
            return

        # 관리자 목록
        admin_ids = [
            r[0] for r in db.execute(
                text("SELECT id FROM users WHERE is_admin = 1")
            ).fetchall()
        ]
        if not admin_ids:
            print("관리자 없음")
            return

        title = f"미답변 문의 {unanswered}건"
        body = "24시간 넘은 문의가 있어요"

        for aid in admin_ids:
            notify(db, aid, "inquiry_reminder", title=title, body=body, link="/admin?tab=inquiries")

        db.commit()

        try:
            send_push(admin_ids, "inquiry_reminder", title, body, "/admin?tab=inquiries")
        except Exception:
            pass

        print(f"[{datetime.now(KST).isoformat()}] 미답변 {unanswered}건 → 관리자 {len(admin_ids)}명 알림 전송")

    finally:
        db.close()


if __name__ == "__main__":
    main()
