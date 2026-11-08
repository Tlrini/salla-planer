import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { LeaseLost, WorkerApi, type Claim, type Stage } from './api.js';
import { buildGlb, extractFrames, reconstruct } from './pipeline.js';
import {
  expectedMinutes,
  failureText,
  frameWidthFor,
  framesFor,
  reconstructProgress,
  triangleBudget,
} from './plan.js';

/**
 * Salla Planner scan worker (Beta 5). Runs on the GPU VM: claims scan jobs from the app, turns
 * the video/photos into a textured .glb (ffmpeg -> Meshroom -> assimp -> gltf-transform), sends
 * it back, and exits after IDLE_EXIT_MINUTES without work so the VM can power itself off
 * (worker/run-once.sh).
 */

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is not set (see worker/.env.example)`);
  return v;
}

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

const words = (s: string): string[] => s.split(/\s+/).filter(Boolean);

const config = {
  appUrl: required('APP_URL'),
  token: required('SCAN_WORKER_TOKEN'),
  workDir: process.env.WORK_DIR ?? '/work',
  meshroom: process.env.MESHROOM_BATCH ?? '/opt/meshroom/meshroom_batch',
  pipeline: process.env.MESHROOM_PIPELINE ?? 'photogrammetry',
  params: words(process.env.MESHROOM_PARAMS ?? ''),
  // Coarser depth maps are by far the biggest time saver.
  paramsQuick: words(
    process.env.MESHROOM_PARAMS_QUICK ??
      'DepthMap:downscale=4 Meshing:maxPoints=1000000 Texturing:textureSide=2048',
  ),
  idleMs: num('IDLE_EXIT_MINUTES', 10) * 60_000,
  pollMs: num('POLL_SECONDS', 15) * 1000,
  maxJobMs: num('MAX_JOB_MINUTES', 90) * 60_000,
  maxTriangles: num('TARGET_TRIANGLES', 150_000),
};

const HEARTBEAT_MS = 60_000;

const log = (...parts: unknown[]) => console.log(new Date().toISOString(), ...parts);

async function processJob(api: WorkerApi, job: Claim): Promise<void> {
  const quality = job.quality ?? 'detailed';
  const purpose = job.purpose ?? 'decor';
  const expectedMs = expectedMinutes(quality, purpose) * 60_000;
  const dir = path.join(config.workDir, job.id);
  fs.rmSync(dir, { recursive: true, force: true });
  const inputDir = path.join(dir, 'input');
  fs.mkdirSync(inputDir, { recursive: true });

  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(new Error('timeout')), config.maxJobMs);
  const started = Date.now();
  let stage: Stage = 'download';
  let progress = 0;
  let reconstructStart = 0;
  const report = async (p: number, s: Stage) => {
    progress = p;
    stage = s;
    await api.progress(job, p, s);
  };
  // Every minute: keep the claim alive (the server re-queues silent jobs) and notice when the
  // agent deleted the job meanwhile.
  const heartbeat = setInterval(() => {
    const p =
      stage === 'reconstruct'
        ? reconstructProgress(Date.now() - reconstructStart, expectedMs)
        : progress;
    api
      .progress(job, p, stage)
      .then(() => {
        progress = p;
      })
      .catch((err: unknown) => {
        if (err instanceof LeaseLost) abort.abort(err);
        else log(`job ${job.id}: heartbeat failed`, failureText(err));
      });
  }, HEARTBEAT_MS);

  try {
    await report(0, 'download');
    for (const name of job.files) {
      abort.signal.throwIfAborted();
      await api.download(job, name, path.join(inputDir, path.basename(name)));
    }

    let imagesDir = inputDir;
    if (job.source === 'video') {
      await report(5, 'frames');
      imagesDir = path.join(dir, 'frames');
      const frames = await extractFrames(
        path.join(inputDir, job.files[0]!),
        imagesDir,
        framesFor(quality, purpose),
        frameWidthFor(quality),
      );
      log(`job ${job.id}: ${frames} frames`);
    }

    await report(10, 'reconstruct');
    reconstructStart = Date.now();
    const outDir = path.join(dir, 'output');
    await reconstruct(imagesDir, outDir, {
      bin: config.meshroom,
      pipeline: config.pipeline,
      params: quality === 'quick' ? config.paramsQuick : config.params,
      signal: abort.signal,
      onLine: (line) => {
        if (/error|exception/i.test(line)) log(`job ${job.id}: ${line.slice(0, 300)}`);
      },
    });
    abort.signal.throwIfAborted();

    await report(90, 'optimize');
    const glb = path.join(dir, 'scan.glb');
    const { triangles } = await buildGlb(outDir, glb, triangleBudget(quality, config.maxTriangles));

    await report(96, 'upload');
    await api.result(job, glb);
    const minutes = Math.round((Date.now() - started) / 60_000);
    log(`job ${job.id}: done, ${triangles} triangles in ${minutes} min`);
  } catch (err) {
    const reason: unknown = abort.signal.aborted ? abort.signal.reason : err;
    if (reason instanceof LeaseLost || err instanceof LeaseLost) {
      log(`job ${job.id}: deleted or taken over, dropped`);
    } else {
      const text = failureText(reason);
      log(`job ${job.id}: failed: ${text}`);
      await api
        .fail(job, text)
        .catch((e: unknown) => log('could not report failure', failureText(e)));
    }
  } finally {
    clearInterval(heartbeat);
    clearTimeout(timeout);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const api = new WorkerApi(config.appUrl, config.token);
  fs.mkdirSync(config.workDir, { recursive: true });
  log(`scan worker started for ${config.appUrl}`);
  let idleSince = Date.now();
  for (;;) {
    let job: Claim | null = null;
    try {
      job = await api.claim();
    } catch (err) {
      log('claim failed', failureText(err));
    }
    if (job) {
      log(`job ${job.id}: claimed (${job.source}, ${job.files.length} file(s))`);
      await processJob(api, job);
      idleSince = Date.now();
      continue;
    }
    if (Date.now() - idleSince >= config.idleMs) {
      log('no scans for a while, exiting');
      return;
    }
    await sleep(config.pollMs);
  }
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    log('fatal', failureText(err));
    process.exit(1);
  },
);
