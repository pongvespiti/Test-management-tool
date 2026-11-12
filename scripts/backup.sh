#!/usr/bin/env bash
# Backs up the TMT database and the data directory (attachments, report templates, app-secret).
#
#   scripts/backup.sh [target-dir]          # default ./backups
#
# Docker Compose install (default when `docker` is available and a compose project is running):
#   run from the folder that holds docker-compose.yml and .env.
# Plain host install (BACKUP_MODE=host, or no docker): set DATABASE_URL (and DATA_DIR for the files).
#
# KEEP_DAYS (default 14) deletes this script's backups older than that; KEEP_DAYS=0 keeps all.
# Each run writes two files named with the same time stamp:
#   tmt-db-<stamp>.sql.gz      PostgreSQL dump (restorable with scripts/restore.sh)
#   tmt-data-<stamp>.tgz       data directory (skipped on a host install without DATA_DIR)
set -euo pipefail

target="${1:-./backups}"
keep_days="${KEEP_DAYS:-14}"
stamp="$(date +%Y%m%d-%H%M%S)"
mode="${BACKUP_MODE:-}"
if [ -z "$mode" ]; then
  if command -v docker >/dev/null 2>&1 && docker compose ps --status running --services 2>/dev/null | grep -qx db; then
    mode=docker
  else
    mode=host
  fi
fi

mkdir -p "$target"
target="$(cd "$target" && pwd)"
db_file="$target/tmt-db-$stamp.sql.gz"
data_file="$target/tmt-data-$stamp.tgz"

cleanup_partial() {
  rm -f "$db_file.partial" "$data_file.partial"
}
trap cleanup_partial EXIT

case "$mode" in
  docker)
    # --clean --if-exists: the dump replaces what is there when restored.
    docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --clean --if-exists' \
      | gzip > "$db_file.partial"
    volume="$(docker compose config --format json | sed -n 's/.*"name": *"\([^"]*\)".*/\1/p' | head -1)"
    volume="${TMT_DATA_VOLUME:-${volume:-tmt}_tmt-data}"
    docker run --rm -v "$volume":/data:ro -v "$target":/backup busybox \
      tar czf "/backup/$(basename "$data_file").partial" -C /data .
    ;;
  host)
    : "${DATABASE_URL:?set DATABASE_URL (the API connection string)}"
    # pg_dump does not know Prisma's ?schema=… option.
    pg_url="$(printf '%s' "$DATABASE_URL" | sed 's/[?&]schema=[^&]*//')"
    pg_dump "$pg_url" --no-owner --clean --if-exists | gzip > "$db_file.partial"
    if [ -n "${DATA_DIR:-}" ] && [ -d "$DATA_DIR" ]; then
      tar czf "$data_file.partial" -C "$DATA_DIR" .
    fi
    ;;
  *)
    echo "BACKUP_MODE must be docker or host" >&2
    exit 2
    ;;
esac

# A dump that is not a complete gzip stream, or has no tables, is not a backup.
gzip -t "$db_file.partial"
# (grep -c reads everything: `grep -q` would end the pipe early and fail under pipefail.)
tables="$(gunzip -c "$db_file.partial" | grep -c 'CREATE TABLE' || true)"
if [ "$tables" -eq 0 ]; then
  echo "The dump holds no tables, not keeping it." >&2
  exit 1
fi
mv "$db_file.partial" "$db_file"
if [ -f "$data_file.partial" ]; then
  tar tzf "$data_file.partial" >/dev/null
  mv "$data_file.partial" "$data_file"
fi

if [ "$keep_days" -gt 0 ]; then
  find "$target" -maxdepth 1 -type f \( -name 'tmt-db-*.sql.gz' -o -name 'tmt-data-*.tgz' \) \
    -mtime "+$keep_days" -delete
fi

echo "Backed up ($mode): $db_file"
[ -f "$data_file" ] && echo "                   $data_file"
exit 0
