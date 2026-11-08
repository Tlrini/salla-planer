import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXAMPLE_HALLS, type CatalogItem, type Project } from '@salla/shared';
import { buildApp, type BuiltApp } from './app.js';
import { SESSION_MS } from './auth.js';
import { cleanupImages, IMAGE_MIN_AGE_MS, referencedImages, unusedImages } from './cleanup.js';
import { purgeTrash } from './routes/projects.js';

let built: BuiltApp;
let dataDir: string;
let admin: string;
let token: string;

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'salla-fixes-test-'));
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
  const res = await built.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'admin', password: 'test-admin-pass' },
  });
  token = res.cookies.find((c) => c.name === 'salla_sid')!.value;
  admin = `salla_sid=${token}`;
});

afterAll(async () => {
  await built.app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('sliding sessions', () => {
  const expiresAt = () =>
    (
      built.db.prepare('SELECT expires_at FROM sessions WHERE token = ?').get(token) as {
        expires_at: number;
      }
    ).expires_at;

  it('a fresh session is not rewritten on every request', async () => {
    const before = expiresAt();
    const res = await built.app.inject({ url: '/api/auth/me', headers: { cookie: admin } });
    expect(res.statusCode).toBe(200);
    expect(res.cookies.find((c) => c.name === 'salla_sid')).toBeUndefined();
    expect(expiresAt()).toBe(before);
  });

  it('a session in use gets another 30 days, so nobody is logged out mid-work', async () => {
    built.db
      .prepare('UPDATE sessions SET expires_at = ? WHERE token = ?')
      .run(Date.now() + 2 * 86_400_000, token);
    const res = await built.app.inject({ url: '/api/auth/me', headers: { cookie: admin } });
    expect(res.statusCode).toBe(200);
    const cookie = res.cookies.find((c) => c.name === 'salla_sid');
    expect(cookie?.value).toBe(token);
    expect(expiresAt()).toBeGreaterThan(Date.now() + SESSION_MS - 60_000);
  });

  it('an expired session still fails', async () => {
    built.db
      .prepare('UPDATE sessions SET expires_at = ? WHERE token = ?')
      .run(Date.now() - 1, token);
    const res = await built.app.inject({ url: '/api/auth/me', headers: { cookie: admin } });
    expect(res.statusCode).toBe(401);
    built.db
      .prepare('UPDATE sessions SET expires_at = ? WHERE token = ?')
      .run(Date.now() + SESSION_MS, token);
  });
});

describe('final option and version history', () => {
  const hall = EXAMPLE_HALLS[0]!.hall;
  const table = {
    id: 'tb1',
    type: 'table_round_10',
    x: 5,
    y: 5,
    rotation: 0,
    width: 1.8,
    depth: 1.8,
    color: '#FFFFFF',
  };
  const send = (method: 'POST' | 'PUT' | 'GET', url: string, payload?: object) =>
    built.app.inject({ method, url, headers: { cookie: admin }, ...(payload ? { payload } : {}) });

  it('stock, list totals use the client’s final option, not the open one', async () => {
    const created = await send('POST', '/api/projects', {
      name: 'Opsionet',
      clientName: 'Arta',
      eventType: 'dasme',
      status: 'konfirmuar',
      eventDate: '2027-05-01',
      hall,
      items: [],
      option: { id: 'a', name: 'Opsioni A' },
      otherOptions: [{ id: 'b', name: 'Opsioni B', items: [table] }],
      finalOptionId: 'b',
    });
    expect(created.statusCode).toBe(201);
    const availability = (await send('GET', '/api/availability?date=2027-05-01')).json() as {
      taken: Record<string, number>;
    };
    expect(availability.taken.table_round_10).toBe(1);
    expect(availability.taken.chair).toBe(10);
    const list = (await send('GET', '/api/projects?query=opsionet')).json() as Array<{
      quoteTotal: number;
    }>;
    expect(list[0]!.quoteTotal).toBeGreaterThan(0);
  });

  it('restoring an old version keeps today’s checklist and status', async () => {
    const p = (
      await send('POST', '/api/projects', {
        name: 'Historiku',
        clientName: 'Besa',
        eventType: 'dasme',
        status: 'draft',
        hall,
        items: [],
      })
    ).json() as Project;
    // The first save keeps version 1 in the history.
    const v2 = (
      await send('PUT', `/api/projects/${p.id}`, {
        ...p,
        name: 'Historiku 2',
        items: [table],
        version: 1,
      })
    ).json() as Project;
    const v3 = (
      await send('PUT', `/api/projects/${p.id}`, {
        ...v2,
        status: 'instaluar',
        checklist: { lines: { table_round_10: { loaded: true, installed: true } } },
        version: v2.version,
      })
    ).json() as Project;
    const versions = (await send('GET', `/api/projects/${p.id}/versions`)).json() as Array<{
      id: string;
      name: string;
    }>;
    const first = versions.find((v) => v.name === 'Historiku')!;
    const restored = await send('POST', `/api/projects/${p.id}/versions/${first.id}/restore`, {
      version: v3.version,
    });
    expect(restored.statusCode).toBe(200);
    const r = restored.json() as Project;
    expect(r.name).toBe('Historiku');
    expect(r.items).toEqual([]);
    expect(r.status).toBe('instaluar');
    expect(r.checklist?.lines?.table_round_10?.installed).toBe(true);
  });
});

describe('bin, costs, copies and client notices', () => {
  const hall = EXAMPLE_HALLS[0]!.hall;
  let agent: string;
  const as = (
    cookie: string,
    method: 'POST' | 'PUT' | 'GET' | 'DELETE',
    url: string,
    payload?: object,
  ) => built.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  const create = async (cookie: string, extra: object = {}) =>
    (
      await as(cookie, 'POST', '/api/projects', {
        name: 'Koshi test',
        clientName: 'Drita',
        eventType: 'dasme',
        status: 'draft',
        hall,
        items: [],
        ...extra,
      })
    ).json() as Project;

  beforeAll(async () => {
    await as(admin, 'POST', '/api/users', {
      username: 'genti',
      displayName: 'Genti',
      password: 'secret-123',
      role: 'agent',
    });
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'genti', password: 'secret-123' },
    });
    agent = `salla_sid=${res.cookies.find((c) => c.name === 'salla_sid')!.value}`;
  });

  it('deleting moves a project to the bin; it can be restored and is purged after 30 days', async () => {
    const p = await create(agent);
    expect((await as(agent, 'DELETE', `/api/projects/${p.id}`)).statusCode).toBe(200);
    expect((await as(agent, 'GET', `/api/projects/${p.id}`)).statusCode).toBe(404);
    const trash = (await as(agent, 'GET', '/api/projects/trash')).json() as Array<{
      id: string;
      deletedBy: string;
    }>;
    expect(trash.find((t) => t.id === p.id)?.deletedBy).toBe('Genti');
    expect((await as(agent, 'POST', `/api/projects/${p.id}/restore`)).statusCode).toBe(200);
    expect((await as(agent, 'GET', `/api/projects/${p.id}`)).statusCode).toBe(200);

    await as(agent, 'DELETE', `/api/projects/${p.id}`);
    built.db
      .prepare('UPDATE projects SET deleted_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 31 * 86_400_000).toISOString(), p.id);
    expect(purgeTrash(built.db)).toBe(1);
    expect((await as(agent, 'POST', `/api/projects/${p.id}/restore`)).statusCode).toBe(404);
  });

  it('only the creator or an admin deletes a confirmed event', async () => {
    const confirmed = await create(admin, { status: 'konfirmuar' });
    expect((await as(agent, 'DELETE', `/api/projects/${confirmed.id}`)).statusCode).toBe(403);
    const own = await create(agent, { status: 'konfirmuar' });
    expect((await as(agent, 'DELETE', `/api/projects/${own.id}`)).statusCode).toBe(200);
    expect((await as(admin, 'DELETE', `/api/projects/${confirmed.id}`)).statusCode).toBe(200);
  });

  it('agents never see costs, and their saves keep them', async () => {
    await as(admin, 'PUT', '/api/catalog/stage', { cost: 40 });
    const catalogAgent = (await as(agent, 'GET', '/api/catalog')).json() as CatalogItem[];
    const catalogAdmin = (await as(admin, 'GET', '/api/catalog')).json() as CatalogItem[];
    expect(catalogAgent.find((c) => c.id === 'stage')).not.toHaveProperty('cost');
    expect(catalogAdmin.find((c) => c.id === 'stage')?.cost).toBe(40);
    // Clearing works too (null), so does clearing stock.
    await as(admin, 'PUT', '/api/catalog/stage', { cost: null, stock: 3 });
    await as(admin, 'PUT', '/api/catalog/stage', { stock: null });
    const cleared = ((await as(admin, 'GET', '/api/catalog')).json() as CatalogItem[]).find(
      (c) => c.id === 'stage',
    );
    expect(cleared).not.toHaveProperty('cost');
    expect(cleared).not.toHaveProperty('stock');

    const p = await create(admin, { costs: [{ id: 'c1', label: 'Transport', amount: 50 }] });
    const seen = (await as(agent, 'GET', `/api/projects/${p.id}`)).json() as Project;
    expect(seen).not.toHaveProperty('costs');
    const saved = await as(agent, 'PUT', `/api/projects/${p.id}`, {
      ...seen,
      name: 'Ndryshuar nga agjenti',
      costs: [],
      version: seen.version,
    });
    expect(saved.statusCode).toBe(200);
    const again = (await as(admin, 'GET', `/api/projects/${p.id}`)).json() as Project;
    expect(again.name).toBe('Ndryshuar nga agjenti');
    expect(again.costs).toEqual([{ id: 'c1', label: 'Transport', amount: 50 }]);
  });

  it('a copy leaves the guest list behind', async () => {
    const p = await create(agent, { guests: [{ id: 'g1', name: 'Arta Hoxha' }] });
    const copy = (await as(agent, 'POST', `/api/projects/${p.id}/duplicate`)).json() as Project;
    expect(copy.guests).toBeUndefined();
  });

  it('client approvals and comments ring the bell until someone looks', async () => {
    const p = await create(agent);
    const share = (await as(agent, 'POST', `/api/projects/${p.id}/shares`)).json() as {
      token: string;
    };
    await built.app.inject({
      method: 'POST',
      url: `/api/public/share/${share.token}/comments`,
      payload: { name: 'Klienti', text: 'Na pëlqen shumë!' },
    });
    await built.app.inject({
      method: 'POST',
      url: `/api/public/share/${share.token}/approve`,
      payload: { optionId: 'A', name: 'Klienti' },
    });
    const notices = (await as(agent, 'GET', '/api/notifications')).json() as Array<{
      projectId: string;
      kind: string;
    }>;
    const mine = notices
      .filter((n) => n.projectId === p.id)
      .map((n) => n.kind)
      .sort();
    expect(mine).toEqual(['approved', 'comment']);
    await as(agent, 'POST', '/api/notifications/seen', { projectId: p.id });
    const after = (await as(agent, 'GET', '/api/notifications')).json() as Array<{
      projectId: string;
    }>;
    expect(after.some((n) => n.projectId === p.id)).toBe(false);
  });
});

