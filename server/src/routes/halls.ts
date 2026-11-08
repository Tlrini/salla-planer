import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { Hall, HallInput, type HallTemplate } from '@salla/shared';
import type { DB } from '../db.js';

interface HallRow {
  id: string;
  example: number;
  hall: string;
  version: number;
  updated_by: string | null;
}

const COLUMNS = 'id, example, hall, version, updated_by';

const toTemplate = (r: HallRow): HallTemplate => ({
  id: r.id,
  example: r.example === 1,
  hall: Hall.parse(JSON.parse(r.hall)),
  version: r.version,
  ...(r.updated_by ? { updatedBy: r.updated_by } : {}),
});

/** Store a new (non-example) hall template; used by "Salla e re" and by hall scans. */
export function createHallTemplate(db: DB, hall: Hall, who: string): HallTemplate {
  const now = new Date().toISOString();
  const id = nanoid();
  db.prepare(
    'INSERT INTO halls (id, example, hall, created_at, updated_at, version, updated_by) VALUES (?, 0, ?, ?, ?, 1, ?)',
  ).run(id, JSON.stringify(hall), now, now, who);
  return toTemplate(db.prepare(`SELECT ${COLUMNS} FROM halls WHERE id = ?`).get(id) as HallRow);
}

export function registerHallRoutes(app: FastifyInstance, db: DB): void {
  const getRow = (id: string) =>
    db.prepare(`SELECT ${COLUMNS} FROM halls WHERE id = ?`).get(id) as HallRow | undefined;

  app.get('/api/halls', async () => {
    const rows = db
      .prepare(`SELECT ${COLUMNS} FROM halls ORDER BY example DESC, updated_at DESC`)
      .all() as HallRow[];
    return rows.map(toTemplate);
  });

  app.get<{ Params: { id: string } }>('/api/halls/:id', async (req, reply) => {
    const row = getRow(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return toTemplate(row);
  });

  app.post('/api/halls', async (req, reply) => {
    const body = HallInput.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'invalid_body', issues: body.error.issues });
    return reply.code(201).send(createHallTemplate(db, body.data.hall, req.user!.displayName));
  });

  app.put<{ Params: { id: string } }>('/api/halls/:id', async (req, reply) => {
    const body = HallInput.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'invalid_body', issues: body.error.issues });
    const current = getRow(req.params.id);
    if (!current) return reply.code(404).send({ error: 'not_found' });
    // The built-in "Shembull" halls are shared starting points: only admins change them.
    if (current.example === 1 && req.user!.role !== 'admin')
      return reply.code(403).send({ error: 'forbidden' });

    // Optimistic locking like projects: with a version, never overwrite a newer save.
    const { version } = body.data;
    const r = db
      .prepare(
        `UPDATE halls SET hall = @hall, updated_at = @now, updated_by = @who, version = version + 1
         WHERE id = @id ${version === undefined ? '' : 'AND version = @version'}`,
      )
      .run({
        hall: JSON.stringify(body.data.hall),
        now: new Date().toISOString(),
        who: req.user!.displayName,
        id: req.params.id,
        ...(version === undefined ? {} : { version }),
      });
    const row = getRow(req.params.id)!;
    if (r.changes === 0)
      return reply
        .code(409)
        .send({ error: 'conflict', updatedBy: row.updated_by ?? '', version: row.version });
    return toTemplate(row);
  });

  app.delete<{ Params: { id: string } }>('/api/halls/:id', async (req, reply) => {
    const current = getRow(req.params.id);
    if (!current) return reply.code(404).send({ error: 'not_found' });
    if (current.example === 1 && req.user!.role !== 'admin')
      return reply.code(403).send({ error: 'forbidden' });
    db.prepare('DELETE FROM halls WHERE id = ?').run(req.params.id);
    return { ok: true };
  });
}
