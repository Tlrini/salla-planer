import { randomInt } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { nanoid } from 'nanoid';
import { AI_SCAN_MAX_MS, aiScanProgress, SCAN_MAX_ATTEMPTS } from '@salla/shared';
import type { DB } from './db.js';
import { SCANS_URL } from './routes/scans.js';
import { isGlb } from './routes/uploads.js';

/**
 * AI scans: one photo goes to an image-to-3D model on a pay-per-second GPU and a .glb comes
 * back. Only this server talks to the GPU service (outbound), so nothing has to reach the app
 * from outside, and a restart of the on/off server picks up the running jobs again.
 */
export type AiJobState =
  { state: 'running' } | { state: 'done'; glb: Buffer } | { state: 'failed'; error: string };

export interface AiScanProvider {
  /**
   * Starts the model on one photo; returns the provider's job id. Another seed gives another
   * result from the same photo.
   */
  start(photo: Buffer, seed: number): Promise<string>;
  check(id: string): Promise<AiJobState>;
}

/** RunPod Serverless; the GPU costs nothing while no job runs. See worker-ai/README.md. */
export function runpodProvider(
  apiKey: string,
  endpointId: string,
  fetchFn: typeof fetch = fetch,
): AiScanProvider {
  const base = `https://api.runpod.ai/v2/${endpointId}`;
  const headers = { authorization: apiKey, 'content-type': 'application/json' };
  return {
    async start(photo, seed) {
      const res = await fetchFn(`${base}/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ input: { image: photo.toString('base64'), seed } }),
      });
      if (!res.ok) throw new Error(`runpod_start_${res.status}`);
      const body = (await res.json()) as { id?: string };
      if (!body.id) throw new Error('runpod_no_id');
      return body.id;
    },
    async check(id) {
      const res = await fetchFn(`${base}/status/${id}`, { headers });
      if (!res.ok) throw new Error(`runpod_status_${res.status}`);
      const body = (await res.json()) as {
        status?: string;
        error?: string;
        output?: { glb?: string; error?: string };
      };
      if (body.status === 'COMPLETED') {
        if (body.output?.glb) return { state: 'done', glb: Buffer.from(body.output.glb, 'base64') };
        return { state: 'failed', error: body.output?.error ?? 'no_model_returned' };
      }
      if (body.status === 'FAILED' || body.status === 'CANCELLED' || body.status === 'TIMED_OUT') {
        return { state: 'failed', error: body.error ?? body.status.toLowerCase() };
      }
      return { state: 'running' };
    },
  };
}

/** A plain box: lets the whole flow be tried on a computer without any GPU. */
async function placeholderGlb(): Promise<Buffer> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const h = 0.5;
  const corners = [
    [-h, -h, -h],
    [h, -h, -h],
    [h, h, -h],
    [-h, h, -h],
    [-h, -h, h],
    [h, -h, h],
    [h, h, h],
    [-h, h, h],
  ].flat();
  const faces = [
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2,
    6, 1, 6, 5,
  ];
  const prim = doc
    .createPrimitive()
    .setAttribute(
      'POSITION',
      doc.createAccessor().setType('VEC3').setArray(new Float32Array(corners)).setBuffer(buffer),
    )
    .setIndices(
      doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(faces)).setBuffer(buffer),
    )
    .setMaterial(doc.createMaterial().setBaseColorFactor([0.79, 0.64, 0.3, 1]));
  doc
    .createScene()
    .addChild(doc.createNode('box').setMesh(doc.createMesh('box').addPrimitive(prim)));
  return Buffer.from(await new NodeIO().writeBinary(doc));
}

/** For development only (AI_SCAN_PROVIDER=mock): answers with a box after a few seconds. */
export function mockProvider(delayMs = 6000): AiScanProvider {
  const started = new Map<string, number>();
  return {
    async start() {
      const id = nanoid(8);
      started.set(id, Date.now());
      return id;
    },
    async check(id) {
      if (Date.now() - (started.get(id) ?? 0) < delayMs) return { state: 'running' };
      return { state: 'done', glb: await placeholderGlb() };
    },
  };
}

interface Row {
  id: string;
  status: 'queued' | 'processing';
  attempts: number;
  provider_job: string | null;
  provider_started_at: number | null;
}

/** How many photos may be with the GPU service at the same time. */
const MAX_RUNNING = 3;

const reason = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).slice(0, 200);

/** Moves AI scan jobs forward on a timer. Returns the function that stops it. */
export function startAiScans(
  db: DB,
  dataDir: string,
  provider: AiScanProvider,
  log: (err: unknown) => void,
  pollMs = 4000,
): () => void {
  let stopped = false;
  let busy = false;
  const stamp = () => new Date().toISOString();
  const inputDir = (id: string) => path.join(dataDir, 'scans', path.basename(id));
  const resultsDir = path.join(dataDir, 'uploads', 'scans');

  const fail = (id: string, error: string) =>
    db
      .prepare(
        `UPDATE scan_jobs SET status = 'failed', error = ?, stage = NULL, provider_job = NULL,
           provider_started_at = NULL, updated_at = ? WHERE id = ?`,
      )
      .run(error.slice(0, 500), stamp(), id);

  const launch = async (r: Row) => {
    if (r.attempts >= SCAN_MAX_ATTEMPTS) return void fail(r.id, 'timeout');
    let file: string | undefined;
    try {
      file = fs.readdirSync(inputDir(r.id)).sort()[0];
    } catch {
      file = undefined;
    }
    if (!file) return void fail(r.id, 'inputs_missing');
    let jobId: string;
    try {
      jobId = await provider.start(
        fs.readFileSync(path.join(inputDir(r.id), file)),
        randomInt(1, 2 ** 31),
      );
    } catch (err) {
      log(err);
      return void (stopped || fail(r.id, reason(err)));
    }
    if (stopped) return;
    const now = Date.now();
    db.prepare(
      `UPDATE scan_jobs SET status = 'processing', attempts = attempts + 1, provider_job = ?,
         provider_started_at = ?, heartbeat_at = ?, progress = 10, stage = 'reconstruct',
         error = NULL, updated_at = ? WHERE id = ? AND status = 'queued'`,
    ).run(jobId, now, now, stamp(), r.id);
  };

  const follow = async (r: Row) => {
    const now = Date.now();
    const startedAt = r.provider_started_at ?? now;
    let result: AiJobState;
    try {
      result = await provider.check(r.provider_job!);
    } catch (err) {
      // A network hiccup is not a failure; the time limit below ends a real outage.
      log(err);
      result = { state: 'running' };
    }
    if (stopped) return;
    if (result.state === 'failed') return void fail(r.id, result.error);
    if (result.state === 'running') {
      if (now - startedAt > AI_SCAN_MAX_MS) return void fail(r.id, 'timeout');
      db.prepare(
        `UPDATE scan_jobs SET progress = ?, heartbeat_at = ?, updated_at = ? WHERE id = ?`,
      ).run(aiScanProgress(now - startedAt), now, stamp(), r.id);
      return;
    }
    if (!isGlb(result.glb)) return void fail(r.id, 'not_glb');
    fs.mkdirSync(resultsDir, { recursive: true });
    const fileName = `${r.id}-${nanoid(8)}.glb`;
    fs.writeFileSync(path.join(resultsDir, fileName), result.glb);
    const saved = db
      .prepare(
        `UPDATE scan_jobs SET status = 'ready', progress = 100, stage = NULL, provider_job = NULL,
           provider_started_at = NULL, result_file = ?, updated_at = ?
         WHERE id = ? AND status = 'processing' AND provider_job = ?`,
      )
      .run(`${SCANS_URL}${fileName}`, stamp(), r.id, r.provider_job);
    // The agent may have deleted the job while the model was being made.
    // The photo stays until the agent keeps the model, to allow another attempt.
    if (saved.changes === 0) fs.rmSync(path.join(resultsDir, fileName), { force: true });
  };

  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      const rows = db
        .prepare(
          `SELECT id, status, attempts, provider_job, provider_started_at FROM scan_jobs
           WHERE method = 'ai' AND status IN ('queued', 'processing') ORDER BY created_at`,
        )
        .all() as Row[];
      let running = rows.filter((r) => r.status === 'processing').length;
      for (const r of rows) {
        if (stopped) return;
        if (r.status === 'processing') {
          await follow(r);
        } else if (running < MAX_RUNNING) {
          running++;
          await launch(r);
        }
      }
    } catch (err) {
      if (!stopped) log(err);
    } finally {
      busy = false;
    }
  };

  const timer = setInterval(() => void tick(), pollMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
