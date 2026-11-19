"""admin_checks: 상태 점검 함수 모음.

run_all_checks() → admin_checks 테이블에 저장 + 결과 리스트 반환.
"""

import logging
import shutil
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.orm import Session

log = logging.getLogger(__name__)

# ── 개별 점검 함수 ──────────────────────────────────────────────


def check_disk() -> dict:
    """디스크 사용률. warn 80%, fail 90%."""
    try:
        usage = shutil.disk_usage("/home/bitnami")
        pct = usage.used / usage.total * 100
        status = "fail" if pct >= 90 else ("warn" if pct >= 80 else "ok")
        return {
            "key": "disk",
            "status": status,
            "value": f"{pct:.0f}%",
            "detail": f"used {usage.used // (1 << 30)}GB / {usage.total // (1 << 30)}GB",
        }
    except Exception as e:
        return {"key": "disk", "status": "fail", "value": "error", "detail": str(e)}


def check_backup() -> dict:
    """~/backups/ 최신 파일 확인. warn >48h, fail >72h."""
    try:
        backup_dir = Path("/home/bitnami/backups")
        if not backup_dir.exists():
            return {"key": "backup", "status": "warn", "value": "no dir", "detail": "backups directory not found"}
        files = sorted(backup_dir.iterdir(), key=lambda f: f.stat().st_mtime, reverse=True)
        if not files:
            return {"key": "backup", "status": "fail", "value": "empty", "detail": "no backup files found"}
        newest = files[0]
        age = datetime.now() - datetime.fromtimestamp(newest.stat().st_mtime)
        hours = age.total_seconds() / 3600
        status = "fail" if hours > 72 else ("warn" if hours > 48 else "ok")
        return {
            "key": "backup",
            "status": status,
            "value": f"{hours:.0f}h ago",
            "detail": f"newest: {newest.name}",
        }
    except Exception as e:
        return {"key": "backup", "status": "fail", "value": "error", "detail": str(e)}


def check_failed_jobs(db: Session) -> dict:
    """최근 24h generation_logs 중 실패(패킷 미차감 = 0) 비율."""
    try:
        since = datetime.utcnow() - timedelta(hours=24)
        row = db.execute(
            text(
                "SELECT COUNT(*) AS total, "
                "SUM(CASE WHEN packets_charged = 0 AND kind = 'cut' THEN 1 ELSE 0 END) AS failed "
                "FROM generation_logs WHERE created_at >= :since"
            ),
            {"since": since},
        ).fetchone()
        total, failed = row[0] or 0, row[1] or 0
        status = "fail" if failed > 10 else ("warn" if failed > 3 else "ok")
        return {
            "key": "failed_jobs",
            "status": status,
            "value": f"{failed}/{total}",
            "detail": f"{failed} failed cut generations in 24h",
        }
    except Exception as e:
        return {"key": "failed_jobs", "status": "fail", "value": "error", "detail": str(e)}


def check_packet_ledger(db: Session) -> dict:
    """packet_balances.balance vs SUM(packet_transactions.delta) 불일치 검사."""
    try:
        rows = db.execute(
            text(
                "SELECT pb.user_id, pb.balance, COALESCE(t.sum_delta, 0) AS calc "
                "FROM packet_balances pb "
                "LEFT JOIN ("
                "  SELECT user_id, SUM(delta) AS sum_delta "
                "  FROM packet_transactions GROUP BY user_id"
                ") t ON pb.user_id = t.user_id "
                "HAVING pb.balance != calc "
                "LIMIT 20"
            )
        ).fetchall()
        if rows:
            mismatches = [{"user_id": r[0], "balance": r[1], "calc": r[2]} for r in rows]
            return {
                "key": "packet_ledger",
                "status": "fail",
                "value": f"{len(rows)} mismatches",
                "detail": str(mismatches[:5]),
            }
        return {"key": "packet_ledger", "status": "ok", "value": "0 mismatches", "detail": ""}
    except Exception as e:
        return {"key": "packet_ledger", "status": "fail", "value": "error", "detail": str(e)}


def check_api_errors(db: Session) -> dict:
    """최근 24h api_calls 에러 건수."""
    try:
        since = datetime.utcnow() - timedelta(hours=24)
        row = db.execute(
            text(
                "SELECT COUNT(*) FROM api_calls "
                "WHERE status = 'error' AND created_at >= :since"
            ),
            {"since": since},
        ).fetchone()
        cnt = row[0] or 0
        status = "fail" if cnt > 20 else ("warn" if cnt > 5 else "ok")
        return {
            "key": "api_errors",
            "status": status,
            "value": str(cnt),
            "detail": f"{cnt} API errors in 24h",
        }
    except Exception as e:
        return {"key": "api_errors", "status": "fail", "value": "error", "detail": str(e)}


