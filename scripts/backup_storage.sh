#!/bin/bash
# EziToon storage 백업 — /home/bitnami/project-t/storage/ → tar.gz
# 2개 보관, 디스크 여유 20% 미만이면 건너뛰기
set -euo pipefail

STORAGE_DIR="/home/bitnami/project-t/storage"
BACKUP_DIR="$HOME/backups/storage"
LOG="$HOME/backups/backup.log"
KEEP=2
DATE=$(date +%Y%m%d)
OUT="$BACKUP_DIR/storage_${DATE}.tar.gz"

log_msg() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"; }

# 디스크 여유 확인
AVAIL_PCT=$(df /home/bitnami --output=pcent | tail -1 | tr -d ' %')
USED_PCT=$((100 - AVAIL_PCT))
if [ "$USED_PCT" -ge 80 ]; then
    log_msg "Storage backup SKIPPED: disk ${USED_PCT}% used (>= 80%)"
    exit 0
fi

log_msg "Storage backup start (disk ${USED_PCT}% used)"

tar czf "$OUT" -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")" 2>>"$LOG"

SIZE=$(du -h "$OUT" | cut -f1)
log_msg "Storage backup done: $OUT ($SIZE)"

# 오래된 파일 삭제 (최신 KEEP개만 보관)
cd "$BACKUP_DIR"
ls -1t storage_*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
REMAINING=$(ls -1 storage_*.tar.gz 2>/dev/null | wc -l)
log_msg "Retained $REMAINING storage backups"
