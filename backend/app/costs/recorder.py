"""API 원가 기록 모듈.

모든 외부 API 호출(Gemini 텍스트/이미지, OpenAI 이미지, Veo 영상)의
비용을 api_calls 테이블에 기록한다.

기록 실패는 절대 호출자를 중단시키지 않는다 (try/except + warning).
"""

import json
import logging
from contextvars import ContextVar
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

logger = logging.getLogger(__name__)

# ── Context variables ────────────────────────────────────────
_purpose_var: ContextVar[str] = ContextVar("api_purpose", default="unknown")
_user_id_var: ContextVar[int | None] = ContextVar("api_user_id", default=None)
_episode_id_var: ContextVar[int | None] = ContextVar("api_episode_id", default=None)


def set_api_purpose(purpose: str):
    _purpose_var.set(purpose)


def get_api_purpose() -> str:
    return _purpose_var.get()


def set_api_user(user_id: int | None):
    _user_id_var.set(user_id)


def get_api_user() -> int | None:
    return _user_id_var.get()


def set_api_episode(episode_id: int | None):
    _episode_id_var.set(episode_id)


def get_api_episode() -> int | None:
    return _episode_id_var.get()


# ── Exchange rate ────────────────────────────────────────────

_DEFAULT_RATE = Decimal("1400.00")


def _ensure_exchange_rate(db) -> Decimal:
    """오늘의 USD→KRW 환율을 반환. 없으면 조회·삽입."""
    from sqlalchemy import text

    today = date.today()

    row = db.execute(
        text("SELECT usd_krw FROM exchange_rates WHERE date = :d"),
        {"d": today},
    ).fetchone()
    if row:
        return Decimal(str(row[0]))

    # Fetch from frankfurter
    rate = None
    source = "default"
    try:
        import httpx
        resp = httpx.get(
            "https://api.frankfurter.app/latest?base=USD&symbols=KRW",
            timeout=3.0,
        )
        if resp.status_code == 200:
            data = resp.json()
            krw = data.get("rates", {}).get("KRW")
            if krw:
                rate = Decimal(str(krw))
                source = "frankfurter"
    except Exception as e:
        logger.warning("Exchange rate fetch failed: %s", e)

    if rate is None:
        # Use most recent rate
        row = db.execute(
            text("SELECT usd_krw FROM exchange_rates ORDER BY date DESC LIMIT 1"),
        ).fetchone()
        if row:
            rate = Decimal(str(row[0]))
            source = "fallback"
        else:
            rate = _DEFAULT_RATE
            source = "default"
    try:
        db.execute(
            text(
                "INSERT INTO exchange_rates (date, usd_krw, source) "
                "VALUES (:d, :r, :s) ON DUPLICATE KEY UPDATE usd_krw=VALUES(usd_krw)"
            ),
            {"d": today, "r": float(rate), "s": source},
        )
        db.commit()
    except Exception as e:
        logger.warning("Exchange rate insert failed: %s", e)
        db.rollback()

    return rate


# ── Cost calculation ─────────────────────────────────────────

def _calc_cost(db, provider: str, model: str, kind: str, units: dict) -> Decimal | None:
    """api_prices 테이블에서 단가를 조회하고 비용을 계산한다."""
    from sqlalchemy import text

    total = Decimal("0")
    found_any = False

    for unit_key, quantity in units.items():
        if quantity is None or quantity == 0:
            continue

        # Map unit_key to DB unit column
        if unit_key == "images":
            db_unit = "image"
        elif unit_key == "tokens_in":
            db_unit = "1k_tokens_in"
        elif unit_key == "tokens_out":
            db_unit = "1k_tokens_out"
        elif unit_key == "seconds":
            db_unit = "second"
        elif unit_key == "ref_images":
            db_unit = "image_input"
        else:
            continue

        row = db.execute(
            text(
                "SELECT usd_per_unit FROM api_prices "
                "WHERE provider = :p AND model = :m AND kind = :k AND unit = :u"
            ),
            {"p": provider, "m": model, "k": kind, "u": db_unit},
        ).fetchone()

        if row is None:
            continue

        found_any = True
        price = Decimal(str(row[0]))

        if db_unit.startswith("1k_tokens"):
            total += Decimal(str(quantity)) / Decimal("1000") * price
        else:
            total += Decimal(str(quantity)) * price

    return total if found_any else None


# ── Main recording function ──────────────────────────────────