def check_inquiries(db: Session) -> dict:
    """미답변 문의 건수, 가장 오래된 문의 24h 초과 시 warn."""
    try:
        rows = db.execute(
            text(
                "SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest "
                "FROM inquiries WHERE status IN ('received', 'checking')"
            )
        ).fetchone()
        cnt = rows[0] or 0
        oldest = rows[1]
        if cnt == 0:
            return {"key": "inquiries", "status": "ok", "value": "0", "detail": "no pending inquiries"}
        age_hours = (datetime.utcnow() - oldest).total_seconds() / 3600 if oldest else 0
        status = "warn" if age_hours > 24 else "ok"
        return {
            "key": "inquiries",
            "status": status,
            "value": f"{cnt} pending",
            "detail": f"oldest: {age_hours:.0f}h ago",
        }
    except Exception as e:
        return {"key": "inquiries", "status": "fail", "value": "error", "detail": str(e)}


def check_exchange_rate(db: Session) -> dict:
    """오늘 환율 존재 여부."""
    try:
        today = datetime.utcnow().date()
        row = db.execute(
            text("SELECT usd_krw FROM exchange_rates WHERE date = :d"),
            {"d": today},
        ).fetchone()
        if row:
            return {"key": "exchange_rate", "status": "ok", "value": str(row[0]), "detail": f"today={today}"}
        return {"key": "exchange_rate", "status": "warn", "value": "missing", "detail": f"no rate for {today}"}
    except Exception as e:
        return {"key": "exchange_rate", "status": "fail", "value": "error", "detail": str(e)}


def check_prices_missing(db: Session) -> dict:
    """api_calls에 쓰인 model 중 api_prices에 없는 것."""
    try:
        rows = db.execute(
            text(
                "SELECT DISTINCT ac.provider, ac.model, ac.kind "
                "FROM api_calls ac "
                "LEFT JOIN api_prices ap "
                "  ON ac.provider = ap.provider AND ac.model = ap.model AND ac.kind = ap.kind "
                "WHERE ap.id IS NULL "
                "LIMIT 20"
            )
        ).fetchall()
        if rows:
            missing = [f"{r[0]}/{r[1]}/{r[2]}" for r in rows]
            return {
                "key": "prices_missing",
                "status": "warn",
                "value": f"{len(rows)} missing",
                "detail": ", ".join(missing[:5]),
            }
        return {"key": "prices_missing", "status": "ok", "value": "all covered", "detail": ""}
    except Exception as e:
        return {"key": "prices_missing", "status": "fail", "value": "error", "detail": str(e)}


# ── 전체 실행 ───────────────────────────────────────────────────


def run_all_checks(db: Session, source: str = "page") -> list[dict]:
    """모든 점검을 실행하고 admin_checks에 저장."""
    now = datetime.utcnow()
    results = []

    # DB 불필요 점검
    for fn in [check_disk, check_backup]:
        try:
            results.append(fn())
        except Exception as e:
            results.append({"key": fn.__name__.replace("check_", ""), "status": "fail", "value": "error", "detail": str(e)})

    # DB 필요 점검
    for fn in [check_failed_jobs, check_packet_ledger, check_api_errors,
               check_inquiries, check_exchange_rate, check_prices_missing]:
        try:
            results.append(fn(db))
        except Exception as e:
            results.append({"key": fn.__name__.replace("check_", ""), "status": "fail", "value": "error", "detail": str(e)})

    # admin_checks 테이블에 저장
    for r in results:
        try:
            db.execute(
                text(
                    "INSERT INTO admin_checks (run_at, `key`, status, value, detail, source) "
                    "VALUES (:run_at, :key, :status, :value, :detail, :source)"
                ),
                {
                    "run_at": now,
                    "key": r["key"],
                    "status": r["status"],
                    "value": r.get("value"),
                    "detail": r.get("detail"),
                    "source": source,
                },
            )
        except Exception:
            log.exception("Failed to save check result: %s", r["key"])

    try:
        db.commit()
    except Exception:
        log.exception("Failed to commit check results")
        db.rollback()

    # run_at 추가
    for r in results:
        r["run_at"] = now.isoformat()

    return results
