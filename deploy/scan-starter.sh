#!/bin/sh
# Start the GPU scan worker VM when scans are waiting (Beta 5). Runs on the app VM from cron
# every minute (see docs/deploy-cloud.md), so the app itself needs no cloud SDK. The worker VM
# powers itself off when it has been idle for a while (worker/run-once.sh).
#
# Reads DOMAIN and SCAN_WORKER_TOKEN from the app's .env, plus:
#   SCAN_WORKER_INSTANCE=i-0123456789abcdef0   (the GPU VM, required)
#   AWS_REGION=eu-central-1                    (default)
# Needs the `aws` CLI with a user that may only describe/start that one instance.
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

: "${DOMAIN:?Set DOMAIN in .env}"
: "${SCAN_WORKER_TOKEN:?Set SCAN_WORKER_TOKEN in .env}"
: "${SCAN_WORKER_INSTANCE:?Set SCAN_WORKER_INSTANCE (the GPU VM instance id)}"
REGION="${AWS_REGION:-eu-central-1}"
# A worker that keeps failing right after boot must not be restarted every minute.
STATE="${SCAN_STARTER_STATE:-/var/tmp/salla-scan-starter.last}"
MIN_GAP_SECONDS="${SCAN_MIN_RESTART_SECONDS:-600}"

count=$(curl -fsS --max-time 20 \
  -H "Authorization: Bearer $SCAN_WORKER_TOKEN" \
  "https://$DOMAIN/api/worker/pending" | sed -n 's/.*"count":\([0-9][0-9]*\).*/\1/p')
if [ -z "$count" ]; then
  echo "$(date -u +%FT%TZ) could not read the pending scan count" >&2
  exit 1
fi
[ "$count" -gt 0 ] || exit 0

state=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$SCAN_WORKER_INSTANCE" \
  --query 'Reservations[0].Instances[0].State.Name' --output text)
# running / pending: it will take the jobs. stopping: try again next minute.
[ "$state" = "stopped" ] || exit 0

now=$(date +%s)
last=$(cat "$STATE" 2>/dev/null || echo 0)
if [ $((now - last)) -lt "$MIN_GAP_SECONDS" ]; then
  echo "$(date -u +%FT%TZ) worker was started $((now - last)) s ago; waiting before restarting it"
  exit 0
fi

aws ec2 start-instances --region "$REGION" --instance-ids "$SCAN_WORKER_INSTANCE" --output text >/dev/null
echo "$now" >"$STATE"
echo "$(date -u +%FT%TZ) started the scan worker ($count scan(s) waiting)"
