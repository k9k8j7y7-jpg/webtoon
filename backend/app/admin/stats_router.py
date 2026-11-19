"""관리자 통계 API — 매출·사용자·품질·상태 점검.

모든 엔드포인트는 require_admin 의존.
raw SQL(text()) 사용, ORM 모델 미사용.
"""

import logging
from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.admin.deps import require_admin
from app.admin.checks import run_all_checks
from app.users.models import User

log = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/stats", tags=["admin-stats"])

# ── 헬퍼 ────────────────────────────────────────────────────────

RANGE_OPTIONS = {"today", "7d", "30d", "all"}


def _date_range(range_param: str) -> tuple[date | None, date, str]:
    """range → (from_date, to_date, label).  from_date=None means 'all'."""
    today = date.today()
    if range_param == "today":
        return today, today, "today"
    elif range_param == "7d":
        return today - timedelta(days=6), today, "7d"
    elif range_param == "all":
        return None, today, "all"
    else:  # 30d default
        return today - timedelta(days=29), today, "30d"


def _where_created(alias: str, from_date: date | None) -> str:
    """SQL WHERE fragment for created_at >= from_date."""
    if from_date is None:
        return "1=1"
    return f"{alias}.created_at >= :from_dt"


def _params(from_date: date | None) -> dict:
    if from_date is None:
        return {}
    return {"from_dt": datetime.combine(from_date, datetime.min.time())}


def _safe(val, default=0):
    """None → default, Decimal → float/int."""
    if val is None:
        return default
    if isinstance(val, Decimal):
        return float(val)
    return val


# ── GET /admin/stats/money ──────────────────────────────────────

RECORDING_STARTED = date(2026, 11, 19)


