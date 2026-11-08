#!/bin/sh
# Power the app server off when nobody has used it for a while (on/off EC2 setup, see
# docs/deploy-cloud.md §2). Runs from root's cron every 5 minutes:
#   */5 * * * * /opt/salla/deploy/idle-stop.sh >> /var/log/salla-idle-stop.log 2>&1
#
# Reads from the app's .env: DOMAIN, SCAN_WORKER_TOKEN (the status route uses it),
# optional IDLE_STOP_MINUTES (default 60; 0 = never stop), SCAN_WAIT_LIMIT_MINUTES (default
# 120) and BACKUP_TARGET (then deploy/backup-sync.sh runs before powering off).
# Maintenance: `sudo touch /opt/salla/STAY_ON` keeps the server on (remove it afterwards).
# Whenever something is unclear (app not reachable, odd answer) it does nothing: staying on
# costs a few cents an hour, stopping in the middle of work costs more.
set -eu
# cron's PATH has no /snap/bin, where Ubuntu 24.04 installs the aws CLI.
PATH="/snap/bin:/usr/local/bin:$PATH"
export PATH

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

log() { echo "$(date -u +%FT%TZ) $*"; }

: "${DOMAIN:?Set DOMAIN in .env}"
: "${SCAN_WORKER_TOKEN:?Set SCAN_WORKER_TOKEN in .env (the auto-stop needs it)}"
IDLE_MIN="${IDLE_STOP_MINUTES:-60}"
SCAN_WAIT_MIN="${SCAN_WAIT_LIMIT_MINUTES:-120}"
# A server that was just started (by the start link, for an agent on the way) stays on a while.
MIN_UPTIME_SECONDS=1200

[ "$IDLE_MIN" -gt 0 ] || exit 0
[ ! -e "$ROOT/STAY_ON" ] || exit 0
uptime_s=$(cut -d. -f1 /proc/uptime)
[ "$uptime_s" -ge "$MIN_UPTIME_SECONDS" ] || exit 0

if ! json=$(curl -fsS --max-time 20 -H "Authorization: Bearer $SCAN_WORKER_TOKEN" \
  "https://$DOMAIN/api/worker/status"); then
  log "app status not reachable; staying on"
  exit 0
fi
# {"lastActivityAt":"2026-11-06T18:01:02.000Z","queued":0,"processing":0,"oldestQueuedAt":null}
field() { printf '%s' "$json" | sed -n "s/.*\"$1\":\"\{0,1\}\([^\",}]*\).*/\1/p"; }
last=$(field lastActivityAt)
queued=$(field queued)
processing=$(field processing)
oldest=$(field oldestQueuedAt)
if [ -z "$last" ] || [ -z "$queued" ] || [ -z "$processing" ]; then
  log "unexpected status answer, staying on: $json"
  exit 0
fi

now=$(date +%s)
# A scan is being processed: the GPU worker must be able to deliver its model.
[ "$processing" -eq 0 ] || exit 0
# Scans waiting for the GPU: wait for them, but not forever if the GPU never comes.
if [ "$queued" -gt 0 ] && [ -n "$oldest" ] && [ "$oldest" != "null" ]; then
  oldest_s=$(date -d "$oldest" +%s)
  [ $((now - oldest_s)) -ge $((SCAN_WAIT_MIN * 60)) ] || exit 0
  log "ignoring $queued scan(s) waiting since $oldest (the GPU worker is not taking them)"
fi

idle_min=$(((now - $(date -d "$last" +%s)) / 60))
[ "$idle_min" -ge "$IDLE_MIN" ] || exit 0

log "nobody used the app for $idle_min min; powering off"
if [ -n "${BACKUP_TARGET:-}" ]; then
  "$ROOT/deploy/backup-sync.sh" || log "backup sync failed (powering off anyway; data stays on the disk)"
fi
/sbin/shutdown -h now "Salla Planner idle for $idle_min min"
