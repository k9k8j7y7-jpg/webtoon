#!/bin/bash
# EziToon DB 백업 — backend/.env에서 DB 접속 정보 읽기
# 비밀번호는 환경변수·파이프로만 전달 (echo·로그 금지)
set -euo pipefail

ENV_FILE="/home/bitnami/project-t/backend/.env"
BACKUP_DIR="$HOME/backups/daily"
LOG="$HOME/backups/backup.log"
MYSQLDUMP="/opt/bitnami/mariadb/bin/mysqldump"
KEEP_DAYS=14
DATE=$(date +%Y%m%d)

# .env에서 DB 값 읽기
_read_env() { grep "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"'"; }
_DB_HOST=$(_read_env DB_HOST)
_DB_PORT=$(_read_env DB_PORT)
_DB_USER=$(_read_env DB_USER)
_DB_PASS=$(_read_env DB_PASSWORD)
_DB_NAME=$(_read_env DB_NAME)

OUT="$BACKUP_DIR/project_t_${DATE}.sql.gz"

log_msg() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"; }

log_msg "DB backup start"

# mysqldump → gzip
"$MYSQLDUMP" \
  --host="${_DB_HOST}" --port="${_DB_PORT}" \
  --user="${_DB_USER}" --password="${_DB_PASS}" \
  --single-transaction --routines --triggers \
  "${_DB_NAME}" 2>>"$LOG" | gzip > "$OUT"

SIZE=$(du -h "$OUT" | cut -f1)
log_msg "DB backup done: $OUT ($SIZE)"

# 14일 넘은 파일 삭제
find "$BACKUP_DIR" -name "project_t_*.sql.gz" -mtime +${KEEP_DAYS} -delete 2>>"$LOG"
REMAINING=$(ls -1 "$BACKUP_DIR"/project_t_*.sql.gz 2>/dev/null | wc -l)
log_msg "Retained $REMAINING daily backups"