@router.get("/money")
def stats_money(
    range: str = Query("30d", alias="range"),
    measured_only: bool = Query(False),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rng = range if range in RANGE_OPTIONS else "30d"
    from_date, to_date, label = _date_range(rng)
    p = _params(from_date)
    wh = _where_created("o", from_date)

    result = {
        "period": {"from": str(from_date) if from_date else None, "to": str(to_date), "range": label},
    }

    # ── revenue ──
    try:
        row = db.execute(
            text(
                f"SELECT COALESCE(SUM(o.amount), 0), COUNT(*) "
                f"FROM orders o WHERE o.status = 'paid' AND {wh}"
            ), p
        ).fetchone()
        total_revenue = _safe(row[0])
        order_count = row[1] or 0

        by_product = db.execute(
            text(
                f"SELECT o.product_code, COUNT(*), SUM(o.amount) "
                f"FROM orders o WHERE o.status = 'paid' AND {wh} "
                f"GROUP BY o.product_code ORDER BY SUM(o.amount) DESC"
            ), p
        ).fetchall()

        result["revenue"] = {
            "total_krw": int(total_revenue),
            "count": order_count,
            "by_product": [
                {"code": r[0], "count": r[1], "amount": int(_safe(r[2]))}
                for r in by_product
            ],
        }
    except Exception as e:
        log.exception("stats_money: revenue query failed")
        result["revenue"] = {"error": str(e)}

    # ── packets ──
    try:
        wh_pt = _where_created("pt", from_date)
        sold = db.execute(
            text(f"SELECT COALESCE(SUM(pt.delta), 0) FROM packet_transactions pt WHERE pt.reason = 'purchase' AND {wh_pt}"), p
        ).scalar()
        granted = db.execute(
            text(f"SELECT COALESCE(SUM(pt.delta), 0) FROM packet_transactions pt WHERE pt.reason = 'admin_grant' AND pt.delta > 0 AND {wh_pt}"), p
        ).scalar()
        used_raw = db.execute(
            text(f"SELECT COALESCE(SUM(ABS(pt.delta)), 0) FROM packet_transactions pt WHERE pt.reason = 'generation' AND {wh_pt}"), p
        ).scalar()
        refunded = db.execute(
            text(f"SELECT COALESCE(SUM(pt.delta), 0) FROM packet_transactions pt WHERE pt.reason = 'refund' AND {wh_pt}"), p
        ).scalar()
        balance_total = db.execute(text("SELECT COALESCE(SUM(balance), 0) FROM packet_balances")).scalar()

        by_reason = db.execute(
            text(
                f"SELECT pt.reason, COUNT(*), SUM(ABS(pt.delta)) "
                f"FROM packet_transactions pt WHERE {wh_pt} "
                f"GROUP BY pt.reason"
            ), p
        ).fetchall()

        result["packets"] = {
            "sold": int(_safe(sold)),
            "granted": int(_safe(granted)),
            "used": int(_safe(used_raw)),
            "refunded": int(_safe(refunded)),
            "balance_total": int(_safe(balance_total)),
            "by_reason": [
                {"reason": r[0], "count": r[1], "total": int(_safe(r[2]))}
                for r in by_reason
            ],
        }
    except Exception as e:
        log.exception("stats_money: packets query failed")
        result["packets"] = {"error": str(e)}

    # ── cost (from api_calls + legacy estimation) ──
    try:
        from app.costs.recorder import estimate_legacy_costs

        # Determine which portion is measured vs estimated
        effective_from = from_date
        # For measured_only mode, clamp from_date to recording start
        if measured_only:
            if effective_from is None or effective_from < RECORDING_STARTED:
                effective_from = RECORDING_STARTED

        # Measured cost from api_calls (only after RECORDING_STARTED)
        ac_from = effective_from if effective_from and effective_from >= RECORDING_STARTED else RECORDING_STARTED
        wh_ac = _where_created("ac", ac_from)
        p_ac = _params(ac_from)

        cost_row = db.execute(
            text(f"SELECT COALESCE(SUM(ac.cost_usd), 0), COALESCE(SUM(ac.cost_krw), 0) FROM api_calls ac WHERE {wh_ac}"), p_ac
        ).fetchone()
        measured_usd = float(_safe(cost_row[0]))
        measured_krw = int(_safe(cost_row[1]))

        by_provider = db.execute(
            text(
                f"SELECT ac.provider, SUM(ac.cost_usd) "
                f"FROM api_calls ac WHERE {wh_ac} "
                f"GROUP BY ac.provider ORDER BY SUM(ac.cost_usd) DESC"
            ), p_ac
        ).fetchall()

        by_purpose_ac = db.execute(
            text(
                f"SELECT ac.purpose, SUM(ac.cost_usd), COUNT(*) "
                f"FROM api_calls ac WHERE {wh_ac} "
                f"GROUP BY ac.purpose ORDER BY SUM(ac.cost_usd) DESC"
            ), p_ac
        ).fetchall()

        # Estimated cost from generation_logs (before RECORDING_STARTED)
        estimated_usd = 0.0
        estimated_krw = 0
        est_data = None
        needs_estimation = (
            not measured_only
            and (from_date is None or from_date < RECORDING_STARTED)
        )

        if needs_estimation:
            est_from = from_date or date(2024, 1, 1)  # earliest possible
            est_to = min(RECORDING_STARTED, to_date + timedelta(days=1))
            est_data = estimate_legacy_costs(db, est_from, est_to)
            estimated_usd = est_data["total_usd"]
            estimated_krw = est_data["total_krw"]

        total_usd = round(measured_usd + estimated_usd, 4)
        total_krw = measured_krw + estimated_krw

        # Determine source label
        if measured_only or not needs_estimation:
            source = "measured"
        elif measured_usd == 0:
            source = "estimated"
        else:
            source = "mixed"

        result["cost"] = {
            "measured_usd": round(measured_usd, 4),
            "measured_krw": measured_krw,
            "estimated_usd": round(estimated_usd, 4),
            "estimated_krw": estimated_krw,
            "total_usd": total_usd,
            "total_krw": total_krw,
            "source": source,
            "by_provider": [
                {"provider": r[0], "total_usd": round(float(_safe(r[1])), 4)}
                for r in by_provider
            ],
            "by_purpose": [
                {"purpose": r[0], "total_usd": round(float(_safe(r[1])), 4), "call_count": r[2]}
                for r in by_purpose_ac
            ],
        }
        result["recording_started"] = str(RECORDING_STARTED)
    except Exception as e:
        log.exception("stats_money: cost query failed")
        result["cost"] = {"error": str(e)}

    # ── derived metrics ──
    try:
        packets_used = result.get("packets", {}).get("used", 0)
        cost_total_krw = result.get("cost", {}).get("total_krw", 0)
        revenue_total = result.get("revenue", {}).get("total_krw", 0)
        packets_sold = result.get("packets", {}).get("sold", 0)

        # For measured_only mode, only count packets after recording start
        if measured_only:
            wh_pt_m = "pt.created_at >= :m_from"
            p_m = {"m_from": datetime.combine(RECORDING_STARTED, datetime.min.time())}
            packets_used_m = db.execute(
                text(f"SELECT COALESCE(SUM(ABS(pt.delta)), 0) FROM packet_transactions pt WHERE pt.reason = 'generation' AND {wh_pt_m}"), p_m
            ).scalar()
            packets_used = int(_safe(packets_used_m))

        per_packet_cost = round(cost_total_krw / packets_used, 1) if packets_used > 0 else 0

        # avg sell price: revenue / sold packets; fallback to packet_100 price
        margin_note = None
        if packets_sold > 0:
            avg_sell = round(revenue_total / packets_sold, 1)
        else:
            pp_row = db.execute(
                text("SELECT price / packets FROM packet_products WHERE code = 'packet_100' LIMIT 1")
            ).fetchone()
            avg_sell = float(pp_row[0]) if pp_row else 0
            margin_note = "판매 없음 \u00b7 인기 팩 299원 기준 추정"

        margin = round((1 - per_packet_cost / avg_sell) * 100, 1) if avg_sell > 0 else None

        result["per_packet_cost_krw"] = per_packet_cost
        result["avg_sell_price_krw"] = avg_sell
        result["margin_pct"] = margin
        if margin_note:
            result["margin_note"] = margin_note
    except Exception as e:
        log.exception("stats_money: derived metrics failed")
        result["per_packet_cost_krw"] = 0
        result["avg_sell_price_krw"] = 0
        result["margin_pct"] = 0

    # ── daily breakdown ──
    try:
        # revenue daily
        wh_daily_o = _where_created("o", from_date)
        wh_daily_ac = _where_created("ac", from_date)
        wh_daily_pt = _where_created("pt", from_date)

        daily_revenue = db.execute(
            text(
                f"SELECT DATE(o.created_at) AS d, SUM(o.amount) "
                f"FROM orders o WHERE o.status = 'paid' AND {wh_daily_o} "
                f"GROUP BY d ORDER BY d"
            ), p
        ).fetchall()
        rev_map = {str(r[0]): int(_safe(r[1])) for r in daily_revenue}

        daily_cost = db.execute(
            text(
                f"SELECT DATE(ac.created_at) AS d, SUM(ac.cost_krw) "
                f"FROM api_calls ac WHERE {wh_daily_ac} "
                f"GROUP BY d ORDER BY d"
            ), p
        ).fetchall()
        cost_map = {str(r[0]): int(_safe(r[1])) for r in daily_cost}

        daily_packets = db.execute(
            text(
                f"SELECT DATE(pt.created_at) AS d, SUM(ABS(pt.delta)) "
                f"FROM packet_transactions pt WHERE pt.reason = 'generation' AND {wh_daily_pt} "
                f"GROUP BY d ORDER BY d"
            ), p
        ).fetchall()
        pkt_map = {str(r[0]): int(_safe(r[1])) for r in daily_packets}

        all_dates = sorted(set(list(rev_map.keys()) + list(cost_map.keys()) + list(pkt_map.keys())))
        result["daily"] = [
            {
                "date": d,
                "revenue_krw": rev_map.get(d, 0),
                "cost_krw": cost_map.get(d, 0),
                "packets_used": pkt_map.get(d, 0),
            }
            for d in all_dates
        ]
    except Exception as e:
        log.exception("stats_money: daily query failed")
        result["daily"] = []

    return result


# ── GET /admin/stats/people ─────────────────────────────────────

@router.get("/people")
def stats_people(
    range: str = Query("30d", alias="range"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rng = range if range in RANGE_OPTIONS else "30d"
    from_date, to_date, label = _date_range(rng)
    p = _params(from_date)

    result = {}

    # ── total / signups ──
    try:
        total = db.execute(text("SELECT COUNT(*) FROM users")).scalar() or 0
        wh_u = _where_created("u", from_date)
        signups = db.execute(
            text(f"SELECT COUNT(*) FROM users u WHERE {wh_u}"), p
        ).scalar() or 0
        result["total_users"] = total
        result["period_signups"] = signups
    except Exception as e:
        log.exception("stats_people: users query failed")
        result["total_users"] = 0
        result["period_signups"] = 0

    # ── active users (at least 1 generation_log in period) ──
    try:
        wh_gl = _where_created("gl", from_date)
        active = db.execute(
            text(f"SELECT COUNT(DISTINCT gl.user_id) FROM generation_logs gl WHERE {wh_gl}"), p
        ).scalar() or 0
        result["active_users"] = active
    except Exception as e:
        log.exception("stats_people: active query failed")
        result["active_users"] = 0

    # ── conversion rate (users with at least 1 paid order / total) ──
    try:
        paying = db.execute(
            text("SELECT COUNT(DISTINCT user_id) FROM orders WHERE status = 'paid'")
        ).scalar() or 0
        result["conversion_rate"] = round(paying / total * 100, 1) if total > 0 else 0
    except Exception as e:
        log.exception("stats_people: conversion query failed")
        result["conversion_rate"] = 0

    # ── welcome_only: admin_grant but no purchase and no generation ──
    try:
        welcome_only = db.execute(
            text(
                "SELECT COUNT(DISTINCT pt.user_id) FROM packet_transactions pt "
                "WHERE pt.reason = 'admin_grant' "
                "AND pt.user_id NOT IN (SELECT DISTINCT user_id FROM orders WHERE status = 'paid') "
                "AND pt.user_id NOT IN (SELECT DISTINCT user_id FROM generation_logs)"
            )
        ).scalar() or 0
        result["welcome_only_rate"] = round(welcome_only / total * 100, 1) if total > 0 else 0
    except Exception as e:
        log.exception("stats_people: welcome_only query failed")
        result["welcome_only_rate"] = 0

    # ── top 10 users by packets used ──
    try:
        wh_pt = _where_created("pt", from_date)
        top_rows = db.execute(
            text(
                f"SELECT pt.user_id, "
                f"  u.nickname, u.display_name, "
                f"  SUM(ABS(pt.delta)) AS packets_used, "
                f"  COALESCE(rev.total_rev, 0) AS revenue, "
                f"  MAX(pt.created_at) AS last_active "
                f"FROM packet_transactions pt "
                f"JOIN users u ON pt.user_id = u.id "
                f"LEFT JOIN ("
                f"  SELECT user_id, SUM(amount) AS total_rev "
                f"  FROM orders WHERE status = 'paid' GROUP BY user_id"
                f") rev ON pt.user_id = rev.user_id "
                f"WHERE pt.reason = 'generation' AND {wh_pt} "
                f"GROUP BY pt.user_id "
                f"ORDER BY packets_used DESC "
                f"LIMIT 10"
            ), p
        ).fetchall()
        result["top_users"] = [
            {
                "id": r[0],
                "nickname": r[1] or r[2] or f"u{r[0]}",
                "packets_used": int(_safe(r[3])),
                "revenue": int(_safe(r[4])),
                "last_active": r[5].isoformat() if r[5] else None,
                "is_test": r[0] == 1,
            }
            for r in top_rows
        ]
    except Exception as e:
        log.exception("stats_people: top_users query failed")
        result["top_users"] = []

    # ── daily signups ──
    try:
        wh_u2 = _where_created("u", from_date)
        daily = db.execute(
            text(
                f"SELECT DATE(u.created_at) AS d, COUNT(*) "
                f"FROM users u WHERE {wh_u2} "
                f"GROUP BY d ORDER BY d"
            ), p
        ).fetchall()
        result["daily_signups"] = [
            {"date": str(r[0]), "count": r[1]} for r in daily
        ]
    except Exception as e:
        log.exception("stats_people: daily_signups query failed")
        result["daily_signups"] = []

    return result


# ── GET /admin/stats/quality ────────────────────────────────────

@router.get("/quality")
def stats_quality(
    range: str = Query("30d", alias="range"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rng = range if range in RANGE_OPTIONS else "30d"
    from_date, to_date, label = _date_range(rng)
    p = _params(from_date)

    result = {}

    # ── by_purpose (from api_calls, which has purpose column) ──
    try:
        wh_ac = _where_created("ac", from_date)
        rows = db.execute(
            text(
                f"SELECT ac.purpose, COUNT(*) AS total, "
                f"  SUM(CASE WHEN ac.status = 'error' THEN 1 ELSE 0 END) AS failed "
                f"FROM api_calls ac WHERE ac.kind = 'image' AND {wh_ac} "
                f"GROUP BY ac.purpose ORDER BY total DESC"
            ), p
        ).fetchall()
        result["by_purpose"] = [
            {
                "purpose": r[0],
                "total": r[1],
                "failed": r[2],
                "failure_rate": round(r[2] / r[1] * 100, 1) if r[1] > 0 else 0,
            }
            for r in rows
        ]
    except Exception as e:
        log.exception("stats_quality: by_purpose query failed")
        result["by_purpose"] = []

    # ── regen_rate: cuts where version > 1 / total cuts with images ──
    try:
        wh_c = _where_created("c", from_date)
        regen_row = db.execute(
            text(
                f"SELECT "
                f"  COUNT(*) AS total_with_img, "
                f"  SUM(CASE WHEN c.version > 1 THEN 1 ELSE 0 END) AS regen "
                f"FROM cuts c "
                f"WHERE c.image_url IS NOT NULL AND {wh_c}"
            ), p
        ).fetchone()
        total_img = regen_row[0] or 0
        regen_cnt = regen_row[1] or 0
        result["regen_rate"] = round(regen_cnt / total_img * 100, 1) if total_img > 0 else 0
    except Exception as e:
        log.exception("stats_quality: regen_rate query failed")
        result["regen_rate"] = 0

    # ── copy_reports: refund transactions ──
    try:
        wh_pt = _where_created("pt", from_date)
        refund_row = db.execute(
            text(
                f"SELECT COUNT(*), COALESCE(SUM(pt.delta), 0) "
                f"FROM packet_transactions pt "
                f"WHERE pt.reason = 'refund' AND {wh_pt}"
            ), p
        ).fetchone()
        result["copy_reports"] = {
            "count": refund_row[0] or 0,
            "refunded_packets": int(_safe(refund_row[1])),
        }
    except Exception as e:
        log.exception("stats_quality: copy_reports query failed")
        result["copy_reports"] = {"count": 0, "refunded_packets": 0}

    # ── avg generation time ──
    try:
        wh_ac2 = _where_created("ac", from_date)
        avg_row = db.execute(
            text(
                f"SELECT AVG(ac.duration_ms) "
                f"FROM api_calls ac "
                f"WHERE ac.kind = 'image' AND ac.status = 'ok' AND ac.duration_ms IS NOT NULL AND {wh_ac2}"
            ), p
        ).fetchone()
        result["avg_generation_time_ms"] = round(float(_safe(avg_row[0]))) if avg_row and avg_row[0] else 0
    except Exception as e:
        log.exception("stats_quality: avg_generation_time failed")
        result["avg_generation_time_ms"] = 0

    return result


# ── GET /admin/stats/status ─────────────────────────────────────

@router.get("/status")
def stats_status(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    checks = run_all_checks(db, source="page")
    return {
        "checks": checks,
        "last_run": datetime.utcnow().isoformat(),
    }
