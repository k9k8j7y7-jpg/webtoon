"""verify_step11.py — step11 마이그레이션 검증 스크립트.

전 에피소드 루프:
  구 쿼리 (Character.episode_id == eid) vs
  신 쿼리 (episode_characters JOIN) 결과 id 집합 비교
+ V1~V5 SQL 검증 쿼리 일괄 실행.

사용법:
  cd backend
  python scripts/verify_step11.py
"""

import sys
import os

# backend 디렉터리를 PYTHONPATH에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import SessionLocal


def main():
    db = SessionLocal()
    all_pass = True

    print("=" * 60)
    print("step11 마이그레이션 검증")
    print("=" * 60)

    # ------------------------------------------------------------------
    # V1: characters.project_id NULL 카운트 == 0
    # ------------------------------------------------------------------
    r = db.execute(text("SELECT COUNT(*) FROM characters WHERE project_id IS NULL")).scalar()
    status = "PASS" if r == 0 else "FAIL"
    if status == "FAIL":
        all_pass = False
    print(f"V1: project_id NULL count = {r} ... {status}")

    # ------------------------------------------------------------------
    # V2: episode_characters 행수 == characters 행수
    # ------------------------------------------------------------------
    ec_count = db.execute(text("SELECT COUNT(*) FROM episode_characters")).scalar()
    char_count = db.execute(text("SELECT COUNT(*) FROM characters")).scalar()
    status = "PASS" if ec_count == char_count else "FAIL"
    if status == "FAIL":
        all_pass = False
    print(f"V2: episode_characters={ec_count}, characters={char_count} ... {status}")

    # ------------------------------------------------------------------
    # V3: 전 에피소드 루프 — 구 쿼리 vs 신 쿼리 id 집합 비교
    # ------------------------------------------------------------------
    print(f"\nV3: 에피소드별 구/신 쿼리 id 집합 비교")
    episodes = db.execute(
        text("SELECT id FROM episodes WHERE deleted_at IS NULL ORDER BY id")
    ).fetchall()

    v3_all_pass = True
    for (eid,) in episodes:
        # 구 쿼리: Character.episode_id == eid
        old_ids = set(
            r[0] for r in db.execute(
                text("SELECT id FROM characters WHERE episode_id = :eid"),
                {"eid": eid},
            ).fetchall()
        )
        # 신 쿼리: episode_characters JOIN
        new_ids = set(
            r[0] for r in db.execute(
                text(
                    "SELECT c.id FROM characters c "
                    "JOIN episode_characters ec ON ec.character_id = c.id "
                    "WHERE ec.episode_id = :eid"
                ),
                {"eid": eid},
            ).fetchall()
        )

        if old_ids == new_ids:
            print(f"  episode {eid}: {len(old_ids)} chars ... PASS")
        else:
            only_old = old_ids - new_ids
            only_new = new_ids - old_ids
            print(f"  episode {eid}: FAIL — old_only={only_old}, new_only={only_new}")
            v3_all_pass = False
            all_pass = False

    if v3_all_pass:
        print(f"V3 전체: {len(episodes)} 에피소드 ... PASS")
    else:
        print(f"V3 전체: FAIL")

    # ------------------------------------------------------------------
    # V4: series 테이블 존재
    # ------------------------------------------------------------------
    try:
        db.execute(text("SELECT 1 FROM series LIMIT 0"))
        print(f"\nV4: series 테이블 존재 ... PASS")
    except Exception as e:
        print(f"\nV4: series 테이블 존재 ... FAIL ({e})")
        all_pass = False

    # ------------------------------------------------------------------
    # V5: schema_migrations 테이블 + step11 행 존재
    # ------------------------------------------------------------------
    try:
        r = db.execute(
            text("SELECT version FROM schema_migrations WHERE version = 'step11'")
        ).fetchone()
        status = "PASS" if r else "FAIL (행 없음)"
        if not r:
            all_pass = False
        print(f"V5: schema_migrations step11 행 ... {status}")
    except Exception as e:
        print(f"V5: schema_migrations 테이블 ... FAIL ({e})")
        all_pass = False

    # ------------------------------------------------------------------
    # 최종 결과
    # ------------------------------------------------------------------
    print("\n" + "=" * 60)
    if all_pass:
        print("전체 결과: ALL PASS")
    else:
        print("전체 결과: FAIL — 위 항목 확인 필요")
    print("=" * 60)

    db.close()
    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
