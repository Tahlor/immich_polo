#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <backup.sqlite>" >&2
  exit 2
fi

SOURCE="$1"
DB_PATH="${DATABASE_PATH:-/var/lib/immich-polo/polo.sqlite}"

if [[ ! -f "${SOURCE}" ]]; then
  echo "backup does not exist: ${SOURCE}" >&2
  exit 1
fi

if systemctl is-active --quiet immich-polo.service 2>/dev/null; then
  echo "refusing to restore while immich-polo.service is active" >&2
  exit 1
fi

DB_DIR="$(dirname "${DB_PATH}")"
if [[ ! -d "${DB_DIR}" ]]; then
  echo "create ${DB_DIR} owned by the Polo service user before restoring" >&2
  exit 1
fi
if ! command -v sqlite3 >/dev/null 2>&1 || [[ "$(sqlite3 "${SOURCE}" 'PRAGMA integrity_check;')" != ok ]]; then
  echo "sqlite3 CLI and an integrity-checked backup are required" >&2
  exit 1
fi

# Backups may be root-owned. Keep the existing database's runtime ownership,
# or the prepared data directory's ownership on a fresh installation.
OWNER_PATH="${DB_PATH}"
if [[ ! -f "${OWNER_PATH}" ]]; then OWNER_PATH="${DB_DIR}"; fi
DB_OWNER="$(stat -c %u "${OWNER_PATH}")"
DB_GROUP="$(stat -c %g "${OWNER_PATH}")"
install -o "${DB_OWNER}" -g "${DB_GROUP}" -m 0600 "${SOURCE}" "${DB_PATH}.restore"
# The service is stopped; stale sidecars must not replay the pre-restore WAL.
rm -f "${DB_PATH}-wal" "${DB_PATH}-shm"
mv "${DB_PATH}.restore" "${DB_PATH}"
echo "restored ${DB_PATH} from ${SOURCE}; start Polo and run /ready plus application checks"
