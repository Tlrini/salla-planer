import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { aiScanProgress, type ScanJob, type ScanList } from '@salla/shared';
import { mockProvider, runpodProvider, type AiJobState, type AiScanProvider } from './aiScan.js';
import { buildApp, type BuiltApp } from './app.js';
import type { AppConfig } from './config.js';

const WORKER_TOKEN = 'w'.repeat(40);
const BOUNDARY = '----salla-ai';
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const mp4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from('ftypisom'),
  Buffer.alloc(64),
]);
const glb = (() => {
  const b = Buffer.alloc(32);
  b.write('glTF', 0, 'ascii');
  return b;
})();

function form(fields: Record<string, string>, files: Array<[string, Buffer]>): Buffer {
  const parts = [
    ...Object.entries(fields).map(([k, v]) =>
      Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`),
    ),
    ...files.map(([name, content]) =>
      Buffer.concat([
        Buffer.from(
          `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
        ),
        content,
        Buffer.from('\r\n'),
      ]),
    ),
  ];
  return Buffer.concat([...parts, Buffer.from(`--${BOUNDARY}--\r\n`)]);
}

/** A provider the test answers by hand. */
function fakeProvider() {
  const photos: Buffer[] = [];
  const seeds: number[] = [];
  let next: AiJobState = { state: 'running' };
  let startError: Error | null = null;
  const provider: AiScanProvider = {
    async start(photo, seed) {
      if (startError) throw startError;
      photos.push(photo);
      seeds.push(seed);
      return `job-${photos.length}`;
    },
    check: async () => next,
  };
  return {
    provider,
    photos,
    seeds,
    answer: (s: AiJobState) => {
      next = s;
    },
    failStart: (e: Error | null) => {
      startError = e;
    },
  };
}

const config = (dataDir: string, extra: Partial<AppConfig>): AppConfig => ({
  dbPath: ':memory:',
  dataDir,
  webDist: null,
  secureCookies: false,
  production: false,
  logger: false,
  adminUser: 'admin',
  adminPassword: 'test-admin-pass',
  aiScanPollMs: 10,
  ...extra,
});

let built: BuiltApp;
let dataDir: string;
let cookie: string;
const fake = fakeProvider();

