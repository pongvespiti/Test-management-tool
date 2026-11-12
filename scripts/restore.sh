#!/usr/bin/env bash
# Restores a backup made by scripts/backup.sh. This REPLACES the current data.
#
#   scripts/restore.sh --yes <tmt-db-….sql.gz> [tmt-data-….tgz]
#
# Docker Compose: stops api and web, restores, starts them again.
# Plain host (BACKUP_MODE=host): needs DATABASE_URL (and DATA_DIR to restore the data files);
# stop the API first.
set -euo pipefail

if [ "${1:-}" != "--yes" ] || [ -z "${2:-}" ]; then
  echo "Usage: $0 --yes <tmt-db-….sql.gz> [tmt-data-….tgz]" >&2
  echo "This replaces the current database (and data files when a .tgz is given)." >&2
  exit 2
fi
db_file="$2"
data_file="${3:-}"
[ -f "$db_file" ] || { echo "No such file: $db_file" >&2; exit 2; }
[ -z "$data_file" ] || [ -f "$data_file" ] || { echo "No such file: $data_file" >&2; exit 2; }
gzip -t "$db_file"

mode="${BACKUP_MODE:-}"
if [ -z "$mode" ]; then
  if command -v docker >/dev/null 2>&1 && docker compose ps --status running --services 2>/dev/null | grep -qx db; then
    mode=docker
  else
    mode=host
  fi
fi

case "$mode" in
  docker)
    docker compose stop api web
    gunzip -c "$db_file" \
      | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q -o /dev/null'
    if [ -n "$data_file" ]; then
      volume="$(docker compose config --format json | sed -n 's/.*"name": *"\([^"]*\)".*/\1/p' | head -1)"
      volume="${TMT_DATA_VOLUME:-${volume:-tmt}_tmt-data}"
      docker run --rm -v "$volume":/data -v "$(cd "$(dirname "$data_file")" && pwd)":/backup:ro busybox \
        sh -c "rm -rf /data/* /data/.[!.]* 2>/dev/null; tar xzf /backup/$(basename "$data_file") -C /data"
    fi
    docker compose start api web
    ;;
  host)
    : "${DATABASE_URL:?set DATABASE_URL}"
    pg_url="$(printf '%s' "$DATABASE_URL" | sed 's/[?&]schema=[^&]*//')"
    gunzip -c "$db_file" | psql "$pg_url" -v ON_ERROR_STOP=1 -q -o /dev/null
    if [ -n "$data_file" ]; then
      : "${DATA_DIR:?set DATA_DIR to restore the data files}"
      mkdir -p "$DATA_DIR"
      tar xzf "$data_file" -C "$DATA_DIR"
    fi
    ;;
  *)
    echo "BACKUP_MODE must be docker or host" >&2
    exit 2
    ;;
esac
echo "Restored from $db_file${data_file:+ and $data_file}"
