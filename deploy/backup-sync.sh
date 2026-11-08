#!/bin/sh
# Copy the app's daily database backups and the uploaded 3D models to cloud object storage.
# Runs on the VM host from cron (see docs/deploy-cloud.md), so the app needs no cloud SDK.
#
#   BACKUP_TARGET=s3://my-bucket/salla                                   (AWS, needs `aws` CLI)
#   BACKUP_TARGET='https://acct.blob.core.windows.net/salla?<SAS token>'  (Azure, needs `azcopy`)
#
# Usage: BACKUP_TARGET=... deploy/backup-sync.sh
set -eu
# cron's PATH has no /snap/bin, where Ubuntu 24.04 installs the aws CLI.
PATH="/snap/bin:/usr/local/bin:$PATH"
export PATH

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/data"
# BACKUP_TARGET may come from the app's .env (the cron line no longer has to pass it).
if [ -z "${BACKUP_TARGET:-}" ] && [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi
TARGET="${BACKUP_TARGET:?Set BACKUP_TARGET (s3://... or https://<account>.blob.core.windows.net/...)}"

[ -d "$DATA/backups" ] || { echo "No $DATA/backups yet (the app creates it on start)." >&2; exit 1; }
mkdir -p "$DATA/uploads"

case "$TARGET" in
  s3://*)
    # No --delete: old daily copies stay in the bucket (expire them with a lifecycle rule).
    aws s3 sync "$DATA/backups" "${TARGET%/}/backups" --only-show-errors
    aws s3 sync "$DATA/uploads" "${TARGET%/}/uploads" --only-show-errors
    ;;
  https://*.blob.core.windows.net/*)
    # Split "https://acct.blob.core.windows.net/container?sas" into base URL and SAS query.
    base="${TARGET%%\?*}"
    sas=""
    case "$TARGET" in *\?*) sas="?${TARGET#*\?}" ;; esac
    azcopy sync "$DATA/backups" "${base%/}/backups$sas" --recursive=true --delete-destination=false
    azcopy sync "$DATA/uploads" "${base%/}/uploads$sas" --recursive=true --delete-destination=false
    ;;
  *)
    echo "BACKUP_TARGET must start with s3:// or https://<account>.blob.core.windows.net/" >&2
    exit 1
    ;;
esac

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) backup sync to ${TARGET%%\?*} done"
