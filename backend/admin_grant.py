#!/usr/bin/env python3
"""관리자 패킷 지급 스크립트.

사용법:
  python admin_grant.py <user_id> <amount>

예시:
  python admin_grant.py 3 100       # user_id=3에게 100패킷 지급
  python admin_grant.py 3 50        # user_id=3에게 50패킷 추가 지급

서버에서 실행:
  cd /home/bitnami/project-t/backend
  source venv/bin/activate
  python admin_grant.py 3 100
"""

import sys
import os

# 프로젝트 루트를 path에 추가
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.packets.service import grant_packets


def main():
    if len(sys.argv) != 3:
        print("사용법: python admin_grant.py <user_id> <amount>")
        print("예시:   python admin_grant.py 3 100")
        sys.exit(1)

    try:
        user_id = int(sys.argv[1])
        amount = int(sys.argv[2])
    except ValueError:
        print("오류: user_id와 amount는 정수여야 합니다")
        sys.exit(1)

    if amount <= 0:
        print("오류: amount는 양수여야 합니다")
        sys.exit(1)

    db = SessionLocal()
    try:
        new_balance = grant_packets(user_id, amount, db)
        db.commit()
        print(f"✓ user_id={user_id}에게 {amount}패킷 지급 완료. 현재 잔량: {new_balance}")
    except Exception as e:
        db.rollback()
        print(f"✗ 지급 실패: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