describe('unused floor-plan photos', () => {
  it('finds referenced names and old unreferenced files (pure)', () => {
    const refs = referencedImages([
      '{"underlay":{"url":"/uploads/images/a1.png","x":0}}',
      'nothing here',
      '{"url":"/uploads/images/b-2.jpg"}',
    ]);
    expect([...refs].sort()).toEqual(['a1.png', 'b-2.jpg']);
    const now = 10 * IMAGE_MIN_AGE_MS;
    const files = [
      { name: 'a1.png', mtimeMs: 0 },
      { name: 'old.png', mtimeMs: 0 },
      { name: 'new.png', mtimeMs: now - 1000 },
    ];
    expect(unusedImages(files, refs, now)).toEqual(['old.png']);
  });

  it('deletes only photos that nothing uses, keeping new uploads', async () => {
    const dir = path.join(dataDir, 'uploads', 'images');
    fs.mkdirSync(dir, { recursive: true });
    const old = new Date(Date.now() - 2 * IMAGE_MIN_AGE_MS);
    for (const name of ['used.png', 'versioned.png', 'orphan.png', 'fresh.png']) {
      fs.writeFileSync(path.join(dir, name), 'x');
      if (name !== 'fresh.png') fs.utimesSync(path.join(dir, name), old, old);
    }
    const hall = {
      ...EXAMPLE_HALLS[0]!.hall,
      underlay: { url: '/uploads/images/used.png', x: 0, y: 0, width: 10, height: 8, opacity: 0.5 },
    };
    const created = await built.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: admin },
      payload: {
        name: 'Me foto',
        clientName: 'Arta',
        eventType: 'dasme',
        status: 'draft',
        hall,
        items: [],
      },
    });
    expect(created.statusCode).toBe(201);
    const project = created.json() as Project;
    // An old version of some project still points at another photo.
    built.db
      .prepare(
        'INSERT INTO project_versions (id, project_id, version, data, updated_by, saved_at) VALUES (?, ?, 1, ?, ?, ?)',
      )
      .run(
        'v1',
        project.id,
        JSON.stringify({ hall: { underlay: { url: '/uploads/images/versioned.png' } } }),
        'Admin',
        new Date().toISOString(),
      );

    expect(cleanupImages(built.db, dataDir)).toEqual(['orphan.png']);
    expect(fs.readdirSync(dir).sort()).toEqual(['fresh.png', 'used.png', 'versioned.png']);
  });
});
