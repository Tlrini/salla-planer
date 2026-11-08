/**
 * When someone last used the app (an agent with a session, or a client on a share link). The
 * app server's auto-stop (deploy/idle-stop.sh) reads it through GET /api/worker/status and
 * powers the VM off after a quiet period. In memory only: it starts at boot time, so a server
 * that was just started always gets a full idle period before it may stop.
 */
let last = Date.now();

export function markActivity(now = Date.now()): void {
  if (now > last) last = now;
}

export function lastActivity(): number {
  return last;
}
