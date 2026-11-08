import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXAMPLE_HALLS, type Project, type ProjectInput } from '@salla/shared';
import { buildApp, type BuiltApp } from './app.js';
import { backupName, backupsToDelete } from './backup.js';
import { parseTrustProxy, type AppConfig } from './config.js';
import { isStrongAdminPassword, seed } from './seed.js';
import { openDb } from './db.js';
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

describe('internet-facing hardening', () => {
  const testConfig = (dir: string, trustProxy: AppConfig['trustProxy']): AppConfig => ({
    dbPath: ':memory:',
    dataDir: dir,
    webDist: null,
    secureCookies: false,
    production: false,
    logger: false,
    trustProxy,
    adminUser: 'admin',
    adminPassword: 'test-admin-pass',
  });
  const failLogins = async (
    app: BuiltApp['app'],
    n: number,
    forwardedFor?: (i: number) => string,
  ) => {
    let last = 0;
    for (let i = 0; i < n; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: forwardedFor ? { 'x-forwarded-for': forwardedFor(i) } : {},
        payload: { username: 'nobody', password: 'wrong' },
      });
      last = res.statusCode;
    }
    return last;
  };

  it('parses TRUST_PROXY and refuses "true" and hop counts', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
    expect(() => parseTrustProxy('1')).toThrow();
    expect(parseTrustProxy('10.0.0.0/8, 127.0.0.1')).toBe('10.0.0.0/8, 127.0.0.1');
    expect(() => parseTrustProxy('true')).toThrow();
  });

  it('a faked X-Forwarded-For does not bypass the login limit without a trusted proxy', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'salla-test-'));
    const { app } = await buildApp(testConfig(dir, false));
    try {
      expect(await failLogins(app, 10, (i) => `203.0.113.${i}`)).toBe(401);
      expect(await failLogins(app, 1, () => '198.51.100.7')).toBe(429);
    } finally {
      await app.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('behind one trusted proxy, the limit is per real client IP', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'salla-test-'));
    // light-my-request connects from 127.0.0.1, which plays the trusted proxy here.
    const { app } = await buildApp(testConfig(dir, '127.0.0.1'));
    try {
      expect(await failLogins(app, 10, () => '203.0.113.1')).toBe(401);
      expect(await failLogins(app, 1, () => '203.0.113.1')).toBe(429);
      expect(await failLogins(app, 1, () => '203.0.113.2')).toBe(401);
    } finally {
      await app.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('production refuses a weak first admin password', () => {
    expect(isStrongAdminPassword('change-me-please')).toBe(false);
    expect(isStrongAdminPassword('short')).toBe(false);
    expect(isStrongAdminPassword('Salla-Kristal-2026!')).toBe(true);
    const db = openDb(':memory:');
    const opts = { adminUser: 'admin', production: true, log: () => {} };
    expect(() => seed(db, { ...opts, adminPassword: 'change-me-please' })).toThrow(/too weak/);
    expect(() => seed(db, { ...opts, adminPassword: 'Salla-Kristal-2026!' })).not.toThrow();
    db.close();
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
    // Uploaded models are agency data: only logged-in users may download them.
    expect((await built.app.inject({ url: modelFile })).statusCode).toBe(401);
    expect((await req('GET', modelFile, admin)).statusCode).toBe(200);
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

describe('decor library (Beta 1)', () => {
  const fixture = fs.readFileSync(
    fileURLToPath(new URL('../../e2e/fixtures/flower-vase.glb', import.meta.url)),
  );
  // Smallest valid PNG header + some bytes is enough for the magic check.
  const png = `data:image/png;base64,${Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64, 1),
  ]).toString('base64')}`;
  const boundary = '----salla-lib';
  const multipart = (content: Buffer, name: string) =>
    Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: model/gltf-binary\r\n\r\n`,
      ),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
  const upload = (cookie: string, content: Buffer, name: string) =>
    built.app.inject({
      method: 'POST',
      url: '/api/library',
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipart(content, name),
    });

  let ana: string;
  let besa: string;
  beforeAll(async () => {
    for (const [username, displayName] of [
      ['ana', 'Ana'],
      ['besa', 'Besa'],
    ]) {
      const r = await req('POST', '/api/users', admin, {
        username,
        displayName,
        password: 'secret-123',
        role: 'agent',
      });
      expect(r.statusCode).toBe(201);
    }
    ana = await login('ana', 'secret-123');
    besa = await login('besa', 'secret-123');
  });

  it('any agent uploads a scan; it starts as a draft owned by her', async () => {
    const res = await upload(ana, fixture, 'Peonia_rozë-scan.glb');
    expect(res.statusCode).toBe(201);
    const item = res.json() as Record<string, unknown>;
    expect(item).toMatchObject({
      name: 'Peonia rozë scan',
      source: 'library',
      createdBy: 'Ana',
      draft: true,
      scaleMode: 'uniform',
    });
    expect(String(item.id)).toMatch(/^lib_/);
    expect((await req('GET', String(item.modelFile), besa)).statusCode).toBe(200);
    const list = (await req('GET', '/api/catalog', besa)).json() as Array<{ id: string }>;
    expect(list.map((c) => c.id)).toContain(item.id);
  });

  it('rejects non-glb files and accepts scans larger than the 20 MB admin limit', async () => {
    expect((await upload(ana, Buffer.from('hello there, not a model'), 'x.glb')).statusCode).toBe(
      400,
    );
    const big = Buffer.concat([fixture, Buffer.alloc(25 * 1024 * 1024)]);
    expect((await upload(ana, big, 'big.glb')).statusCode).toBe(201);
  });

  it('another agent finishes the setup; structure and built-in items are refused', async () => {
    const item = (await upload(ana, fixture, 'roses.glb')).json() as { id: string };
    const ok = await req('PUT', `/api/library/${item.id}`, besa, {
      name: 'Trëndafila të bardhë',
      height: 0.46,
      width: 0.37,
      depth: 0.37,
      price: 28,
      tabletop: true,
      modelRotation: { x: -90, y: 0, z: 0 },
      draft: false,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ name: 'Trëndafila të bardhë', draft: false, price: 28 });
    expect(
      (await req('PUT', `/api/library/${item.id}`, besa, { category: 'structure' })).statusCode,
    ).toBe(400);
    expect((await req('PUT', '/api/library/stage', besa, { price: 1 })).statusCode).toBe(404);
  });

  it('stores PNG thumbnails and serves them only to logged-in users', async () => {
    const item = (await upload(ana, fixture, 'candles.glb')).json() as { id: string };
    const bad = await req('POST', `/api/library/${item.id}/images`, ana, {
      thumbnail: 'data:image/png;base64,aGVsbG8=',
      topView: png,
    });
    expect(bad.statusCode).toBe(400);
    const res = await req('POST', `/api/library/${item.id}/images`, ana, {
      thumbnail: png,
      topView: png,
    });
    expect(res.statusCode).toBe(200);
    const { thumbnail, topView } = res.json() as { thumbnail: string; topView: string };
    expect(thumbnail).toMatch(/^\/uploads\/thumbs\/lib_.+-thumb\.png$/);
    expect((await req('GET', topView, besa)).statusCode).toBe(200);
    expect((await built.app.inject({ url: thumbnail })).statusCode).toBe(401);
  });

  it('only the uploader or an admin deletes; decor used in a project is archived', async () => {
    const unused = (await upload(ana, fixture, 'unused.glb')).json() as {
      id: string;
      modelFile: string;
    };
    expect((await req('DELETE', `/api/library/${unused.id}`, besa)).statusCode).toBe(403);
    expect((await req('DELETE', `/api/library/${unused.id}`, ana)).json()).toEqual({
      deleted: true,
    });
    expect((await req('GET', unused.modelFile, ana)).statusCode).toBe(404);

    const used = (await upload(ana, fixture, 'used.glb')).json() as { id: string };
    const project = {
      ...input,
      items: [
        {
          id: 'i1',
          type: used.id,
          x: 5,
          y: 5,
          rotation: 0,
          width: 0.4,
          depth: 0.4,
          color: '#FFFFFF',
        },
      ],
    };
    expect((await req('POST', '/api/projects', ana, project)).statusCode).toBe(201);
    const res = await req('DELETE', `/api/library/${used.id}`, admin);
    expect(res.json()).toMatchObject({ archived: true, item: { active: false } });
  });
});

describe('design options (Beta 2)', () => {
  it('stores options and the final choice; the list only counts them', async () => {
    const items = [
      {
        id: 't1',
        type: 'table_round_10',
        x: 5,
        y: 5,
        rotation: 0,
        width: 1.8,
        depth: 1.8,
        color: '#FFFFFF',
        tableDecor: 'centerpiece',
      },
    ];
    const created = (
      await req('POST', '/api/projects', admin, {
        ...input,
        name: 'Me opsione',
        items,
        option: { id: 'b', name: 'Opsioni B' },
        otherOptions: [
          { id: 'a', name: 'Opsioni A', items: [{ ...items[0], tableDecor: 'candle_group' }] },
        ],
        finalOptionId: 'a',
      })
    ).json() as Project;
    const got = (await req('GET', `/api/projects/${created.id}`, admin)).json() as Project;
    expect(got.option).toEqual({ id: 'b', name: 'Opsioni B' });
    expect(got.otherOptions?.[0]?.items[0]?.tableDecor).toBe('candle_group');
    expect(got.finalOptionId).toBe('a');
    expect(got.items[0]?.tableDecor).toBe('centerpiece');

    const updated = await req('PUT', `/api/projects/${created.id}`, admin, {
      ...got,
      otherOptions: [],
      option: undefined,
      finalOptionId: undefined,
      version: got.version,
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).not.toHaveProperty('otherOptions');

    const list = (await req('GET', '/api/projects?query=opsione', admin)).json() as Array<
      Record<string, unknown>
    >;
    expect(list[0]).toMatchObject({ optionCount: 1 });
    expect(list[0]).not.toHaveProperty('otherOptions');
  });

  it('copies options when duplicating a project', async () => {
    const created = (
      await req('POST', '/api/projects', admin, {
        ...input,
        option: { id: 'b', name: 'Opsioni B' },
        otherOptions: [{ id: 'a', name: 'Opsioni A', items: [] }],
      })
    ).json() as Project;
    const copy = (
      await req('POST', `/api/projects/${created.id}/duplicate`, admin)
    ).json() as Project;
    expect(copy.otherOptions?.map((o) => o.name)).toEqual(['Opsioni A']);
  });

  it('a duplicate starts as a draft with an unchecked checklist', async () => {
    const created = (
      await req('POST', '/api/projects', admin, {
        ...input,
        name: 'Me listë pune',
        status: 'konfirmuar',
        checklist: {
          lines: { table_round_10: { loaded: true, installed: true } },
          tasks: [{ id: 'task1', text: 'Sill lulet', done: true, assignee: 'Genta' }],
        },
      })
    ).json() as Project;

    const copy = (
      await req('POST', `/api/projects/${created.id}/duplicate`, admin)
    ).json() as Project;
    expect(copy.status).toBe('draft');
    expect(copy.checklist).toEqual({
      tasks: [{ id: 'task1', text: 'Sill lulet', done: false, assignee: 'Genta' }],
    });
    // The original keeps its progress.
    const original = (await req('GET', `/api/projects/${created.id}`, admin)).json() as Project;
    expect(original.checklist?.lines?.table_round_10?.installed).toBe(true);
  });
});

describe('fixes from the alpha review', () => {
  let agent: string;
  beforeAll(async () => {
    await req('POST', '/api/users', admin, {
      username: 'genta',
      displayName: 'Genta',
      password: 'secret-123',
      role: 'agent',
    });
    agent = await login('genta', 'secret-123');
  });

  it('hall templates: a stale save gets 409 instead of overwriting', async () => {
    const t = (
      await req('POST', '/api/halls', agent, {
        hall: { ...EXAMPLE_HALLS[1]!.hall, name: 'Salla X' },
      })
    ).json() as { id: string; version: number };
    expect(t.version).toBe(1);
    const first = await req('PUT', `/api/halls/${t.id}`, admin, {
      hall: { ...EXAMPLE_HALLS[1]!.hall, name: 'Salla X (admin)' },
      version: 1,
    });
    expect(first.json()).toMatchObject({ version: 2, updatedBy: 'Administrator' });
    const stale = await req('PUT', `/api/halls/${t.id}`, agent, {
      hall: { ...EXAMPLE_HALLS[1]!.hall, name: 'Salla X (agent)' },
      version: 1,
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({
      error: 'conflict',
      updatedBy: 'Administrator',
      version: 2,
    });
  });

  it('example halls: agents cannot change or delete them, admins can', async () => {
    const example = (
      (await req('GET', '/api/halls', agent)).json() as Array<{
        id: string;
        example: boolean;
        hall: unknown;
      }>
    ).find((h) => h.example)!;
    expect(
      (await req('PUT', `/api/halls/${example.id}`, agent, { hall: example.hall })).statusCode,
    ).toBe(403);
    expect((await req('DELETE', `/api/halls/${example.id}`, agent)).statusCode).toBe(403);
    expect(
      (await req('PUT', `/api/halls/${example.id}`, admin, { hall: example.hall })).statusCode,
    ).toBe(200);
  });

  it('project search treats % and _ literally', async () => {
    await req('POST', '/api/projects', admin, { ...input, name: 'Zbritje 50% dimri' });
    await req('POST', '/api/projects', admin, { ...input, name: 'Zbritje 500 vere' });
    const hits = (
      await req('GET', `/api/projects?query=${encodeURIComponent('50%')}`, admin)
    ).json() as Array<{ name: string }>;
    expect(hits.map((h) => h.name)).toEqual(['Zbritje 50% dimri']);
    const none = (
      await req('GET', `/api/projects?query=${encodeURIComponent('zbritje_')}`, admin)
    ).json() as unknown[];
    expect(none).toEqual([]);
  });

  it('a new password signs out other devices but keeps the current session', async () => {
    const other = await login('genta', 'secret-123');
    const me = (await req('GET', '/api/auth/me', agent)).json() as { id: string };
    const res = await req('PUT', `/api/users/${me.id}`, admin, { password: 'another-123' });
    expect(res.statusCode).toBe(200);
    expect((await req('GET', '/api/auth/me', other)).statusCode).toBe(401);
    expect((await req('GET', '/api/auth/me', admin)).statusCode).toBe(200);
  });
});

describe('inventory planning', () => {
  const tables = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `t${i}`,
      type: 'table_round_10',
      x: 3 + i * 3,
      y: 5,
      rotation: 0,
      width: 1.8,
      depth: 1.8,
      color: '#FFFFFF',
    }));

  it('reports what other booked events take on a date, and stock conflicts in the calendar', async () => {
    expect((await req('PUT', '/api/catalog/chair', admin, { stock: 50 })).statusCode).toBe(200);
    const day = '2031-06-14';
    const a = (
      await req('POST', '/api/projects', admin, {
        ...input,
        eventDate: day,
        status: 'konfirmuar',
        items: tables(3),
      })
    ).json() as Project;
    await req('POST', '/api/projects', admin, {
      ...input,
      eventDate: day,
      status: 'konfirmuar',
      items: tables(3),
    });
    await req('POST', '/api/projects', admin, {
      ...input,
      eventDate: day,
      status: 'draft',
      items: tables(1),
    });

    const av = (
      await req('GET', `/api/availability?date=${day}&exclude=${a.id}`, admin)
    ).json() as {
      taken: Record<string, number>;
      tentative: Record<string, number>;
      events: unknown[];
    };
    expect(av.taken.chair).toBe(30);
    expect(av.tentative.chair).toBe(10);
    expect(av.events).toHaveLength(2);

    const cal = (await req('GET', '/api/calendar?from=2031-06-01&to=2031-06-30', admin)).json() as {
      events: unknown[];
      conflicts: Array<{ date: string; shortages: Array<{ type: string; missing: number }> }>;
    };
    expect(cal.events).toHaveLength(3);
    // Two confirmed events need 60 chairs; the agency owns 50.
    expect(cal.conflicts).toEqual([
      { date: day, shortages: [expect.objectContaining({ type: 'chair', missing: 10 })] },
    ]);
    expect(
      (await req('GET', '/api/calendar?from=2031-06-30&to=2031-06-01', admin)).statusCode,
    ).toBe(400);
  });
});

describe('agency settings and finance in the list', () => {
  it('everyone reads the agency details, only admins change them', async () => {
    const agent = await login('ana', 'secret-123');
    expect((await req('GET', '/api/settings/agency', agent)).json()).toEqual({ name: '' });
    expect((await req('PUT', '/api/settings/agency', agent, { name: 'X' })).statusCode).toBe(403);
    const saved = await req('PUT', '/api/settings/agency', admin, {
      name: 'Dekor Ëndrra',
      nipt: 'L12345678A',
    });
    expect(saved.statusCode).toBe(200);
    expect((await req('GET', '/api/settings/agency', agent)).json()).toMatchObject({
      name: 'Dekor Ëndrra',
    });
  });

  it('lists the quote total (no payments in the app)', async () => {
    const created = (
      await req('POST', '/api/projects', admin, {
        ...input,
        name: 'Me pagesa',
        items: [
          {
            id: 't',
            type: 'stage',
            x: 10,
            y: 3,
            rotation: 0,
            width: 6,
            depth: 3,
            color: '#FFFFFF',
          },
        ],
        pricing: { extras: [{ id: 'e', label: 'Transport', amount: 50 }] },
      })
    ).json() as Project;
    const row = (
      (await req('GET', '/api/projects?query=me%20pagesa', admin)).json() as Array<
        Record<string, unknown>
      >
    )[0]!;
    // An earlier test changes the stage price, so take it from the catalog.
    const stage = (
      (await req('GET', '/api/catalog', admin)).json() as Array<{ id: string; price: number }>
    ).find((c) => c.id === 'stage')!;
    expect(row).toMatchObject({ id: created.id, quoteTotal: stage.price + 50 });
    expect(row).not.toHaveProperty('paid');
  });
});

describe('version history', () => {
  it('snapshots before saves (throttled), lists them and restores one, keeping the status', async () => {
    const p0 = (
      await req('POST', '/api/projects', admin, { ...input, name: 'Historiku A' })
    ).json() as Project;
    // First save: snapshot of version 1 is taken.
    const p1 = (
      await req('PUT', `/api/projects/${p0.id}`, admin, {
        ...p0,
        name: 'Historiku B',
        version: p0.version,
      })
    ).json() as Project;
    // Second save by the same person a moment later: throttled, no new snapshot.
    const p2 = (
      await req('PUT', `/api/projects/${p0.id}`, admin, {
        ...p1,
        name: 'Historiku C',
        status: 'konfirmuar',
        version: p1.version,
      })
    ).json() as Project;
    const list = (await req('GET', `/api/projects/${p0.id}/versions`, admin)).json() as Array<{
      id: string;
      version: number;
      name: string;
    }>;
    expect(list.map((v) => [v.version, v.name])).toEqual([[1, 'Historiku A']]);

    const stale = await req(
      'POST',
      `/api/projects/${p0.id}/versions/${list[0]!.id}/restore`,
      admin,
      {
        version: 1,
      },
    );
    expect(stale.statusCode).toBe(409);
    const restored = (
      await req('POST', `/api/projects/${p0.id}/versions/${list[0]!.id}/restore`, admin, {
        version: p2.version,
      })
    ).json() as Project;
    expect(restored).toMatchObject({ name: 'Historiku A', version: p2.version + 1 });
    expect(restored.status).toBe('konfirmuar');
    // The replaced state ("C") is now in the history too.
    const after = (await req('GET', `/api/projects/${p0.id}/versions`, admin)).json() as Array<{
      name: string;
    }>;
    expect(after.map((v) => v.name)).toEqual(['Historiku C', 'Historiku A']);
  });
});

describe('client share links', () => {
  it('create → client views without login → approves and comments → agent sees it → revoke', async () => {
    const project = (
      await req('POST', '/api/projects', admin, {
        ...input,
        name: 'Për klientin',
        items: [
          {
            id: 't',
            type: 'table_round_10',
            x: 5,
            y: 5,
            rotation: 0,
            width: 1.8,
            depth: 1.8,
            color: '#FFFFFF',
          },
        ],
        option: { id: 'b', name: 'Opsioni B' },
        otherOptions: [{ id: 'a', name: 'Opsioni A', items: [] }],
        guests: [{ id: 'g', name: 'Sekret Mysafiri' }],
        costs: [{ id: 'c', label: 'Transport', amount: 99 }],
        notes: 'shënim i brendshëm',
      })
    ).json() as Project;
    const created = await req('POST', `/api/projects/${project.id}/shares`, admin, {});
    expect(created.statusCode).toBe(201);
    const { token } = created.json() as { token: string };

    // No cookie: the client view works and hides private data.
    const view = await built.app.inject({ url: `/api/public/share/${token}` });
    expect(view.statusCode).toBe(200);
    const body = view.json() as {
      project: Record<string, unknown>;
      totals: Record<string, number>;
      catalog: Array<{ id: string; stock?: number }>;
    };
    expect(body.project).not.toHaveProperty('guests');
    expect(body.project).not.toHaveProperty('costs');
    expect(body.project).not.toHaveProperty('notes');
    expect(Object.keys(body.totals).sort()).toEqual(['a', 'b']);
    expect(body.catalog.map((c) => c.id)).toContain('table_round_10');
    expect(body.catalog.every((c) => c.stock === undefined)).toBe(true);
    expect(JSON.stringify(body)).not.toContain('Sekret Mysafiri');

    // Files outside the project are not served through the link.
    expect(
      (await built.app.inject({ url: `/api/public/share/${token}/file/models/x.glb` })).statusCode,
    ).toBe(404);

    const approve = await built.app.inject({
      method: 'POST',
      url: `/api/public/share/${token}/approve`,
      payload: { optionId: 'a', name: 'Arta' },
    });
    expect(approve.json()).toMatchObject({ optionId: 'a', optionName: 'Opsioni A', by: 'Arta' });
    await built.app.inject({
      method: 'POST',
      url: `/api/public/share/${token}/comments`,
      payload: { name: 'Arta', text: 'Lulet rozë, ju lutem!' },
    });

    const listRow = (
      (await req('GET', '/api/projects?query=klientin', admin)).json() as Array<
        Record<string, unknown>
      >
    )[0]!;
    expect(listRow).toMatchObject({ clientApproved: 'Opsioni A', clientComments: 1 });

    const shares = (await req('GET', `/api/projects/${project.id}/shares`, admin)).json() as Array<{
      approval: { optionName: string };
      comments: Array<{ text: string; fromClient: boolean }>;
    }>;
    expect(shares[0]!.approval.optionName).toBe('Opsioni A');
    expect(shares[0]!.comments).toEqual([
      expect.objectContaining({ text: 'Lulet rozë, ju lutem!', fromClient: true }),
    ]);
    // Seen: the badge clears.
    const again = (
      (await req('GET', '/api/projects?query=klientin', admin)).json() as Array<
        Record<string, unknown>
      >
    )[0]!;
    expect(again.clientComments).toBeUndefined();

    const reply = await req('POST', `/api/shares/${token}/comments`, admin, {
      text: 'Po, patjetër.',
    });
    expect((reply.json() as unknown[]).length).toBe(2);

    expect((await req('DELETE', `/api/shares/${token}`, admin)).statusCode).toBe(200);
    expect((await built.app.inject({ url: `/api/public/share/${token}` })).statusCode).toBe(404);
    expect((await built.app.inject({ url: '/api/public/share/not-a-token' })).statusCode).toBe(404);
  });
});

describe('floor-plan photo upload', () => {
  it('accepts PNG/JPEG/WebP by content and refuses other files', async () => {
    const { imageType } = await import('./routes/images.js');
    expect(imageType(Buffer.from('\x89PNG\r\n\x1a\n0000', 'latin1'))).toBe('png');
    expect(imageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('jpg');
    expect(imageType(Buffer.from('RIFF0000WEBPVP8 '))).toBe('webp');
    expect(imageType(Buffer.from('GIF89a000000'))).toBeNull();

    const boundary = '----img';
    const upload = (content: Buffer) =>
      built.app.inject({
        method: 'POST',
        url: '/api/images',
        headers: { cookie: admin, 'content-type': `multipart/form-data; boundary=${boundary}` },
        payload: Buffer.concat([
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="plan.png"\r\nContent-Type: image/png\r\n\r\n`,
          ),
          content,
          Buffer.from(`\r\n--${boundary}--\r\n`),
        ]),
      });
    expect((await upload(Buffer.from('<svg onload=alert(1)>'))).statusCode).toBe(400);
    const ok = await upload(Buffer.from('\x89PNG\r\n\x1a\n0000000000', 'latin1'));
    expect(ok.statusCode).toBe(201);
    const { url } = ok.json() as { url: string };
    expect(url).toMatch(/^\/uploads\/images\/[\w-]+\.png$/);
    expect((await req('GET', url, admin)).statusCode).toBe(200);
    expect((await built.app.inject({ url })).statusCode).toBe(401);
  });
});