def record_api_call(
    *,
    provider: str,
    model: str,
    kind: str,
    purpose: str | None = None,
    units: dict | None = None,
    user_id: int | None = None,
    episode_id: int | None = None,
    cut_id: str | None = None,
    duration_ms: int | None = None,
    status: str = "ok",
    error_code: str | None = None,
):
    """API 호출 기록을 api_calls 테이블에 삽입한다.

    기록 실패는 절대 호출자를 중단시키지 않는다.
    """
    try:
        from app.database import SessionLocal
        from sqlalchemy import text

        # Resolve from contextvars if not provided
        if purpose is None:
            purpose = get_api_purpose()
        if user_id is None:
            user_id = get_api_user()
        if episode_id is None:
            episode_id = get_api_episode()

        units = units or {}

        db = SessionLocal()
        try:
            # Calculate cost
            cost_usd = _calc_cost(db, provider, model, kind, units)

            cost_krw = None
            if cost_usd is not None:
                rate = _ensure_exchange_rate(db)
                cost_krw = int(cost_usd * rate)

            db.execute(
                text(
                    "INSERT INTO api_calls "
                    "(provider, model, kind, purpose, user_id, episode_id, cut_id, "
                    " units_json, cost_usd, cost_krw, duration_ms, status, error_code) "
                    "VALUES "
                    "(:provider, :model, :kind, :purpose, :user_id, :episode_id, :cut_id, "
                    " :units_json, :cost_usd, :cost_krw, :duration_ms, :status, :error_code)"
                ),
                {
                    "provider": provider,
                    "model": model,
                    "kind": kind,
                    "purpose": purpose,
                    "user_id": user_id,
                    "episode_id": episode_id,
                    "cut_id": cut_id,
                    "units_json": json.dumps(units) if units else None,
                    "cost_usd": float(cost_usd) if cost_usd is not None else None,
                    "cost_krw": cost_krw,
                    "duration_ms": duration_ms,
                    "status": status,
                    "error_code": error_code,
                },
            )
            db.commit()
        except Exception as e:
            logger.warning("record_api_call DB error: %s", e)
            db.rollback()
        finally:
            db.close()

    except Exception as e:
        logger.warning("record_api_call outer error: %s", e)


# ── Legacy cost estimation ──────────────────────────────────

# Per-generation estimated costs (USD) for period before api_calls recording
_LEGACY_COST = {
    # kind, model_tier → USD
    ("cut", "gpt"):       Decimal("0.068"),   # OpenAI image $0.067 + 2 vision $0.0005
    ("cut", "flash"):     Decimal("0.034"),   # Gemini image $0.0336 + 2 vision $0.0005
    ("character", None):  Decimal("0.072"),   # Gemini image x2 (front+expr) + text
    ("location", None):   Decimal("0.037"),   # Gemini image + text
    ("product", None):    Decimal("0.001"),   # Gemini vision only
}


def estimate_legacy_costs(db, date_from: date, date_to: date) -> dict:
    """generation_logs 기반으로 api_calls 기록 이전 기간의 비용을 추정한다.

    Returns {"total_usd", "total_krw", "count", "by_purpose", "estimated": True}
    """
    from sqlalchemy import text as sa_text

    rows = db.execute(
        sa_text(
            "SELECT gl.kind, gl.model_tier, COUNT(*) AS cnt "
            "FROM generation_logs gl "
            "WHERE gl.created_at >= :dt_from AND gl.created_at < :dt_to "
            "GROUP BY gl.kind, gl.model_tier"
        ),
        {"dt_from": datetime.combine(date_from, datetime.min.time()),
         "dt_to": datetime.combine(date_to, datetime.min.time()) + timedelta(days=1)},
    ).fetchall()

    total_usd = Decimal("0")
    total_count = 0
    by_purpose: dict[str, dict] = {}

    for kind, model_tier, cnt in rows:
        # Look up cost: try (kind, model_tier) first, then (kind, None)
        unit_cost = _LEGACY_COST.get((kind, model_tier))
        if unit_cost is None:
            unit_cost = _LEGACY_COST.get((kind, None), Decimal("0.034"))

        cost = unit_cost * cnt
        total_usd += cost
        total_count += cnt

        purpose_key = kind or "unknown"
        if purpose_key not in by_purpose:
            by_purpose[purpose_key] = {"count": 0, "usd": Decimal("0")}
        by_purpose[purpose_key]["count"] += cnt
        by_purpose[purpose_key]["usd"] += cost

    # Exchange rate
    rate = _ensure_exchange_rate(db)
    total_krw = int(total_usd * rate)

    return {
        "total_usd": round(float(total_usd), 4),
        "total_krw": total_krw,
        "count": total_count,
        "by_purpose": {
            k: {"count": v["count"], "usd": round(float(v["usd"]), 4)}
            for k, v in by_purpose.items()
        },
        "estimated": True,
    }


def estimate_legacy_costs_daily(db, date_from: date, date_to: date) -> dict[str, int]:
    """generation_logs 기반 일별 추정 원가(KRW). {date_str: krw} 반환."""
    from sqlalchemy import text as sa_text

    rows = db.execute(
        sa_text(
            "SELECT DATE(gl.created_at) AS d, gl.kind, gl.model_tier, COUNT(*) AS cnt "
            "FROM generation_logs gl "
            "WHERE gl.created_at >= :dt_from AND gl.created_at < :dt_to "
            "GROUP BY d, gl.kind, gl.model_tier ORDER BY d"
        ),
        {"dt_from": datetime.combine(date_from, datetime.min.time()),
         "dt_to": datetime.combine(date_to, datetime.min.time()) + timedelta(days=1)},
    ).fetchall()

    rate = _ensure_exchange_rate(db)
    daily: dict[str, Decimal] = {}
    for d, kind, model_tier, cnt in rows:
        unit_cost = _LEGACY_COST.get((kind, model_tier))
        if unit_cost is None:
            unit_cost = _LEGACY_COST.get((kind, None), Decimal("0.034"))
        ds = str(d)
        daily[ds] = daily.get(ds, Decimal("0")) + unit_cost * cnt

    return {ds: int(v * rate) for ds, v in daily.items()}