const upload = (fields: Record<string, string>, files: Array<[string, Buffer]>, app = built) =>
  app.app.inject({
    method: 'POST',
    url: '/api/scans',
    headers: { cookie, 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
    payload: form(fields, files),
  });
const job = async (id: string) =>
  (await built.app.inject({ url: `/api/scans/${id}`, headers: { cookie } })).json() as ScanJob;
const until = (check: () => Promise<boolean>) =>
  vi.waitFor(async () => expect(await check()).toBe(true), { timeout: 2000, interval: 10 });
const placeholder = async () => {
  const p = mockProvider(0);
  const state = await p.check(await p.start(jpg, 1));
  if (state.state !== 'done') throw new Error('no model');
  return state.glb;
};
const aiScan = async (name: string) => {
  const res = await upload({ name, method: 'ai' }, [['foto.jpg', jpg]]);
  expect(res.statusCode).toBe(201);
  return (res.json() as ScanJob).id;
};
const worker = (method: 'GET' | 'POST', url: string) =>
  built.app.inject({
    method,
    url: `/api/worker/${url}`,
    headers: { authorization: `Bearer ${WORKER_TOKEN}` },
  });

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'salla-ai-'));
  built = await buildApp(
    config(dataDir, { scanWorkerToken: WORKER_TOKEN, aiScanProvider: fake.provider }),
  );
  const res = await built.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'admin', password: 'test-admin-pass' },
  });
  cookie = `salla_sid=${res.cookies.find((c) => c.name === 'salla_sid')!.value}`;
});
afterAll(async () => {
  await built.app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
afterEach(() => {
  fake.answer({ state: 'running' });
  fake.failStart(null);
});

describe('AI scans', () => {
  it('tells the page which methods are on', async () => {
    const list = (await built.app.inject({ url: '/api/scans', headers: { cookie } })).json();
    expect(list as ScanList).toMatchObject({ enabled: true, aiEnabled: true });
  });

  it('turns one photo into a model ready to be cleaned', async () => {
    const before = fake.photos.length;
    const id = await aiScan('Libri');
    expect((await job(id)).method).toBe('ai');
    await until(async () => (await job(id)).status === 'processing');
    expect(fake.photos.length).toBe(before + 1);
    expect(fake.photos.at(-1)!.equals(jpg)).toBe(true);
    fake.answer({ state: 'done', glb });
    await until(async () => (await job(id)).status === 'ready');
    const done = await job(id);
    expect(done.resultFile).toMatch(/^\/uploads\/scans\//);
    // The photo is kept for another attempt until the agent keeps the model.
    expect(fs.existsSync(path.join(dataDir, 'scans', id))).toBe(true);
  });

  it('can make another model from the same photo, with another seed', async () => {
    const id = await aiScan('Provë tjetër');
    await until(async () => (await job(id)).status === 'processing');
    fake.answer({ state: 'done', glb });
    await until(async () => (await job(id)).status === 'ready');
    const first = (await job(id)).resultFile!;
    const seeds = fake.seeds.length;
    fake.answer({ state: 'running' });
    const again = await built.app.inject({
      method: 'POST',
      url: `/api/scans/${id}/regenerate`,
      headers: { cookie },
    });
    expect(again.statusCode).toBe(200);
    expect((again.json() as ScanJob).resultFile).toBeUndefined();
    expect(fs.existsSync(path.join(dataDir, first.replace(/^\//, '')))).toBe(false);
    await until(async () => (await job(id)).status === 'processing');
    expect(fake.seeds.length).toBe(seeds + 1);
    expect(fake.seeds.at(-1)).not.toBe(fake.seeds.at(-2));
    // While it runs there is nothing to regenerate.
    const busy = await built.app.inject({
      method: 'POST',
      url: `/api/scans/${id}/regenerate`,
      headers: { cookie },
    });
    expect(busy.statusCode).toBe(409);
    fake.answer({ state: 'done', glb });
    await until(async () => (await job(id)).status === 'ready');
  });

  it('forgets the photo once the model is kept', async () => {
    const id = await aiScan('E mbajtur');
    await until(async () => (await job(id)).status === 'processing');
    fake.answer({ state: 'done', glb: await placeholder() });
    await until(async () => (await job(id)).status === 'ready');
    const res = await built.app.inject({
      method: 'POST',
      url: `/api/scans/${id}/finish`,
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
      payload: form({}, [['skanim.glb', await placeholder()]]),
    });
    expect(res.statusCode).toBe(201);
    expect(fs.existsSync(path.join(dataDir, 'scans', id))).toBe(false);
    expect((await job(id)).status).toBe('done');
  });

  it('refuses anything but exactly one photo', async () => {
    const two = await upload({ name: 'x', method: 'ai' }, [
      ['a.jpg', jpg],
      ['b.jpg', jpg],
    ]);
    expect(two.statusCode).toBe(400);
    const video = await upload({ name: 'x', method: 'ai' }, [['v.mp4', mp4]]);
    expect(video.statusCode).toBe(400);
    const hall = await upload({ name: 'x', method: 'ai', purpose: 'hall' }, [['a.jpg', jpg]]);
    expect(hall.statusCode).toBe(400);
  });

  it('keeps the photo after a failure, so it can be tried again', async () => {
    const id = await aiScan('Vazo');
    await until(async () => (await job(id)).status === 'processing');
    fake.answer({ state: 'failed', error: 'out_of_memory' });
    await until(async () => (await job(id)).status === 'failed');
    expect((await job(id)).error).toBe('out_of_memory');
    fake.answer({ state: 'running' });
    const retry = await built.app.inject({
      method: 'POST',
      url: `/api/scans/${id}/retry`,
      headers: { cookie },
    });
    expect(retry.statusCode).toBe(200);
    await until(async () => (await job(id)).status === 'processing');
    fake.answer({ state: 'done', glb });
    await until(async () => (await job(id)).status === 'ready');
  });

  it('fails clearly when the GPU service cannot be reached', async () => {
    fake.failStart(new Error('runpod_start_401'));
    const id = await aiScan('Karrige');
    await until(async () => (await job(id)).status === 'failed');
    expect((await job(id)).error).toBe('runpod_start_401');
  });

  it('fails when the service returns something that is not a model', async () => {
    const id = await aiScan('Hark');
    await until(async () => (await job(id)).status === 'processing');
    fake.answer({ state: 'done', glb: Buffer.from('nope') });
    await until(async () => (await job(id)).status === 'failed');
    expect((await job(id)).error).toBe('not_glb');
  });

  it('is never given to the photogrammetry GPU, but keeps the server awake', async () => {
    const id = await aiScan('Qiri');
    expect(((await worker('GET', 'pending')).json() as { count: number }).count).toBe(0);
    expect((await worker('POST', 'claim')).statusCode).toBe(204);
    await until(async () => (await job(id)).status === 'processing');
    expect(((await worker('GET', 'status')).json() as { processing: number }).processing).toBe(1);
    fake.answer({ state: 'failed', error: 'done_with_test' });
    await until(async () => (await job(id)).status === 'failed');
  });

  it('still takes a normal scan with a video', async () => {
    const res = await upload({ name: 'Video' }, [['v.mp4', mp4]]);
    expect(res.statusCode).toBe(201);
    expect((res.json() as ScanJob).method).toBe('photogrammetry');
    await built.app.inject({
      method: 'DELETE',
      url: `/api/scans/${(res.json() as ScanJob).id}`,
      headers: { cookie },
    });
  });
});

describe('each method needs its own service', () => {
  it('refuses AI without a provider and photogrammetry without a worker', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'salla-ai2-'));
    const onlyWorker = await buildApp(config(dir, { scanWorkerToken: WORKER_TOKEN }));
    const onlyAi = await buildApp(config(dir, { aiScanProvider: fake.provider }));
    try {
      const login = async (a: BuiltApp) => {
        const r = await a.app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { username: 'admin', password: 'test-admin-pass' },
        });
        return `salla_sid=${r.cookies.find((c) => c.name === 'salla_sid')!.value}`;
      };
      const saved = cookie;
      cookie = await login(onlyWorker);
      expect(
        (await upload({ name: 'a', method: 'ai' }, [['a.jpg', jpg]], onlyWorker)).statusCode,
      ).toBe(503);
      cookie = await login(onlyAi);
      expect((await upload({ name: 'a' }, [['v.mp4', mp4]], onlyAi)).statusCode).toBe(503);
      cookie = saved;
    } finally {
      await onlyWorker.app.close();
      await onlyAi.app.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('RunPod connection', () => {
  const reply = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('sends the photo and the key, and reads the job id', async () => {
    const f = vi.fn(async () => reply({ id: 'abc', status: 'IN_QUEUE' }));
    const id = await runpodProvider('KEY', 'ep1', f as unknown as typeof fetch).start(jpg, 7);
    expect(id).toBe('abc');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.runpod.ai/v2/ep1/run');
    expect((init.headers as Record<string, string>).authorization).toBe('KEY');
    expect(JSON.parse(init.body as string)).toEqual({
      input: { image: jpg.toString('base64'), seed: 7 },
    });
  });

  it('reads each state', async () => {
    const check = (body: object) =>
      runpodProvider('K', 'e', (async () => reply(body)) as unknown as typeof fetch).check('a');
    expect(await check({ status: 'IN_PROGRESS' })).toEqual({ state: 'running' });
    expect(await check({ status: 'IN_QUEUE' })).toEqual({ state: 'running' });
    expect(await check({ status: 'COMPLETED', output: { glb: glb.toString('base64') } })).toEqual({
      state: 'done',
      glb,
    });
    expect(await check({ status: 'COMPLETED', output: { error: 'x' } })).toEqual({
      state: 'failed',
      error: 'x',
    });
    expect(await check({ status: 'FAILED', error: 'boom' })).toEqual({
      state: 'failed',
      error: 'boom',
    });
    expect(await check({ status: 'TIMED_OUT' })).toEqual({ state: 'failed', error: 'timed_out' });
  });

  it('reports a refused request', async () => {
    const f = (async () => reply({}, 401)) as unknown as typeof fetch;
    await expect(runpodProvider('K', 'e', f).start(jpg, 1)).rejects.toThrow('runpod_start_401');
  });
});

describe('without a GPU', () => {
  it('the placeholder is a real model file', async () => {
    const p = mockProvider(0);
    const id = await p.start(jpg, 1);
    const state = await p.check(id);
    expect(state.state).toBe('done');
    if (state.state === 'done') expect(state.glb.toString('ascii', 0, 4)).toBe('glTF');
  });

  it('progress rises and never reaches the end', () => {
    expect(aiScanProgress(0)).toBe(10);
    expect(aiScanProgress(60_000)).toBeGreaterThan(aiScanProgress(10_000));
    expect(aiScanProgress(3_600_000)).toBeLessThan(100);
  });
});
