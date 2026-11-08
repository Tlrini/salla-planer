import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { nanoid } from 'nanoid';
import {
  canTransition,
  isClaimable,
  MAX_LIBRARY_MODEL_BYTES,
  MAX_SCAN_PHOTOS,
  MAX_SCAN_UPLOAD_BYTES,
  MIN_SCAN_PHOTOS,
  SCAN_MAX_ATTEMPTS,
  ScanFailBody,
  ScanHallFinish,
  ScanName,
  ScanProgressBody,
  ScanPurpose,
  type ScanClaim,
  type ScanJob,
  type ScanList,
  type ScanSource,
  type ScanStage,
  type ScanStatus,
} from '@salla/shared';
import { lastActivity } from '../activity.js';
import { MIN_WORKER_TOKEN_LENGTH } from '../config.js';
import { WORKER_PREFIX } from '../constants.js';
import type { DB } from '../db.js';
import { imageType } from './images.js';
import { createHallTemplate } from './halls.js';
import { createLibraryItem } from './library.js';
import { isGlb, removeUploadFile } from './uploads.js';

export const SCANS_URL = '/uploads/scans/';
const LEASE_HEADER = 'x-scan-lease';

interface ScanRow {
  id: string;
  name: string;
  purpose: ScanPurpose;
  hall_id: string | null;
  source: ScanSource;
  file_count: number;
  status: ScanStatus;
  progress: number;
  stage: ScanStage | null;
  error: string | null;
  attempts: number;
  lease: string | null;
  heartbeat_at: number | null;
  result_file: string | null;
  library_id: string | null;
  created_by: string;
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

const toJob = (r: ScanRow): ScanJob => ({
  id: r.id,
  name: r.name,
  purpose: r.purpose,
  source: r.source,
  fileCount: r.file_count,
  status: r.status,
  progress: r.progress,
  ...(r.stage ? { stage: r.stage } : {}),
  ...(r.error ? { error: r.error } : {}),
  attempts: r.attempts,
  ...(r.result_file ? { resultFile: r.result_file } : {}),
  ...(r.library_id ? { libraryId: r.library_id } : {}),
  ...(r.hall_id ? { hallId: r.hall_id } : {}),
  createdBy: r.created_by,
  createdById: r.created_by_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Video container by content (never by name): mp4/mov ("ftyp" box) or webm/mkv (EBML). */
export function videoType(buf: Buffer): 'mp4' | 'webm' | null {
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') return 'mp4';
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0x1a45dfa3) return 'webm';
  return null;
}

/** First bytes of a file, to check its type after it was streamed to disk. */
function readHead(file: string, length = 16): Buffer {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(length);
    const read = fs.readSync(fd, buf, 0, length, 0);
    return buf.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

/** Constant-time comparison; hashing first gives both sides the same length. */
function tokenMatches(given: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

const uploadErrorCode = (err: unknown): string | undefined =>
  typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;

const TOO_LARGE_CODES = new Set(['FST_REQ_FILE_TOO_LARGE', 'FST_FILES_LIMIT', 'FST_PARTS_LIMIT']);

/**
 * In-page scanning (Beta 5). Agents upload a video or photos of a decoration; the GPU worker
 * (a separate VM that a host script starts while jobs wait, see deploy/scan-starter.sh) claims
 * jobs with its bearer token, sends the .glb back, and the agent crops it into a library decor.
 * Without a SCAN_WORKER_TOKEN the list reports `enabled: false` and uploads are refused.
 */
export function registerScanRoutes(
  app: FastifyInstance,
  db: DB,
  dataDir: string,
  workerToken: string | undefined,
): void {
  const enabled = !!workerToken && workerToken.length >= MIN_WORKER_TOKEN_LENGTH;
  const inputDir = (id: string) => path.join(dataDir, 'scans', path.basename(id));
  const resultsDir = path.join(dataDir, 'uploads', 'scans');
  const getRow = (id: string) =>
    db.prepare('SELECT * FROM scan_jobs WHERE id = ?').get(id) as ScanRow | undefined;
  const stamp = () => new Date().toISOString();
  const inputFiles = (id: string): string[] => {
    try {
      return fs.readdirSync(inputDir(id)).sort();
    } catch {
      return [];
    }
  };
  const removeInputs = (id: string) => fs.rmSync(inputDir(id), { recursive: true, force: true });

  // ---- agent side (session required) -----------------------------------------------------------

  app.get('/api/scans', async (): Promise<ScanList> => {
    const rows = db
      .prepare('SELECT * FROM scan_jobs ORDER BY created_at DESC LIMIT 100')
      .all() as ScanRow[];
    return { enabled, jobs: rows.map(toJob) };
  });

  app.get<{ Params: { id: string } }>('/api/scans/:id', async (req, reply) => {
    const row = getRow(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return toJob(row);
  });

  app.post('/api/scans', async (req, reply) => {
    if (!enabled) return reply.code(503).send({ error: 'scanning_disabled' });
    const id = nanoid(12);
    const dir = inputDir(id);
    fs.mkdirSync(dir, { recursive: true });
    const fail = (code: number, error: string) => {
      removeInputs(id);
      return reply.code(code).send({ error });
    };

    let name = '';
    let purposeField = 'decor';
    let video: string | null = null;
    let photos = 0;
    let total = 0;
    let index = 0;
    try {
      const parts = req.parts({
        limits: {
          fileSize: MAX_SCAN_UPLOAD_BYTES,
          files: MAX_SCAN_PHOTOS,
          fields: 4,
          fieldSize: 1000,
        },
      });
      for await (const part of parts) {
        if (part.type === 'field') {
          if (part.fieldname === 'name') name = String(part.value);
          if (part.fieldname === 'purpose') purposeField = String(part.value);
          continue;
        }
        // Stream to disk (a video can be hundreds of MB), then check what it really is.
        const tmp = path.join(dir, `upload-${index++}`);
        await pipeline(part.file, fs.createWriteStream(tmp));
        if (part.file.truncated) return fail(413, 'too_large');
        total += fs.statSync(tmp).size;
        if (total > MAX_SCAN_UPLOAD_BYTES) return fail(413, 'too_large');
        const head = readHead(tmp);
        const vType = videoType(head);
        const iType = imageType(head);
        if (vType) {
          if (video || photos) return fail(400, 'mixed_files');
          video = `video.${vType}`;
          fs.renameSync(tmp, path.join(dir, video));
        } else if (iType === 'jpg' || iType === 'png') {
          if (video) return fail(400, 'mixed_files');
          photos++;
          fs.renameSync(tmp, path.join(dir, `${String(photos).padStart(4, '0')}.${iType}`));
        } else {
          return fail(400, 'unsupported_file');
        }
      }
    } catch (err) {
      const code = uploadErrorCode(err);
      return code && TOO_LARGE_CODES.has(code)
        ? fail(413, 'too_large')
        : fail(400, 'invalid_upload');
    }

    const parsedName = ScanName.safeParse(name);
    if (!parsedName.success) return fail(400, 'invalid_name');
    const purpose = ScanPurpose.safeParse(purposeField);
    if (!purpose.success) return fail(400, 'invalid_purpose');
    if (!video && photos === 0) return fail(400, 'no_file');
    if (!video && photos < MIN_SCAN_PHOTOS) return fail(400, 'too_few_photos');

    const user = req.user!;
    const now = stamp();
    db.prepare(
      `INSERT INTO scan_jobs (id, name, purpose, source, file_count, status, created_by, created_by_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)`,
    ).run(
      id,
      parsedName.data,
      purpose.data,
      video ? 'video' : 'photos',
      video ? 1 : photos,
      user.displayName,
      user.id,
      now,
      now,
    );
    return reply.code(201).send(toJob(getRow(id)!));
  });

  app.post<{ Params: { id: string } }>('/api/scans/:id/retry', async (req, reply) => {
    const row = getRow(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not_found' });
    if (!canTransition(row.status, 'queued'))
      return reply.code(409).send({ error: 'invalid_status' });
    if (inputFiles(row.id).length === 0) return reply.code(409).send({ error: 'inputs_missing' });
    db.prepare(
      `UPDATE scan_jobs SET status = 'queued', attempts = 0, progress = 0, stage = NULL, error = NULL,
         lease = NULL, heartbeat_at = NULL, updated_at = ? WHERE id = ?`,
    ).run(stamp(), row.id);
    return toJob(getRow(row.id)!);
  });

  // The agent's (cropped) model becomes a draft library decor; the setup dialog finishes it.
  app.post<{ Params: { id: string } }>('/api/scans/:id/finish', async (req, reply) => {
    const row = getRow(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not_found' });
    if (!canTransition(row.status, 'done'))
      return reply.code(409).send({ error: 'invalid_status' });
    if (row.purpose !== 'decor') return reply.code(409).send({ error: 'wrong_purpose' });
    const file = await req.file({ limits: { fileSize: MAX_LIBRARY_MODEL_BYTES, files: 1 } });
    if (!file) return reply.code(400).send({ error: 'no_file' });
    let buf: Buffer;
    try {
      buf = await file.toBuffer();
    } catch {
      return reply.code(413).send({ error: 'too_large' });
    }
    if (file.file.truncated) return reply.code(413).send({ error: 'too_large' });
    if (!isGlb(buf)) return reply.code(400).send({ error: 'not_glb' });

    // Re-checked atomically: while the upload streamed in, another agent (or a second tap)
    // may have finished the same scan. Only one of them creates the library decor.
    const user = req.user!;
    const item = db.transaction(() => {
      const won = db
        .prepare(
          `UPDATE scan_jobs SET status = 'done', result_file = NULL, updated_at = ? WHERE id = ? AND status = 'ready'`,
        )
        .run(stamp(), row.id);
      if (won.changes === 0) return null;
      const created = createLibraryItem(db, dataDir, buf, row.name, user);
      db.prepare('UPDATE scan_jobs SET library_id = ? WHERE id = ?').run(created.id, row.id);
      return created;
    })();
    if (!item) return reply.code(409).send({ error: 'invalid_status' });
    removeUploadFile(dataDir, row.result_file ?? undefined);
    removeInputs(row.id);
    return reply.code(201).send(item);
  });

  // A hall scan becomes a hall template: the browser measured it (real ceiling height, walls
  // aligned) and uploaded its top view as the plan photo (Hall.underlay); columns, doors and
  // windows are then placed over that photo in the normal hall editor.
  app.post<{ Params: { id: string } }>('/api/scans/:id/finish-hall', async (req, reply) => {
    const row = getRow(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not_found' });
    if (!canTransition(row.status, 'done'))
      return reply.code(409).send({ error: 'invalid_status' });
    if (row.purpose !== 'hall') return reply.code(409).send({ error: 'wrong_purpose' });
    const body = ScanHallFinish.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'invalid_body', issues: body.error.issues });
    const template = createHallTemplate(db, body.data.hall, req.user!.displayName);
    db.prepare(
      `UPDATE scan_jobs SET status = 'done', hall_id = ?, result_file = NULL, updated_at = ? WHERE id = ?`,
    ).run(template.id, stamp(), row.id);
    removeUploadFile(dataDir, row.result_file ?? undefined);
    removeInputs(row.id);
    return reply.code(201).send(template);
  });

  app.delete<{ Params: { id: string } }>('/api/scans/:id', async (req, reply) => {
    const row = getRow(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not_found' });
    const user = req.user!;
    if (user.role !== 'admin' && row.created_by_id !== user.id)
      return reply.code(403).send({ error: 'forbidden' });
    // A worker still processing it gets 409 on its next call and moves on.
    db.prepare('DELETE FROM scan_jobs WHERE id = ?').run(row.id);
    removeUploadFile(dataDir, row.result_file ?? undefined);
    removeInputs(row.id);
    return { ok: true };
  });

  // ---- worker side (bearer token, no session) --------------------------------------------------

  const requireWorker = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!enabled) return reply.code(404).send({ error: 'not_found' });
    const header = req.headers.authorization ?? '';
    const given = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (!given || !tokenMatches(given, workerToken!))
      return reply.code(401).send({ error: 'unauthorized' });
  };
  /** The job, if it is processing under the lease the worker sent; otherwise null. */
  const leased = (req: { params: { id: string }; headers: FastifyRequest['headers'] }) => {
    const row = getRow(req.params.id);
    const lease = req.headers[LEASE_HEADER];
    return row && row.status === 'processing' && row.lease && lease === row.lease ? row : null;
  };
  const claimableRows = () =>
    db
      .prepare(
        `SELECT * FROM scan_jobs WHERE status IN ('queued', 'processing') ORDER BY created_at`,
      )
      .all() as ScanRow[];
  const opts = { preHandler: requireWorker };

  // Polled by deploy/scan-starter.sh on the app VM: start the GPU VM when this is above 0.
  app.get(`${WORKER_PREFIX}pending`, opts, async () => {
    const now = Date.now();
    const count = claimableRows().filter((r) =>
      isClaimable({ status: r.status, heartbeatAt: r.heartbeat_at }, now),
    ).length;
    return { count };
  });

  // Polled by deploy/idle-stop.sh on the app VM: power off only when nobody used the app for a
  // while and no scan waits or runs (the GPU worker needs the app to deliver its result).
  // `processing` counts only jobs whose worker reported recently, and `oldestQueuedAt` lets the
  // script give up waiting for a GPU that never comes, so a stuck scan cannot keep the server on.
  app.get(`${WORKER_PREFIX}status`, opts, async () => {
    const now = Date.now();
    const rows = claimableRows();
    const queued = rows.filter((r) => r.status === 'queued');
    const processing = rows.filter(
      (r) =>
        r.status === 'processing' &&
        !isClaimable({ status: r.status, heartbeatAt: r.heartbeat_at }, now),
    );
    return {
      lastActivityAt: new Date(lastActivity()).toISOString(),
      queued: queued.length,
      processing: processing.length,
      // Rows are ordered by created_at.
      oldestQueuedAt: queued[0]?.created_at ?? null,
    };
  });

  app.post(`${WORKER_PREFIX}claim`, opts, async (_req, reply) => {
    const claim = db.transaction((): ScanClaim | null => {
      const now = Date.now();
      for (const r of claimableRows()) {
        if (!isClaimable({ status: r.status, heartbeatAt: r.heartbeat_at }, now)) continue;
        const files = inputFiles(r.id);
        // Crashed or timed out too often, or its files are gone: give up on this one.
        const giveUp =
          r.attempts >= SCAN_MAX_ATTEMPTS
            ? 'timeout'
            : files.length === 0
              ? 'inputs_missing'
              : null;
        if (giveUp) {
          db.prepare(
            `UPDATE scan_jobs SET status = 'failed', error = ?, lease = NULL, updated_at = ? WHERE id = ?`,
          ).run(giveUp, stamp(), r.id);
          continue;
        }
        const lease = nanoid(24);
        db.prepare(
          `UPDATE scan_jobs SET status = 'processing', attempts = attempts + 1, lease = ?, heartbeat_at = ?,
             progress = 0, stage = 'download', error = NULL, updated_at = ? WHERE id = ?`,
        ).run(lease, now, stamp(), r.id);
        return { id: r.id, lease, source: r.source, purpose: r.purpose, files };
      }
      return null;
    })();
    if (!claim) return reply.code(204).send();
    return claim;
  });

  app.get<{ Params: { id: string; name: string } }>(
    `${WORKER_PREFIX}jobs/:id/files/:name`,
    opts,
    async (req, reply) => {
      const row = leased(req);
      if (!row) return reply.code(409).send({ error: 'lease_lost' });
      const name = path.basename(req.params.name);
      if (!inputFiles(row.id).includes(name)) return reply.code(404).send({ error: 'not_found' });
      reply.type('application/octet-stream');
      return reply.send(fs.createReadStream(path.join(inputDir(row.id), name)));
    },
  );

  app.post<{ Params: { id: string } }>(
    `${WORKER_PREFIX}jobs/:id/progress`,
    opts,
    async (req, reply) => {
      const row = leased(req);
      if (!row) return reply.code(409).send({ error: 'lease_lost' });
      const body = ScanProgressBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
      db.prepare(
        `UPDATE scan_jobs SET progress = ?, stage = ?, heartbeat_at = ?, updated_at = ? WHERE id = ?`,
      ).run(
        Math.round(body.data.progress),
        body.data.stage ?? row.stage,
        Date.now(),
        stamp(),
        row.id,
      );
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string } }>(
    `${WORKER_PREFIX}jobs/:id/result`,
    opts,
    async (req, reply) => {
      const row = leased(req);
      if (!row) return reply.code(409).send({ error: 'lease_lost' });
      const file = await req.file({ limits: { fileSize: MAX_LIBRARY_MODEL_BYTES, files: 1 } });
      if (!file) return reply.code(400).send({ error: 'no_file' });
      let buf: Buffer;
      try {
        buf = await file.toBuffer();
      } catch {
        return reply.code(413).send({ error: 'too_large' });
      }
      if (file.file.truncated) return reply.code(413).send({ error: 'too_large' });
      if (!isGlb(buf)) return reply.code(400).send({ error: 'not_glb' });

      fs.mkdirSync(resultsDir, { recursive: true });
      const fileName = `${row.id}-${nanoid(8)}.glb`;
      fs.writeFileSync(path.join(resultsDir, fileName), buf);
      // The upload took a while: the agent may have deleted the job, or a new worker taken it
      // over. Only the lease that was checked may still deliver.
      const saved = db
        .prepare(
          `UPDATE scan_jobs SET status = 'ready', progress = 100, stage = NULL, lease = NULL,
             result_file = ?, updated_at = ? WHERE id = ? AND status = 'processing' AND lease = ?`,
        )
        .run(`${SCANS_URL}${fileName}`, stamp(), row.id, row.lease);
      if (saved.changes === 0) {
        fs.rmSync(path.join(resultsDir, fileName), { force: true });
        return reply.code(409).send({ error: 'lease_lost' });
      }
      // The model is what matters from here on; the video/photos only took disk space.
      removeInputs(row.id);
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string } }>(
    `${WORKER_PREFIX}jobs/:id/fail`,
    opts,
    async (req, reply) => {
      const row = leased(req);
      if (!row) return reply.code(409).send({ error: 'lease_lost' });
      const body = ScanFailBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
      // Inputs stay, so the agent can try again ("Provo përsëri").
      db.prepare(
        `UPDATE scan_jobs SET status = 'failed', error = ?, stage = NULL, lease = NULL, updated_at = ? WHERE id = ?`,
      ).run(body.data.error, stamp(), row.id);
      return { ok: true };
    },
  );
}
