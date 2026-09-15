"""상품 조회 — DB 기준 (step23에서 packet_products 테이블로 이전)."""

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import SessionLocal


def get_product(code: str, db: Session | None = None) -> dict | None:
    """상품 코드로 조회. db 세션이 없으면 새로 생성."""
    close = False
    if db is None:
        db = SessionLocal()
        close = True
    try:
        row = db.execute(
            text("SELECT code, name, packets, price FROM packet_products WHERE code = :code AND is_visible = 1"),
            {"code": code},
        ).fetchone()
        if not row:
            return None
        return {"code": row[0], "name": row[1], "packets": row[2], "amount": row[3]}
    finally:
        if close:
            db.close()


def list_products(db: Session | None = None) -> list[dict]:
    """노출 상품 목록 (정렬 순서)."""
    close = False
    if db is None:
        db = SessionLocal()
        close = True
    try:
        rows = db.execute(
            text("SELECT code, name, packets, price FROM packet_products WHERE is_visible = 1 ORDER BY sort_order")
        ).fetchall()
        return [{"code": r[0], "name": r[1], "packets": r[2], "amount": r[3]} for r in rows]
    finally:
        if close:
            db.close()
