#!/usr/bin/env python3
"""Run the photogrammetry scan worker on a RunPod GPU pod only while scans need it.

Runs on the app server from cron every minute (instead of deploy/scan-starter.sh, which starts
an AWS GPU VM):

  * * * * * /usr/bin/python3 /opt/salla/deploy/runpod/scan-runpod.py >> /var/log/salla-scan-runpod.log 2>&1

Reads from /opt/salla/.env: DOMAIN, SCAN_WORKER_TOKEN, RUNPOD_API_KEY and optionally
RUNPOD_NETWORK_VOLUME_ID (keeps Meshroom between pods; without it every pod downloads it again,
cheaper below ~30 GPU sessions a month), RUNPOD_GPU_TYPES (comma separated, cheapest first),
RUNPOD_CLOUD (COMMUNITY,SECURE = both; a network volume needs SECURE), RUNPOD_MAX_PRICE ($/h,
default 0.60; every suitable GPU in the live catalog up to this price is tried, cheapest first),
RUNPOD_IDLE_MINUTES (default 5), RUNPOD_MAX_POD_HOURS (default 4).

* A scan waits and no pod runs  -> create one (start command: deploy/runpod/pod-start.sh).
* Nothing waited or ran for RUNPOD_IDLE_MINUTES, a pod has stopped, or it is older than
  RUNPOD_MAX_POD_HOURS -> delete it, so the GPU is never billed while idle.
`--status` prints the decision inputs without changing anything.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATE = os.environ.get("SCAN_RUNPOD_STATE", "/var/tmp/salla-scan-runpod.json")
POD_NAME = "salla-scan-worker"
API = "https://api.runpod.io/v2"
# AliceVision's official image: Meshroom 2025.1.0 already inside (zenodo.org, where the release
# tarball lives, answers 403 to RunPod's machines). Ubuntu 22.04, CUDA 12.1.
IMAGE = "alicevision/meshroom:2025.1.0-av3.3.0-ubuntu22.04-cuda12.1.1"
# Tried in this order (cheapest first, Nov 2026: community A5000 $0.16/h). IDs from
# GET /v2/catalog/gpus. Meshroom needs CUDA; 16 GB of GPU memory is plenty.
DEFAULT_GPUS = (
    "NVIDIA RTX A5000,NVIDIA RTX A4000,NVIDIA RTX A4500,NVIDIA RTX 4000 Ada Generation,"
    "NVIDIA GeForce RTX 3090,NVIDIA RTX 2000 Ada Generation"
)
# A pod that keeps failing must not be recreated every minute.
MIN_CREATE_GAP_S = 600


def log(msg):
    print(time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), msg, flush=True)


def read_env():
    env = {}
    path = os.path.join(ROOT, ".env")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip("'\"")
    env.update({k: v for k, v in os.environ.items() if k.startswith(("RUNPOD_", "DOMAIN", "SCAN_"))})
    return env


def http(method, url, token, body=None, timeout=30):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read()
            return json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:500]
        raise RuntimeError(f"{method} {url.split('?')[0]} -> {e.code}: {detail}") from None


def load_state():
    try:
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_state(state):
    tmp = STATE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f)
    os.replace(tmp, STATE)


def worker_pods(key):
    pods, cursor = [], None
    while True:
        page = http("GET", f"{API}/pods" + (f"?cursor={cursor}" if cursor else ""), key) or {}
        pods += page.get("pods", [])
        nxt = page.get("pagination") or {}
        if not nxt.get("hasNextPage"):
            break
        cursor = nxt.get("nextCursor")
    return [p for p in pods if p.get("name") == POD_NAME]


def create_pod(env, key):
    with open(os.path.join(ROOT, "deploy", "runpod", "pod-start.sh"), encoding="utf-8") as f:
        script = f.read().replace("\r\n", "\n")
    pod_env = {
        "APP_URL": f"https://{env['DOMAIN']}",
        "SCAN_WORKER_TOKEN": env["SCAN_WORKER_TOKEN"],
    }
    for k in ("REPO_URL", "MESHROOM_BATCH", "MESHROOM_URL_FALLBACK", "UPDATE_WORKER", "MESHROOM_PARAMS", "MESHROOM_PARAMS_QUICK",
              "TARGET_TRIANGLES", "MAX_JOB_MINUTES"):
        if env.get(f"RUNPOD_{k}"):
            pod_env[k] = env[f"RUNPOD_{k}"]
    volume = env.get("RUNPOD_NETWORK_VOLUME_ID", "")
    body = {
        "name": POD_NAME,
        "image": IMAGE,
        "env": pod_env,
        # Override the image's own entrypoint so only our start script runs.
        "entrypoint": ["/bin/bash", "-c"],
        "cmd": [script],
    }
    if volume:
        clouds = ["SECURE"]
        body.update(mounts={"network": [{"volumeId": volume, "path": "/workspace"}]}, disk=30)
    else:
        clouds = [c.strip() for c in env.get("RUNPOD_CLOUD", "COMMUNITY,SECURE").split(",") if c.strip()]
        # Meshroom (~11 GB unpacked), Node.js, frames and the model live on the container disk.
        body.update(disk=35)
    errors = []
    # v2 takes one GPU type per request. Stock changes by the minute, so try every suitable
    # (cloud, GPU) pair from the live catalog, cheapest first, up to RUNPOD_MAX_PRICE per hour.
    for cloud, gpu, price in gpu_candidates(env, key, clouds):
        req = dict(body, cloud=cloud, gpu={"id": gpu, "count": 1, "minCudaVersion": "12.1"})
        try:
            pod = http("POST", f"{API}/pods", key, req, timeout=60)
            if pod and pod.get("id"):
                return pod
            errors.append(f"{cloud}/{gpu}: no pod in answer")
        except RuntimeError as e:
            errors.append(f"{cloud}/{gpu} ${price}: {'no stock' if 'no longer any instances' in str(e) else str(e)[-120:]}")
    raise RuntimeError(" | ".join(errors) or "no GPU type under the price cap")


# Blackwell cards need newer CUDA than the Meshroom 2025 build; data-center cards cost too much.
SKIP_GPUS = ("5090", "5080", "5070", "B200", "B300", "RTX PRO", "H100", "H200", "A100", "MI300")


def gpu_candidates(env, key, clouds):
    """(cloud, gpu id, $/h) pairs, cheapest first: RUNPOD_GPU_TYPES if set, else the catalog."""
    max_price = float(env.get("RUNPOD_MAX_PRICE", "0.60"))
    if env.get("RUNPOD_GPU_TYPES"):
        ids = [g.strip() for g in env["RUNPOD_GPU_TYPES"].split(",") if g.strip()]
        return [(c, g, "?") for c in clouds for g in ids]
    try:
        d = http("GET", f"{API}/catalog/gpus", key)
        items = d.get("gpus", d) if isinstance(d, dict) else d
    except RuntimeError as e:
        log(f"catalog not available ({e}); using the default GPU list")
        return [(c, g, "?") for c in clouds for g in DEFAULT_GPUS.split(",")]
    out = []
    for g in items:
        gid = g.get("id", "")
        if "nvidia" not in (g.get("manufacturer", "") + gid).lower() or (g.get("memory") or 0) < 16:
            continue
        if any(s in gid for s in SKIP_GPUS):
            continue
        for cloud in clouds:
            price = (g.get("price") or {}).get(cloud.lower())
            if g.get(cloud.lower()) and price and price <= max_price:
                out.append((price, cloud, gid))
    return [(c, gid, p) for p, c, gid in sorted(out)]


def main():
    env = read_env()
    for name in ("DOMAIN", "SCAN_WORKER_TOKEN", "RUNPOD_API_KEY"):
        if not env.get(name):
            log(f"{name} is not set in {ROOT}/.env")
            return 1
    key = env["RUNPOD_API_KEY"]
    idle_s = float(env.get("RUNPOD_IDLE_MINUTES", "5")) * 60
    max_age_s = float(env.get("RUNPOD_MAX_POD_HOURS", "4")) * 3600
    app = f"https://{env['DOMAIN']}/api/worker"
    tok = env["SCAN_WORKER_TOKEN"]

    try:
        pending = int((http("GET", f"{app}/pending", tok, timeout=20) or {}).get("count", 0))
        status = http("GET", f"{app}/status", tok, timeout=20) or {}
    except Exception as e:  # noqa: BLE001 - app unreachable: change nothing
        log(f"app not reachable, doing nothing: {e}")
        return 1
    busy = pending > 0 or int(status.get("processing", 0)) > 0

    now = time.time()
    state = load_state()
    if busy:
        state["lastBusy"] = now
    pods = worker_pods(key)

    if "--status" in sys.argv:
        print(json.dumps({"pending": pending, "status": status, "busy": busy, "state": state,
                          "pods": [{k: p.get(k) for k in ("id", "status", "cost", "gpu", "cloud")}
                                   for p in pods]}, indent=2, default=str))
        return 0

    alive = []
    for p in pods:
        created = state.get("pods", {}).get(p["id"], now)
        reason = None
        if p.get("status") in ("EXITED", "TERMINATED", "ERROR"):
            reason = f"it is {p.get('status')}"
        elif not busy and now - state.get("lastBusy", 0) >= idle_s:
            reason = f"no scans for {int((now - state.get('lastBusy', 0)) / 60)} min"
        elif now - created >= max_age_s:
            reason = f"it ran longer than {max_age_s / 3600:g} h"
        if reason:
            http("DELETE", f"{API}/pods/{p['id']}", key)
            state.get("pods", {}).pop(p["id"], None)
            log(f"deleted pod {p['id']} ({reason})")
        else:
            state.setdefault("pods", {}).setdefault(p["id"], now)
            alive.append(p)

    if pending > 0 and not alive:
        if os.path.exists(os.path.join(ROOT, "RUNPOD_PAUSED")):
            log(f"{pending} scan(s) waiting, but {ROOT}/RUNPOD_PAUSED exists: not starting a GPU")
        elif now - state.get("lastCreate", 0) < MIN_CREATE_GAP_S:
            log("a pod was created recently; waiting before creating another")
        else:
            try:
                pod = create_pod(env, key)
                # Only a pod that really started counts: a failed attempt (no stock) costs nothing
                # and is retried next minute.
                state["lastCreate"] = now
                state.setdefault("pods", {})[pod["id"]] = now
                log(f"created pod {pod['id']} ({pending} scan(s) waiting, "
                    f"{(pod.get('gpu') or {}).get('id', 'GPU')} {pod.get('cloud', '')}, "
                    f"${pod.get('cost', '?')}/h)")
            except Exception as e:  # noqa: BLE001
                log(f"could not create a pod: {e}")

    save_state(state)
    return 0


if __name__ == "__main__":
    sys.exit(main())
