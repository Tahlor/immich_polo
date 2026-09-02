#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${DATABASE_PATH:-/var/lib/immich-polo/polo.sqlite}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/immich-polo}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${BACKUP_DIR}/polo-${STAMP}.sqlite"

install -d -m 0750 "${BACKUP_DIR}"

if [[ ! -f "${DB_PATH}" ]]; then
  echo "Polo database does not exist: ${DB_PATH}" >&2
  exit 1
fi

# Use SQLite's online backup command when sqlite3 is available so a running
# database is copied consistently. Do not plain-cp a live database.
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "${DB_PATH}" ".backup '${DEST}'"
else
  echo "sqlite3 CLI is required for a consistent live backup" >&2
  exit 1
fi

chmod 0640 "${DEST}"
echo "${DEST}"
