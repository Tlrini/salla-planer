import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXAMPLE_HALLS, type Project, type ProjectInput } from '@salla/shared';
import { buildApp, type BuiltApp } from './app.js';
import { backupName, backupsToDelete } from './backup.js';
import { isGlb } from './routes/uploads.js';

let built: BuiltApp;
let dataDir: string;

const input: ProjectInput = {
  name: 'Dasma – 14 qershor',
  clientName: 'Arta',
  eventType: 'dasme',
  status: 'draft',
  hall: EXAMPLE_HALLS[0]!.hall,
  items: [],
};

async function login(username: string, password: string): Promise<string> {
  const res = await built.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'salla_sid');
  expect(cookie?.httpOnly).toBe(true);
  return `salla_sid=${cookie!.value}`;
}

const req = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  payload?: unknown,
) =>
  built.app.inject({
    method,
    url,
    headers: { cookie },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

let admin: string;

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'salla-test-'));
  built = await buildApp({
    dbPath: ':memory:',
    dataDir,
    webDist: null,
    secureCookies: false,
    production: false,
    logger: false,
    adminUser: 'admin',
    adminPassword: 'test-admin-pass',
  });
  admin = await login('admin', 'test-admin-pass');
});

afterAll(async () => {
  await built.app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('auth', () => {
  it('health is public, everything else needs a session', async () => {
    expect((await built.app.inject({ url: '/api/health' })).statusCode).toBe(200);
    expect((await built.app.inject({ url: '/api/projects' })).statusCode).toBe(401);
  });
  it('rejects a wrong password', async () => {
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'nope' },
    });
    expect(res.statusCode).toBe(401);
  });
  it('me + logout', async () => {
    const c = await login('admin', 'test-admin-pass');
    expect((await req('GET', '/api/auth/me', c)).json()).toMatchObject({
      username: 'admin',
      role: 'admin',
    });
    await req('POST', '/api/auth/logout', c);
    expect((await req('GET', '/api/auth/me', c)).statusCode).toBe(401);
  });
});

describe('seed', () => {
  it('seeds catalog and example halls', async () => {
    expect((await req('GET', '/api/catalog', admin)).json()).toHaveLength(28);
    expect((await req('GET', '/api/halls', admin)).json()).toHaveLength(3);
  });
});

describe('projects + optimistic locking', () => {
  it('two users editing the same project: the second save gets 409', async () => {
    const agentRes = await req('POST', '/api/users', admin, {
      username: 'drita',
      displayName: 'Drita',
      password: 'secret-123',
      role: 'agent',
    });
    expect(agentRes.statusCode).toBe(201);
    const agent = await login('drita', 'secret-123');

    const created = (await req('POST', '/api/projects', admin, input)).json() as Project;
    expect(created.version).toBe(1);

    const a = (await req('GET', `/api/projects/${created.id}`, admin)).json() as Project;
    const b = (await req('GET', `/api/projects/${created.id}`, agent)).json() as Project;

    const first = await req('PUT', `/api/projects/${created.id}`, agent, {
      ...b,
      clientName: 'Arta B.',
      version: b.version,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ version: 2, updatedBy: 'Drita' });

    const second = await req('PUT', `/api/projects/${created.id}`, admin, {
      ...a,
      clientName: 'Arta A.',
      version: a.version,
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: 'conflict', updatedBy: 'Drita', version: 2 });
  });

  it('lists without items, filters, duplicates and deletes', async () => {
    const p = (
      await req('POST', '/api/projects', admin, {
        ...input,
        name: 'Event kompanie',
        clientName: 'Albtel',
        eventDate: '2026-12-01',
        status: 'konfirmuar',
      })
    ).json() as Project;
    const list = (await req('GET', '/api/projects?query=albtel', admin)).json() as Array<
      Record<string, unknown>
    >;
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('items');
    expect(list[0]).toMatchObject({ itemCount: 0 });
    expect(
      (
        await req('GET', '/api/projects?status=konfirmuar&from=2026-11-01&to=2026-12-31', admin)
      ).json(),
    ).toHaveLength(1);
    expect((await req('GET', '/api/projects?from=2027-01-01', admin)).json()).toHaveLength(0);

    const copy = await req('POST', `/api/projects/${p.id}/duplicate`, admin, { name: 'Kopje' });
    expect(copy.statusCode).toBe(201);
    expect(copy.json()).toMatchObject({ name: 'Kopje', status: 'draft', version: 1 });

    expect((await req('DELETE', `/api/projects/${p.id}`, admin)).statusCode).toBe(200);
    expect((await req('GET', `/api/projects/${p.id}`, admin)).statusCode).toBe(404);
  });

  it('validates bodies with the shared zod schemas', async () => {
    const res = await req('POST', '/api/projects', admin, { ...input, eventType: 'party' });
    expect(res.statusCode).toBe(400);
  });
});

describe('admin-only routes', () => {
  it('agents cannot change prices; admins can', async () => {
    const agent = await login('drita', 'secret-123');
    expect((await req('PUT', '/api/catalog/stage', agent, { price: 999 })).statusCode).toBe(403);
    expect((await req('GET', '/api/users', agent)).statusCode).toBe(403);
    const ok = await req('PUT', '/api/catalog/stage', admin, {
      price: 175.5,
      name: 'Skenë e madhe',
    });
    expect(ok.json()).toMatchObject({ id: 'stage', price: 175.5, name: 'Skenë e madhe' });
  });

  it('accepts a .glb upload and rejects other files', async () => {
    const glb = Buffer.alloc(20);
    glb.write('glTF', 0, 'ascii');
    const boundary = '----salla';
    const body = (content: Buffer, name: string) =>
      Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: model/gltf-binary\r\n\r\n`,
        ),
        content,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
    const upload = (content: Buffer, name: string) =>
      built.app.inject({
        method: 'POST',
        url: '/api/catalog/plant/model',
        headers: { cookie: admin, 'content-type': `multipart/form-data; boundary=${boundary}` },
        payload: body(content, name),
      });
    const bad = await upload(Buffer.from('not a model at all'), 'x.glb');
    expect(bad.statusCode).toBe(400);
    const good = await upload(glb, 'plant.glb');
    expect(good.statusCode).toBe(200);
    const modelFile = (good.json() as { modelFile: string }).modelFile;
    expect(modelFile).toMatch(/^\/uploads\/models\/plant-.+\.glb$/);
    const served = await built.app.inject({ url: modelFile });
    expect(served.statusCode).toBe(200);
  });

  it('cannot remove the last admin', async () => {
    const me = (await req('GET', '/api/auth/me', admin)).json() as { id: string };
    expect((await req('PUT', `/api/users/${me.id}`, admin, { role: 'agent' })).statusCode).toBe(
      409,
    );
    expect((await req('DELETE', `/api/users/${me.id}`, admin)).statusCode).toBe(409);
  });
});

describe('backups', () => {
  it('names and prunes by date, keeping 14 days', () => {
    const now = new Date(2026, 10, 20);
    expect(backupName(now)).toBe('app-2026-11-20.db');
    const files = [
      'app-2026-11-20.db',
      'app-2026-11-07.db',
      'app-2026-11-06.db',
      'app-2026-10-01.db',
      'notes.txt',
    ];
    expect(backupsToDelete(files, now)).toEqual(['app-2026-11-06.db', 'app-2026-10-01.db']);
  });
  it('detects glb magic', () => {
    expect(isGlb(Buffer.from('glTF\x02\x00\x00\x00\x00\x00\x00\x00'))).toBe(true);
    expect(isGlb(Buffer.from('PK\x03\x04........'))).toBe(false);
  });
});
