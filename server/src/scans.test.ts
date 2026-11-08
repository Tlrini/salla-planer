import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  canTransition,
  isClaimable,
  SCAN_STALE_MS,
  type CatalogItem,
  type ScanClaim,
  type ScanJob,
  type ScanList,
} from '@salla/shared';
import { buildApp, type BuiltApp } from './app.js';
import type { AppConfig } from './config.js';
import { videoType } from './routes/scans.js';

const WORKER_TOKEN = 'w'.repeat(40);
const mp4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from('ftypisom'),
  Buffer.alloc(64),
]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const glb = (() => {
  const b = Buffer.alloc(32);
  b.write('glTF', 0, 'ascii');
  return b;
})();

type Part =
  | { name: string; value: string }
  | { name: string; filename: string; content: Buffer; type?: string };

const BOUNDARY = '----salla-scan';
function multipart(parts: Part[]): Buffer {
  const chunks = parts.map((p) =>
    'filename' in p
      ? Buffer.concat([
          Buffer.from(
            `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\nContent-Type: ${p.type ?? 'application/octet-stream'}\r\n\r\n`,
          ),
          p.content,
          Buffer.from('\r\n'),
        ])
      : Buffer.from(
          `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${p.name}"\r\n\r\n${p.value}\r\n`,
        ),
  );
  return Buffer.concat([...chunks, Buffer.from(`--${BOUNDARY}--\r\n`)]);
}

const config = (dataDir: string, scanWorkerToken?: string): AppConfig => ({
  dbPath: ':memory:',
  dataDir,
  webDist: null,
  secureCookies: false,
  production: false,
  logger: false,
  adminUser: 'admin',
  adminPassword: 'test-admin-pass',
  ...(scanWorkerToken ? { scanWorkerToken } : {}),
});

let built: BuiltApp;
let dataDir: string;
let admin: string;
let agent: string;

async function login(app: BuiltApp, username: string, password: string): Promise<string> {
  const res = await app.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  });
  expect(res.statusCode).toBe(200);
  return `salla_sid=${res.cookies.find((c) => c.name === 'salla_sid')!.value}`;
}

const req = (method: 'GET' | 'POST' | 'DELETE', url: string, cookie: string, payload?: object) =>
  built.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });

