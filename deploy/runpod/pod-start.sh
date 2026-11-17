#!/bin/bash
# Start command of the RunPod GPU pod that runs the photogrammetry scan worker (Beta 5).
# deploy/runpod/scan-runpod.py creates the pod with this script as its start command; nothing
# reaches the pod from outside: the worker only calls the app over HTTPS.
#
# Image: alicevision/meshroom (Meshroom inside). Node.js and the built worker go to /workspace;
# with a network volume there only the first pod installs them, otherwise every pod does (~1 min).
# Pod env (set by scan-runpod.py): APP_URL, SCAN_WORKER_TOKEN, optional REPO_URL, MESHROOM_BATCH,
# MESHROOM_URL_FALLBACK (a Meshroom .tar.gz if the image has none), UPDATE_WORKER=1.
set -uo pipefail
V=/workspace

# Diagnostics: everything this script and the worker print also goes to /tmp/www/log.txt, served
# on port 8000 (https://<pod id>-8000.proxy.runpod.net/log.txt) while the pod lives. It holds no
# secrets: the worker token stays in the environment and is never printed.
mkdir -p /tmp/www
exec > >(tee -a /tmp/www/log.txt) 2>&1
# Waits for python3 (in the image, or installed by setup below) instead of running apt itself.
(until command -v python3 >/dev/null 2>&1; do sleep 5; done
  cd /tmp/www && exec python3 -m http.server 8000 >/dev/null 2>&1) &
REPO_URL="${REPO_URL:-https://github.com/Tlrini/salla-planer.git}"
log() { echo "$(date -u +%FT%TZ) pod-start: $*"; }

setup() {
  mkdir -p "$V" || return 1
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq &&
    apt-get install -y -qq --no-install-recommends ca-certificates curl git xz-utils ffmpeg \
      assimp-utils libgomp1 libgl1 libglib2.0-0 libxkbcommon0 python3-minimal >/dev/null || return 1

  if [ ! -x "$V/node/bin/node" ]; then
    log "installing Node.js 22"
    name=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt |
      grep -o 'node-v22[0-9.]*-linux-x64.tar.xz' | head -n 1) || return 1
    rm -rf "$V/node" "$V/node.tmp" && mkdir -p "$V/node.tmp" &&
      curl -fsSL "https://nodejs.org/dist/latest-v22.x/$name" | tar -xJ -C "$V/node.tmp" --strip-components=1 &&
      mv "$V/node.tmp" "$V/node" || return 1
  fi
  export PATH="$V/node/bin:$PATH"

  # The pod image is AliceVision's official alicevision/meshroom image, so Meshroom is already
  # inside (zenodo.org refuses downloads from RunPod's machines). Find its batch command.
  MESHROOM_BATCH="${MESHROOM_BATCH:-}"
  if [ -z "$MESHROOM_BATCH" ] || [ ! -x "$MESHROOM_BATCH" ]; then
    MESHROOM_BATCH=$(command -v meshroom_batch 2>/dev/null ||
      find /opt "$V/meshroom" -maxdepth 4 -name meshroom_batch -type f -perm -u+x 2>/dev/null | head -n 1)
  fi
  if [ -z "$MESHROOM_BATCH" ] && [ -n "${MESHROOM_URL_FALLBACK:-}" ]; then
    log "Meshroom not in the image; downloading it"
    rm -rf "$V/meshroom" && mkdir -p "$V/meshroom" &&
      curl -fL --retry 3 -sS "$MESHROOM_URL_FALLBACK" | tar -xz -C "$V/meshroom" --strip-components=1 &&
      MESHROOM_BATCH="$V/meshroom/meshroom_batch"
  fi
  [ -n "$MESHROOM_BATCH" ] && [ -x "$MESHROOM_BATCH" ] || { log "meshroom_batch not found"; return 1; }
  log "using $MESHROOM_BATCH"
  export MESHROOM_BATCH

  if [ ! -f "$V/worker/dist/main.js" ] || [ "${UPDATE_WORKER:-0}" = 1 ]; then
    log "building the worker from $REPO_URL"
    rm -rf "$V/src" "$V/worker.tmp" &&
      git clone -q --depth 1 "$REPO_URL" "$V/src" &&
      cp -r "$V/src/worker" "$V/worker.tmp" &&
      (cd "$V/worker.tmp" && npm install --no-audit --no-fund --silent &&
        npx tsc -p tsconfig.json && npm prune --omit=dev --silent) &&
      rm -rf "$V/worker" && mv "$V/worker.tmp" "$V/worker" || return 1
  fi
}

if setup; then
  nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader || true
  # Meshroom used a single core on RunPod: let OpenMP use every CPU this container may use.
  cpus=$(nproc)
  quota=$(cat /sys/fs/cgroup/cpu.max 2>/dev/null || echo unknown)
  export OMP_NUM_THREADS="${OMP_NUM_THREADS:-$cpus}"
  log "cpus=$cpus cgroup cpu.max=$quota OMP_NUM_THREADS=$OMP_NUM_THREADS"
  log "meshroom_batch options: $("$MESHROOM_BATCH" --help 2>&1 | grep -oE -- '--[a-zA-Z]+' | sort -u | tr '\n' ' ')"
  # Meshroom's per-step logs and a CPU/GPU snapshot every 30 s, served next to log.txt.
  ln -sfn /tmp/MeshroomCache /tmp/www/cache
  (while true; do
     { date -u +%FT%TZ; nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv,noheader
       top -b -n 1 -w 200 | sed -n '1,4p;7,14p'; } > /tmp/www/stats.tmp 2>&1
     mv /tmp/www/stats.tmp /tmp/www/stats.txt; sleep 30
   done) &
  log "starting the scan worker"
  cd "$V/worker" &&
    WORK_DIR=/tmp/work IDLE_EXIT_MINUTES=60 node dist/main.js
  log "worker exited with status $?"
else
  log "setup failed"
fi

# The app server's controller (scan-runpod.py) deletes idle pods. As a second guard the pod also
# removes itself (RunPod gives every pod a key limited to that pod), then waits.
if [ -n "${RUNPOD_POD_ID:-}" ] && [ -n "${RUNPOD_API_KEY:-}" ]; then
  log "stopping this pod"
  curl -fsS -X POST -H "Authorization: Bearer $RUNPOD_API_KEY" -H "Content-Type: application/json" \
    -d '{"action":"stop"}' "https://api.runpod.io/v2/pods/$RUNPOD_POD_ID/action" >/dev/null || true
fi
sleep infinity
