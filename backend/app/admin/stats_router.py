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

        # estimated cost from generation_logs (for dates before RECORDING_STARTED)
        est_cost_map: dict[str, int] = {}
        if not measured_only and (from_date is None or from_date < RECORDING_STARTED):
            from app.costs.recorder import estimate_legacy_costs_daily
            est_from = from_date or date(2024, 1, 1)
            est_to = min(RECORDING_STARTED, to_date + timedelta(days=1))
            est_cost_map = estimate_legacy_costs_daily(db, est_from, est_to)

        daily_packets = db.execute(
            text(
                f"SELECT DATE(pt.created_at) AS d, SUM(ABS(pt.delta)) "
                f"FROM packet_transactions pt WHERE pt.reason = 'generation' AND {wh_daily_pt} "
                f"GROUP BY d ORDER BY d"
            ), p
        ).fetchall()
        pkt_map = {str(r[0]): int(_safe(r[1])) for r in daily_packets}

        all_dates = sorted(set(
            list(rev_map.keys()) + list(cost_map.keys())
            + list(est_cost_map.keys()) + list(pkt_map.keys())
        ))
        result["daily"] = [
            {
                "date": d,
                "revenue_krw": rev_map.get(d, 0),
                "cost_krw": cost_map.get(d, 0),
                "estimated_cost_krw": est_cost_map.get(d, 0),
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

    # ── total / period signups ──
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
        total = 0
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

    # ── conversion rate (users with at least 1 paid order / total users) ──
    try:
        paying = db.execute(
            text("SELECT COUNT(DISTINCT user_id) FROM orders WHERE status = 'paid'")
        ).scalar() or 0
        result["paid_conversion_rate"] = round(paying / total * 100, 1) if total > 0 else 0
        result["paying_users"] = paying
    except Exception as e:
        log.exception("stats_people: conversion query failed")
        result["paid_conversion_rate"] = 0

    # ── welcome_only churn: got welcome packet, never paid and never generated ──
    try:
        welcome_total = db.execute(
            text(
                "SELECT COUNT(DISTINCT pt.user_id) FROM packet_transactions pt "
                "WHERE pt.reason = 'admin_grant'"
            )
        ).scalar() or 0
        welcome_churned = db.execute(
            text(
                "SELECT COUNT(DISTINCT pt.user_id) FROM packet_transactions pt "
                "WHERE pt.reason = 'admin_grant' "
                "AND pt.user_id NOT IN (SELECT DISTINCT user_id FROM orders WHERE status = 'paid') "
                "AND pt.user_id NOT IN (SELECT DISTINCT user_id FROM generation_logs)"
            )
        ).scalar() or 0
        result["welcome_only_churn_rate"] = round(welcome_churned / welcome_total * 100, 1) if welcome_total > 0 else 0
        result["welcome_churned"] = welcome_churned
        result["welcome_total"] = welcome_total
    except Exception as e:
        log.exception("stats_people: welcome_only query failed")
        result["welcome_only_churn_rate"] = 0

    # ── top 10 users by packets used ──
    try:
        wh_pt = _where_created("pt", from_date)
        top_rows = db.execute(
            text(
                f"SELECT pt.user_id, "
                f"  u.nickname, u.display_name, "
                f"  SUM(ABS(pt.delta)) AS packets_used, "
                f"  COALESCE(rev.total_rev, 0) AS paid_krw, "
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
                "paid_krw": int(_safe(r[4])),
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

PURPOSE_KO = {
    "story": "이야기",
    "onecut_ad": "한 컷 광고",
    "instatoon_ad": "인스타툰 광고",
    "brand_series": "브랜드 시리즈",
    "detail_page": "상세페이지",
    "motion": "모션",
    "character": "캐릭터",
    "location": "장소",
    "check": "점검",
    "analysis": "분석",
}


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

    # ── by_purpose: generation_logs(total) + api_calls(failure, 11-19~) + cuts(regen) ──
    try:
        # Total generation count per purpose (from generation_logs)
        wh_gl = _where_created("gl", from_date)
        rows = db.execute(
            text(
                f"SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(e.gate_status, '$.purpose')), 'story') AS purpose, "
                f"  COUNT(*) AS total "
                f"FROM generation_logs gl "
                f"JOIN episodes e ON gl.episode_id = e.id "
                f"WHERE gl.kind = 'cut' AND {wh_gl} "
                f"GROUP BY purpose ORDER BY total DESC"
            ), p
        ).fetchall()

        # Failure count per purpose (from api_calls, 11-19 이후만)
        ac_from = max(from_date, RECORDING_STARTED) if from_date else RECORDING_STARTED
        wh_ac_fail = _where_created("ac", ac_from)
        p_ac_fail = _params(ac_from)
        fail_rows = db.execute(
            text(
                f"SELECT ac.purpose, COUNT(*) "
                f"FROM api_calls ac "
                f"WHERE ac.kind = 'image' AND ac.status = 'error' AND {wh_ac_fail} "
                f"GROUP BY ac.purpose"
            ), p_ac_fail
        ).fetchall()
        fail_map = {r[0]: r[1] for r in fail_rows}

        # Regen rate per purpose: cuts with version > 2
        wh_c = _where_created("c", from_date)
        regen_rows = db.execute(
            text(
                f"SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(e.gate_status, '$.purpose')), 'story') AS purpose, "
                f"  COUNT(*) AS total_img, "
                f"  SUM(CASE WHEN c.version > 2 THEN 1 ELSE 0 END) AS regen "
                f"FROM cuts c "
                f"JOIN episodes e ON c.episode_id = e.id "
                f"WHERE c.image_url IS NOT NULL AND {wh_c} "
                f"GROUP BY purpose"
            ), p
        ).fetchall()
        regen_map = {r[0]: {"total": r[1] or 0, "regen": r[2] or 0} for r in regen_rows}

        result["by_purpose"] = [
            {
                "purpose": PURPOSE_KO.get(r[0], r[0]),
                "purpose_key": r[0],
                "total": r[1],
                "failed": fail_map.get(r[0], 0),
                "success": r[1] - fail_map.get(r[0], 0),
                "failure_rate": round(fail_map.get(r[0], 0) / r[1] * 100, 1) if r[1] > 0 else 0,
                "regen_rate": round(regen_map.get(r[0], {}).get("regen", 0) / regen_map.get(r[0], {}).get("total", 1) * 100, 1)
                    if regen_map.get(r[0], {}).get("total", 0) > 0 else 0,
            }
            for r in rows
        ]
        result["failure_note"] = "11-19 기록 이후"
    except Exception as e:
        log.exception("stats_quality: by_purpose query failed")
        result["by_purpose"] = []

    # ── motion success rate (from cuts.spec.motion.status) ──
    try:
        wh_c_m = _where_created("c", from_date)
        motion_row = db.execute(
            text(
                f"SELECT "
                f"  SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(c.spec, '$.motion.status')) IN ('done','failed') THEN 1 ELSE 0 END) AS attempted, "
                f"  SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(c.spec, '$.motion.status')) = 'done' THEN 1 ELSE 0 END) AS ok "
                f"FROM cuts c "
                f"WHERE JSON_EXTRACT(c.spec, '$.motion') IS NOT NULL AND {wh_c_m}"
            ), p
        ).fetchone()
        m_total = int(motion_row[0] or 0)
        m_ok = int(motion_row[1] or 0)
        result["motion"] = {
            "total": m_total,
            "success": m_ok,
            "success_rate": round(m_ok / m_total * 100, 1) if m_total > 0 else None,
        }
    except Exception as e:
        log.exception("stats_quality: motion query failed")
        result["motion"] = {"total": 0, "success": 0, "success_rate": None}

    # ── detail page warning badges ──
    try:
        wh_c2 = _where_created("c", from_date)
        dp_row = db.execute(
            text(
                f"SELECT COUNT(*) AS total, "
                f"  SUM(CASE WHEN JSON_LENGTH(JSON_EXTRACT(c.spec, '$.generation.detail_check.warning_claims')) > 0 THEN 1 ELSE 0 END) AS warned "
                f"FROM cuts c "
                f"JOIN episodes e ON c.episode_id = e.id "
                f"WHERE JSON_UNQUOTE(JSON_EXTRACT(e.gate_status, '$.purpose')) = 'detail_page' "
                f"AND c.image_url IS NOT NULL AND {wh_c2}"
            ), p
        ).fetchone()
        dp_total = dp_row[0] or 0
        dp_warned = dp_row[1] or 0
        result["detail_warnings"] = {
            "total": dp_total,
            "warned": dp_warned,
            "rate": round(dp_warned / dp_total * 100, 1) if dp_total > 0 else 0,
        }
    except Exception as e:
        log.exception("stats_quality: detail_warnings query failed")
        result["detail_warnings"] = {"total": 0, "warned": 0, "rate": 0}

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
        result["copy_report_count"] = refund_row[0] or 0
        result["refunded_packets"] = int(_safe(refund_row[1]))
    except Exception as e:
        log.exception("stats_quality: copy_reports query failed")
        result["copy_report_count"] = 0
        result["refunded_packets"] = 0

    # ── avg generation time (api_calls, 11-19 이후만) ──
    try:
        p_ac = _params(RECORDING_STARTED)
        wh_ac2 = _where_created("ac", RECORDING_STARTED)
        avg_row = db.execute(
            text(
                f"SELECT AVG(ac.duration_ms) "
                f"FROM api_calls ac "
                f"WHERE ac.kind = 'image' AND ac.status = 'ok' AND ac.duration_ms IS NOT NULL AND {wh_ac2}"
            ), p_ac
        ).fetchone()
        avg_ms = round(float(_safe(avg_row[0]))) if avg_row and avg_row[0] else 0
        result["avg_generation_sec"] = round(avg_ms / 1000, 1) if avg_ms > 0 else 0
        result["avg_generation_note"] = "11-19 기록 이후"
    except Exception as e:
        log.exception("stats_quality: avg_generation_time failed")
        result["avg_generation_sec"] = 0
        result["avg_generation_note"] = "11-19 기록 이후"

    return result


# ── GET /admin/stats/status ─────────────────────────────────────

def _estimate_check_cost(db) -> int:
    """외부 모델 점검 예상 비용(KRW). 단가표 기반."""
    try:
        from decimal import Decimal as D
        # Gemini text: 10 tok in + 5 tok out
        gemini_in = db.execute(text(
            "SELECT usd_per_unit FROM api_prices WHERE provider='gemini' AND model='gemini-2.5-flash' AND kind='text' AND unit='1k_tokens_in' LIMIT 1"
        )).scalar() or D("0.0003")
        gemini_out = db.execute(text(
            "SELECT usd_per_unit FROM api_prices WHERE provider='gemini' AND model='gemini-2.5-flash' AND kind='text' AND unit='1k_tokens_out' LIMIT 1"
        )).scalar() or D("0.0025")
        # Gemini vision: 15 tok in + 5 tok out (same pricing)
        # GPT-4.1-mini: $0.40/1M in, $1.60/1M out → $0.0004/1k in, $0.0016/1k out
        gpt_in = D("0.0004")
        gpt_out = D("0.0016")

        cost_gemini_text = D(gemini_in) * D("10") / D("1000") + D(gemini_out) * D("5") / D("1000")
        cost_gemini_vision = D(gemini_in) * D("15") / D("1000") + D(gemini_out) * D("5") / D("1000")
        cost_gpt = gpt_in * D("10") / D("1000") + gpt_out * D("5") / D("1000")
        total_usd = cost_gemini_text + cost_gemini_vision + cost_gpt

        rate = db.execute(text("SELECT usd_krw FROM exchange_rates ORDER BY date DESC LIMIT 1")).scalar() or D("1330")
        return max(1, int(total_usd * D(str(rate))))
    except Exception:
        return 1


@router.get("/status")
def stats_status(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    checks = run_all_checks(db, source="page")
    return {
        "checks": checks,
        "last_run": datetime.utcnow().isoformat(),
        "ext_check_cost_krw": _estimate_check_cost(db),
    }


@router.post("/status/run")
def stats_status_run(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """수동 점검 실행."""
    checks = run_all_checks(db, source="manual")
    return {
        "checks": checks,
        "last_run": datetime.utcnow().isoformat(),
    }


# ── POST /admin/stats/status/check-external ───────────────────

@router.post("/status/check-external")
def check_external_models(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """외부 모델 헬스체크: GPT low, Gemini 텍스트, Gemini 비전. purpose=check 기록."""
    import time
    from app.config import settings
    from app.costs.recorder import record_api_call, set_api_purpose, set_api_user

    set_api_purpose("check")
    set_api_user(admin.id)

    results = []
    total_cost_krw = 0

    # 1. Gemini text check
    try:
        import google.generativeai as genai
        genai.configure(api_key=settings.GEMINI_API_KEY)
        t0 = time.time()
        model = genai.GenerativeModel(settings.TEXT_MODEL if hasattr(settings, 'TEXT_MODEL') else "gemini-2.5-flash")
        resp = model.generate_content("Reply with just the word 'ok'.")
        dur = int((time.time() - t0) * 1000)
        ok = bool(resp and resp.text)
        try:
            rec = record_api_call(
                provider="gemini", model=model.model_name or "gemini-2.5-flash",
                kind="text", purpose="check",
                units={"tokens_in": 10, "tokens_out": 5},
                duration_ms=dur, status="ok" if ok else "error",
            )
            if rec and hasattr(rec, 'cost_krw'):
                total_cost_krw += rec.cost_krw or 0
        except Exception:
            pass
        results.append({"name": "Gemini 텍스트", "status": "ok" if ok else "fail", "ms": dur})
    except Exception as e:
        results.append({"name": "Gemini 텍스트", "status": "fail", "detail": str(e)[:100]})

    # 2. Gemini vision check (use a tiny test)
    try:
        t0 = time.time()
        model_v = genai.GenerativeModel("gemini-2.5-flash")
        # Vision with a minimal prompt (no actual image — tests model availability)
        resp_v = model_v.generate_content("Describe what you see: a white square. Reply in one word.")
        dur_v = int((time.time() - t0) * 1000)
        ok_v = bool(resp_v and resp_v.text)
        try:
            rec = record_api_call(
                provider="gemini", model="gemini-2.5-flash",
                kind="vision", purpose="check",
                units={"tokens_in": 15, "tokens_out": 5},
                duration_ms=dur_v, status="ok" if ok_v else "error",
            )
            if rec and hasattr(rec, 'cost_krw'):
                total_cost_krw += rec.cost_krw or 0
        except Exception:
            pass
        results.append({"name": "Gemini 비전", "status": "ok" if ok_v else "fail", "ms": dur_v})
    except Exception as e:
        results.append({"name": "Gemini 비전", "status": "fail", "detail": str(e)[:100]})

    # 3. GPT check (low tier)
    try:
        from openai import OpenAI
        t0 = time.time()
        client = OpenAI(api_key=settings.OPENAI_API_KEY, timeout=30.0)
        resp_gpt = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[{"role": "user", "content": "Reply with just the word 'ok'."}],
            max_tokens=5,
        )
        dur_gpt = int((time.time() - t0) * 1000)
        ok_gpt = bool(resp_gpt and resp_gpt.choices)
        try:
            rec = record_api_call(
                provider="openai", model="gpt-4.1-mini",
                kind="text", purpose="check",
                units={"tokens_in": 10, "tokens_out": 5},
                duration_ms=dur_gpt, status="ok" if ok_gpt else "error",
            )
            if rec and hasattr(rec, 'cost_krw'):
                total_cost_krw += rec.cost_krw or 0
        except Exception:
            pass
        results.append({"name": "GPT (low)", "status": "ok" if ok_gpt else "fail", "ms": dur_gpt})
    except Exception as e:
        results.append({"name": "GPT (low)", "status": "fail", "detail": str(e)[:100]})

    try:
        db.commit()
    except Exception:
        db.rollback()

    return {
        "results": results,
        "total_cost_krw": total_cost_krw,
        "all_ok": all(r["status"] == "ok" for r in results),
    }
