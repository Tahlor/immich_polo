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

install -d -m 0750 "$(dirname "${DB_PATH}")"
cp --preserve=mode,timestamps "${SOURCE}" "${DB_PATH}.restore"
mv "${DB_PATH}.restore" "${DB_PATH}"
echo "restored ${DB_PATH} from ${SOURCE}; start Polo and run /ready plus application checks"
