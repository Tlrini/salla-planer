#!/bin/sh
# Started by systemd at every boot of the GPU VM (salla-scan-worker.service). Runs the worker
# until it has had no scans for IDLE_EXIT_MINUTES, then powers the VM off, so the GPU is only
# billed while scans are processed. The app VM starts this VM again when new scans wait
# (deploy/scan-starter.sh).
#
# Maintenance: `sudo touch /opt/salla-worker/STAY_ON` keeps the VM running after the worker
# exits (remove the file afterwards). A pending power-off can be cancelled with `sudo shutdown -c`.
set -u
DIR=/opt/salla-worker
mkdir -p "$DIR/work"

docker run --rm --gpus all --env-file "$DIR/.env" -v "$DIR/work:/work" salla-scan-worker:latest
status=$?
echo "scan worker exited with status $status"

if [ -e "$DIR/STAY_ON" ]; then
  echo "$DIR/STAY_ON exists: not powering off"
  exit 0
fi
# One minute of grace to log in and cancel; then the instance stops (EBS disk is kept).
/sbin/shutdown -h +1 "Salla scan worker idle, powering off"
