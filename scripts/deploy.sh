#!/usr/bin/env bash
# EziToon 배포: scp → systemctl restart → health JSON 확인 (--reload 사용 안 함)
#
# 사용 (저장소 루트, Git Bash):
#   scripts/deploy.sh backend/app/main.py backend/app/images/service.py   # 백엔드 파일들
#   scripts/deploy.sh --frontend                                          # vite build + dist 업로드
#   scripts/deploy.sh --frontend backend/app/x.py                         # 둘 다
#   scripts/deploy.sh --restart-only                                      # 업로드 없이 재시작·health
#
# 규칙: 진행 중 외부 API 연결(생성·모션·릴스)이 있으면 중단. FORCE=1 로 무시.
#       health는 -f 만이 아니라 JSON "status":"ok" 까지 확인(SPA fallback이 200 HTML을 주기 때문).
set -euo pipefail

KEY="${KEY:-$USERPROFILE/.ssh/DONGHAESSHKEy.pem}"
HOST="bitnami@52.79.94.122"
REMOTE="/home/bitnami/project-t"
INTERNAL_HEALTH="http://127.0.0.1:8000/health"
EXTERNAL_HEALTH="https://ssagda.com/WEBTOON/health"

cd "$(git rev-parse --show-toplevel)"
SSH=(ssh -i "$KEY" -o ConnectTimeout=15 "$HOST")
SCP=(scp -q -i "$KEY")

FRONTEND=0; RESTART_ONLY=0; FILES=()
for a in "$@"; do
  case "$a" in
    --frontend) FRONTEND=1 ;;
    --restart-only) RESTART_ONLY=1 ;;
    *) FILES+=("$a") ;;
  esac
done
if [ "$FRONTEND" = 0 ] && [ "$RESTART_ONLY" = 0 ] && [ ${#FILES[@]} = 0 ]; then
  sed -n '2,10p' "$0"; exit 1
fi

for f in "${FILES[@]}"; do
  case "$f" in
    backend/.env|*/.env) echo "ABORT: .env 통째 scp 금지 ($f)"; exit 1 ;;
    backend/*) [ -f "$f" ] || { echo "ABORT: 파일 없음 $f"; exit 1; } ;;
    *) echo "ABORT: backend/ 아래 파일만 ($f)"; exit 1 ;;
  esac
done

# 1) 진행 중 작업 확인
BUSY=$("${SSH[@]}" 'P=$(systemctl show -p MainPID --value ezitoon-api); ss -tnp state established 2>/dev/null | grep "pid=$P," | grep -c ":443 " || true')
echo "진행 중 외부 API 연결: $BUSY"
if [ "$BUSY" != "0" ] && [ "${FORCE:-0}" != "1" ]; then
  echo "ABORT: 생성 작업 진행 중으로 보임. 끝난 뒤 다시 실행(무시하려면 FORCE=1)"; exit 2
fi

# 2) 업로드
for f in "${FILES[@]}"; do
  "${SCP[@]}" "$f" "$HOST:$REMOTE/$f"; echo "scp $f"
done
if [ "$FRONTEND" = 1 ]; then
  (cd frontend && npx vite build)
  "${SCP[@]}" -r frontend/dist/. "$HOST:$REMOTE/backend/frontend/dist/"; echo "scp frontend/dist"
fi
VER=$(git rev-parse --short HEAD)$( [ -n "$(git status --porcelain)" ] && echo "-dirty" || true )
"${SSH[@]}" "echo '$VER' > $REMOTE/backend/VERSION"; echo "VERSION=$VER"

# 3) 재시작 + health
"${SSH[@]}" "sudo systemctl restart ezitoon-api && for i in \$(seq 1 30); do curl -fsS -m 2 $INTERNAL_HEALTH 2>/dev/null | grep -q '\"status\":\"ok\"' && exit 0; sleep 1; done; echo 'FAIL: 내부 health'; sudo journalctl -u ezitoon-api --no-pager -n 40; exit 3"
echo "내부 health: $("${SSH[@]}" "curl -fsS $INTERNAL_HEALTH")"
EXT=$(curl -fsS -m 10 "$EXTERNAL_HEALTH" || true)
echo "외부 health: $EXT"
echo "$EXT" | grep -q '"status":"ok"' || { echo "FAIL: 외부 health"; exit 4; }
echo "$EXT" | grep -q "\"version\":\"$VER\"" || { echo "WARN: 외부 version 불일치"; }
echo "배포 완료"