const upload = (url: string, cookie: string, parts: Part[]) =>
  built.app.inject({
    method: 'POST',
    url,
    headers: { cookie, 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
    payload: multipart(parts),
  });

const worker = (
  method: 'GET' | 'POST',
  url: string,
  opts: { lease?: string; json?: object; parts?: Part[]; token?: string } = {},
) =>
  built.app.inject({
    method,
    url: `/api/worker/${url}`,
    headers: {
      authorization: `Bearer ${opts.token ?? WORKER_TOKEN}`,
      ...(opts.lease ? { 'x-scan-lease': opts.lease } : {}),
      ...(opts.parts ? { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` } : {}),
    },
    ...(opts.json ? { payload: opts.json } : {}),
    ...(opts.parts ? { payload: multipart(opts.parts) } : {}),
  });

const videoScan = (name = 'Trendafila') => [
  { name: 'name', value: name },
  { name: 'file', filename: 'skanim.mp4', content: mp4, type: 'video/mp4' },
];

const job = async (id: string) => (await req('GET', `/api/scans/${id}`, admin)).json() as ScanJob;

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'salla-scan-test-'));
  built = await buildApp(config(dataDir, WORKER_TOKEN));
  admin = await login(built, 'admin', 'test-admin-pass');
  const r = await req('POST', '/api/users', admin, {
    username: 'drita',
    displayName: 'Drita',
    password: 'secret-123',
    role: 'agent',
  });
  expect(r.statusCode).toBe(201);
  agent = await login(built, 'drita', 'secret-123');
});

afterAll(async () => {
  await built.app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('scan job rules (shared)', () => {
  it('only allows the documented status changes', () => {
    expect(canTransition('queued', 'processing')).toBe(true);
    expect(canTransition('processing', 'ready')).toBe(true);
    expect(canTransition('ready', 'done')).toBe(true);
    expect(canTransition('failed', 'queued')).toBe(true);
    expect(canTransition('queued', 'done')).toBe(false);
    expect(canTransition('done', 'queued')).toBe(false);
    expect(canTransition('ready', 'queued')).toBe(false);
  });

  it('gives a processing job to a new worker only after its heartbeat went silent', () => {
    const now = 10 * SCAN_STALE_MS;
    expect(isClaimable({ status: 'queued', heartbeatAt: null }, now)).toBe(true);
    expect(isClaimable({ status: 'processing', heartbeatAt: now - 1000 }, now)).toBe(false);
    expect(isClaimable({ status: 'processing', heartbeatAt: now - SCAN_STALE_MS }, now)).toBe(true);
    expect(isClaimable({ status: 'ready', heartbeatAt: null }, now)).toBe(false);
  });

  it('detects video containers by content', () => {
    expect(videoType(mp4)).toBe('mp4');
    expect(videoType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0]))).toBe('webm');
    expect(videoType(jpg)).toBeNull();
  });
});

describe('scanning off', () => {
  it('reports disabled and refuses uploads and worker calls without a token', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'salla-scan-off-'));
    const off = await buildApp(config(dir));
    try {
      const cookie = await login(off, 'admin', 'test-admin-pass');
      const list = await off.app.inject({ url: '/api/scans', headers: { cookie } });
      expect((list.json() as ScanList).enabled).toBe(false);
      const post = await off.app.inject({
        method: 'POST',
        url: '/api/scans',
        headers: { cookie, 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
        payload: multipart(videoScan()),
      });
      expect(post.statusCode).toBe(503);
      const pending = await off.app.inject({
        url: '/api/worker/pending',
        headers: { authorization: `Bearer ${WORKER_TOKEN}` },
      });
      expect(pending.statusCode).toBe(404);
    } finally {
      await off.app.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('scanning (Beta 5)', () => {
  it('worker routes need the worker token, not a session', async () => {
    expect((await req('GET', '/api/scans', agent)).json()).toMatchObject({ enabled: true });
    expect((await worker('GET', 'pending', { token: 'x'.repeat(40) })).statusCode).toBe(401);
    const withCookieOnly = await built.app.inject({
      url: '/api/worker/pending',
      headers: { cookie: admin },
    });
    expect(withCookieOnly.statusCode).toBe(401);
    expect((await worker('GET', 'pending')).json()).toEqual({ count: 0 });
    // Agent routes still need a session.
    expect((await built.app.inject({ url: '/api/scans' })).statusCode).toBe(401);
  });

  it('refuses unknown files, mixed uploads, too few photos and a missing name', async () => {
    const text = [
      { name: 'name', value: 'X' },
      { name: 'file', filename: 'a.txt', content: Buffer.from('hello world, not media') },
    ];
    expect((await upload('/api/scans', agent, text)).json()).toEqual({ error: 'unsupported_file' });
    const mixed = [...videoScan(), { name: 'file', filename: 'a.jpg', content: jpg }];
    expect((await upload('/api/scans', agent, mixed)).json()).toEqual({ error: 'mixed_files' });
    const few = [
      { name: 'name', value: 'Pak foto' },
      ...[1, 2, 3].map((i) => ({ name: 'file', filename: `${i}.jpg`, content: jpg })),
    ];
    expect((await upload('/api/scans', agent, few)).json()).toEqual({ error: 'too_few_photos' });
    const unnamed = [{ name: 'file', filename: 'v.mp4', content: mp4 }];
    expect((await upload('/api/scans', agent, unnamed)).json()).toEqual({ error: 'invalid_name' });
    // Nothing was queued and no input folder was left behind.
    expect((await worker('GET', 'pending')).json()).toEqual({ count: 0 });
    const inputs = path.join(dataDir, 'scans');
    expect(fs.existsSync(inputs) ? fs.readdirSync(inputs) : []).toEqual([]);
  });

  it('a video goes through claim, progress and result, and is finished into the library', async () => {
    const created = await upload('/api/scans', agent, videoScan());
    expect(created.statusCode).toBe(201);
    const queued = created.json() as ScanJob;
    expect(queued).toMatchObject({
      name: 'Trendafila',
      source: 'video',
      fileCount: 1,
      status: 'queued',
      createdBy: 'Drita',
    });
    expect((await worker('GET', 'pending')).json()).toEqual({ count: 1 });

    const claimed = await worker('POST', 'claim');
    expect(claimed.statusCode).toBe(200);
    const claim = claimed.json() as ScanClaim;
    expect(claim).toMatchObject({ id: queued.id, source: 'video', files: ['video.mp4'] });
    expect((await worker('POST', 'claim')).statusCode).toBe(204);
    expect((await worker('GET', 'pending')).json()).toEqual({ count: 0 });

    const file = `jobs/${claim.id}/files/video.mp4`;
    expect((await worker('GET', file, { lease: 'wrong' })).statusCode).toBe(409);
    const download = await worker('GET', file, { lease: claim.lease });
    expect(download.statusCode).toBe(200);
    expect(download.rawPayload.equals(mp4)).toBe(true);
    const traversal = await worker('GET', `jobs/${claim.id}/files/..%2Fapp.db`, {
      lease: claim.lease,
    });
    expect(traversal.statusCode).toBe(404);

    const progress = await worker('POST', `jobs/${claim.id}/progress`, {
      lease: claim.lease,
      json: { progress: 40.4, stage: 'reconstruct' },
    });
    expect(progress.statusCode).toBe(200);
    expect(await job(claim.id)).toMatchObject({
      status: 'processing',
      progress: 40,
      stage: 'reconstruct',
      attempts: 1,
    });

    const notGlb = await worker('POST', `jobs/${claim.id}/result`, {
      lease: claim.lease,
      parts: [{ name: 'file', filename: 'scan.glb', content: Buffer.from('not a model at all') }],
    });
    expect(notGlb.statusCode).toBe(400);
    const result = await worker('POST', `jobs/${claim.id}/result`, {
      lease: claim.lease,
      parts: [{ name: 'file', filename: 'scan.glb', content: glb }],
    });
    expect(result.statusCode).toBe(200);
    const ready = await job(claim.id);
    expect(ready.status).toBe('ready');
    expect(ready.resultFile).toMatch(/^\/uploads\/scans\/[\w-]+\.glb$/);
    // The video is no longer needed once the model exists; the old lease is void.
    expect(fs.existsSync(path.join(dataDir, 'scans', claim.id))).toBe(false);
    expect(
      (
        await worker('POST', `jobs/${claim.id}/progress`, {
          lease: claim.lease,
          json: { progress: 99 },
        })
      ).statusCode,
    ).toBe(409);
    // The result is private agency data like other uploads.
    expect((await built.app.inject({ url: ready.resultFile! })).statusCode).toBe(401);
    expect((await req('GET', ready.resultFile!, agent)).statusCode).toBe(200);

    const finished = await upload(`/api/scans/${claim.id}/finish`, agent, [
      { name: 'file', filename: 'skanim.glb', content: glb },
    ]);
    expect(finished.statusCode).toBe(201);
    const item = finished.json() as CatalogItem;
    expect(item).toMatchObject({
      name: 'Trendafila',
      source: 'library',
      draft: true,
      createdBy: 'Drita',
    });
    expect(await job(claim.id)).toMatchObject({ status: 'done', libraryId: item.id });
    expect(ready.resultFile && fs.existsSync(path.join(dataDir, ready.resultFile))).toBe(false);
    const catalog = (await req('GET', '/api/catalog', agent)).json() as CatalogItem[];
    expect(catalog.some((c) => c.id === item.id)).toBe(true);
    // Finished once only.
    const again = await upload(`/api/scans/${claim.id}/finish`, agent, [
      { name: 'file', filename: 'skanim.glb', content: glb },
    ]);
    expect(again.statusCode).toBe(409);
  });

  it('retries failed scans, re-queues silent workers, gives up after two tries', async () => {
    const photos = [
      { name: 'name', value: 'Qirinj' },
      ...Array.from({ length: 20 }, (_, i) => ({
        name: 'file',
        filename: `${i}.jpg`,
        content: jpg,
      })),
    ];
    const created = (await upload('/api/scans', agent, photos)).json() as ScanJob;
    expect(created).toMatchObject({ source: 'photos', fileCount: 20, status: 'queued' });

    const first = (await worker('POST', 'claim')).json() as ScanClaim;
    expect(first.files).toHaveLength(20);
    expect(first.files[0]).toBe('0001.jpg');
    const failed = await worker('POST', `jobs/${first.id}/fail`, {
      lease: first.lease,
      json: { error: 'meshroom exited with 1' },
    });
    expect(failed.statusCode).toBe(200);
    expect(await job(first.id)).toMatchObject({
      status: 'failed',
      error: 'meshroom exited with 1',
    });
    expect((await req('POST', `/api/scans/${first.id}/finish`, agent, {})).statusCode).toBe(409);

    const retried = await req('POST', `/api/scans/${first.id}/retry`, agent, {});
    expect(retried.json()).toMatchObject({ status: 'queued', attempts: 0 });

    // A worker claims it and then goes silent (VM stopped, crash).
    const silent = (await worker('POST', 'claim')).json() as ScanClaim;
    const goSilent = () =>
      built.db
        .prepare('UPDATE scan_jobs SET heartbeat_at = ? WHERE id = ?')
        .run(Date.now() - SCAN_STALE_MS - 1000, first.id);
    goSilent();
    expect((await worker('GET', 'pending')).json()).toEqual({ count: 1 });
    const second = (await worker('POST', 'claim')).json() as ScanClaim;
    expect(second.lease).not.toBe(silent.lease);
    expect(await job(first.id)).toMatchObject({ status: 'processing', attempts: 2 });
    // The first worker's lease no longer works.
    const stale = await worker('POST', `jobs/${first.id}/progress`, {
      lease: silent.lease,
      json: { progress: 50 },
    });
    expect(stale.statusCode).toBe(409);

    // Silent again after the second try: it fails for good instead of a third claim.
    goSilent();
    expect((await worker('POST', 'claim')).statusCode).toBe(204);
    expect(await job(first.id)).toMatchObject({ status: 'failed', error: 'timeout' });
  });

  it('only the creator or an admin deletes a scan', async () => {
    const created = (await upload('/api/scans', agent, videoScan('Hark'))).json() as ScanJob;
    const otherCookie = await (async () => {
      await req('POST', '/api/users', admin, {
        username: 'erza',
        displayName: 'Erza',
        password: 'secret-123',
        role: 'agent',
      });
      return login(built, 'erza', 'secret-123');
    })();
    expect((await req('DELETE', `/api/scans/${created.id}`, otherCookie)).statusCode).toBe(403);
    expect((await req('DELETE', `/api/scans/${created.id}`, agent)).statusCode).toBe(200);
    expect((await req('GET', `/api/scans/${created.id}`, agent)).statusCode).toBe(404);
    expect(fs.existsSync(path.join(dataDir, 'scans', created.id))).toBe(false);
    expect((await worker('POST', 'claim')).statusCode).toBe(204);
  });

  it('a hall scan becomes a hall template with its plan photo', async () => {
    const bad = await upload('/api/scans', agent, [
      { name: 'purpose', value: 'garden' },
      ...videoScan('Salla'),
    ]);
    expect(bad.json()).toEqual({ error: 'invalid_purpose' });

    const created = (
      await upload('/api/scans', agent, [
        { name: 'purpose', value: 'hall' },
        ...videoScan('Salla Kristal'),
      ])
    ).json() as ScanJob;
    expect(created).toMatchObject({ purpose: 'hall', status: 'queued' });
    const claim = (await worker('POST', 'claim')).json() as ScanClaim;
    expect(claim).toMatchObject({ id: created.id, purpose: 'hall' });
    await worker('POST', `jobs/${claim.id}/result`, {
      lease: claim.lease,
      parts: [{ name: 'file', filename: 'scan.glb', content: glb }],
    });
    const ready = await job(claim.id);
    expect(ready.status).toBe('ready');

    // A hall is not finished into the library, nor with a broken hall.
    const asDecor = await upload(`/api/scans/${claim.id}/finish`, agent, [
      { name: 'file', filename: 'skanim.glb', content: glb },
    ]);
    expect(asDecor.json()).toEqual({ error: 'wrong_purpose' });
    const broken = await req('POST', `/api/scans/${claim.id}/finish-hall`, agent, {
      hall: { name: 'X', width: -3 },
    });
    expect(broken.statusCode).toBe(400);

    const hall = {
      name: 'Salla Kristal',
      width: 24.35,
      length: 16.2,
      height: 4.5,
      floor: 'parket',
      floorColor: '#B98A5E',
      wallColor: '#F3EBDD',
      structure: [],
      underlay: {
        url: '/uploads/images/plani.png',
        x: 0,
        y: 0,
        width: 24.35,
        height: 16.2,
        opacity: 0.7,
      },
    };
    const finished = await req('POST', `/api/scans/${claim.id}/finish-hall`, agent, { hall });
    expect(finished.statusCode).toBe(201);
    const template = finished.json() as { id: string; example: boolean; hall: typeof hall };
    expect(template).toMatchObject({ example: false, hall });
    expect(await job(claim.id)).toMatchObject({ status: 'done', hallId: template.id });
    expect(ready.resultFile && fs.existsSync(path.join(dataDir, ready.resultFile))).toBe(false);
    const halls = (await req('GET', '/api/halls', agent)).json() as Array<{ id: string }>;
    expect(halls.some((h) => h.id === template.id)).toBe(true);
  });

  it('tells the auto-stop about app use and running scans', async () => {
    expect((await built.app.inject({ url: '/api/worker/status' })).statusCode).toBe(401);
    const status = async () =>
      (await worker('GET', 'status')).json() as {
        lastActivityAt: string;
        queued: number;
        processing: number;
        oldestQueuedAt: string | null;
      };
    const before = await status();
    expect(before).toMatchObject({ queued: 0, processing: 0, oldestQueuedAt: null });

    // Polls of the worker and the starter are not use of the app; an agent's request is.
    await new Promise((r) => setTimeout(r, 5));
    await worker('GET', 'pending');
    expect((await status()).lastActivityAt).toBe(before.lastActivityAt);
    await req('GET', '/api/scans', agent);
    const after = await status();
    expect(Date.parse(after.lastActivityAt)).toBeGreaterThan(Date.parse(before.lastActivityAt));

    const created = (await upload('/api/scans', agent, videoScan('Status'))).json() as ScanJob;
    expect(await status()).toMatchObject({
      queued: 1,
      processing: 0,
      oldestQueuedAt: created.createdAt,
    });
    const claim = (await worker('POST', 'claim')).json() as ScanClaim;
    expect(await status()).toMatchObject({ queued: 0, processing: 1, oldestQueuedAt: null });

    // A worker that went silent does not keep the server on.
    built.db
      .prepare('UPDATE scan_jobs SET heartbeat_at = ? WHERE id = ?')
      .run(Date.now() - SCAN_STALE_MS - 1000, claim.id);
    expect(await status()).toMatchObject({ processing: 0 });
    expect((await req('DELETE', `/api/scans/${claim.id}`, agent)).statusCode).toBe(200);
  });
});
