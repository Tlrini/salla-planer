import { z } from 'zod';
import { Hall } from './schemas.js';

/**
 * In-page scanning (Beta 5): an agent films or photographs a decoration, the server queues a
 * scan job, a GPU worker (separate VM, started on demand) turns it into a .glb, the agent crops
 * it and it becomes a library decor like an uploaded scan.
 *
 *   queued ──claim──▶ processing ──result──▶ ready ──finish──▶ done
 *     ▲                  │  ▲                               (library item)
 *     │                  │  └── stale claim (worker died) ──┐
 *     └──── retry ◀── failed ◀──────────────────────────────┘ (too many attempts)
 */

export const ScanStatus = z.enum(['queued', 'processing', 'ready', 'failed', 'done']);
export type ScanStatus = z.infer<typeof ScanStatus>;

export const ScanSource = z.enum(['video', 'photos']);
export type ScanSource = z.infer<typeof ScanSource>;

/** A decoration (-> library decor) or a whole empty hall (-> hall template with a plan photo). */
export const ScanPurpose = z.enum(['decor', 'hall']);
export type ScanPurpose = z.infer<typeof ScanPurpose>;

/** What the worker is doing right now (shown next to the progress). */
export const ScanStage = z.enum(['download', 'frames', 'reconstruct', 'optimize', 'upload']);
export type ScanStage = z.infer<typeof ScanStage>;

export const ScanJob = z.object({
  id: z.string(),
  name: z.string(),
  purpose: ScanPurpose,
  source: ScanSource,
  fileCount: z.number().int().nonnegative(),
  status: ScanStatus,
  /** 0–100 while processing. */
  progress: z.number().min(0).max(100),
  stage: ScanStage.optional(),
  /** Technical reason of a failure (shown small, for support). */
  error: z.string().optional(),
  attempts: z.number().int().nonnegative(),
  /** URL of the worker's .glb (status ready), under /uploads/scans/. */
  resultFile: z.string().optional(),
  /** Library decor created from this scan (status done, purpose decor). */
  libraryId: z.string().optional(),
  /** Hall template created from this scan (status done, purpose hall). */
  hallId: z.string().optional(),
  createdBy: z.string(),
  createdById: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ScanJob = z.infer<typeof ScanJob>;

/** GET /api/scans: scanning only works when the server has a worker token configured. */
export const ScanList = z.object({ enabled: z.boolean(), jobs: z.array(ScanJob) });
export type ScanList = z.infer<typeof ScanList>;

/** POST /api/worker/claim response: the job to process and its input files. */
export const ScanClaim = z.object({
  id: z.string(),
  /** Sent back in the x-scan-lease header; a reclaimed job refuses the old worker's lease. */
  lease: z.string(),
  source: ScanSource,
  purpose: ScanPurpose,
  files: z.array(z.string()),
});
export type ScanClaim = z.infer<typeof ScanClaim>;

export const ScanProgressBody = z.object({
  progress: z.number().min(0).max(100),
  stage: ScanStage.optional(),
});
export type ScanProgressBody = z.infer<typeof ScanProgressBody>;

export const ScanFailBody = z.object({ error: z.string().trim().min(1).max(500) });
export type ScanFailBody = z.infer<typeof ScanFailBody>;

/** Name typed on the capture page; also the default name of the library decor. */
export const ScanName = z.string().trim().min(1).max(120);

/** POST /api/scans/:id/finish-hall: the hall the agent set up from a hall scan. */
export const ScanHallFinish = z.object({ hall: Hall });
export type ScanHallFinish = z.infer<typeof ScanHallFinish>;

/** Max upload of one scan: a 2-minute phone video at 8 Mbit/s is about 120 MB. */
export const MAX_SCAN_UPLOAD_BYTES = 500 * 1024 * 1024;
export const MIN_SCAN_PHOTOS = 20;
export const MAX_SCAN_PHOTOS = 200;
/** A processing job without a heartbeat for this long is given to the next worker claim. */
export const SCAN_STALE_MS = 20 * 60 * 1000;
/** Claims per job before it fails for good (the worker crashed or timed out each time). */
export const SCAN_MAX_ATTEMPTS = 2;

const TRANSITIONS: Record<ScanStatus, readonly ScanStatus[]> = {
  queued: ['processing'],
  // processing -> processing: a stale job claimed again by a new worker.
  processing: ['processing', 'ready', 'failed'],
  ready: ['done'],
  failed: ['queued'],
  done: [],
};

/** Whether a job may move from one status to another. Pure. */
export function canTransition(from: ScanStatus, to: ScanStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** A job the worker may take now: queued, or processing with an old heartbeat. Pure. */
export function isClaimable(
  job: { status: ScanStatus; heartbeatAt: number | null },
  now: number,
): boolean {
  if (job.status === 'queued') return true;
  return job.status === 'processing' && (job.heartbeatAt ?? 0) <= now - SCAN_STALE_MS;
}

/** Jobs an agent sees as still running (the list keeps polling while any exist). */
export const isScanActive = (s: ScanStatus): boolean => s === 'queued' || s === 'processing';
