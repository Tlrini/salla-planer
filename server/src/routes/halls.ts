import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { Hall, HallInput, type HallTemplate } from '@salla/shared';
import type { DB } from '../db.js';

interface HallRow {
  id: string;
  example: number;
  hall: string;
}

const toTemplate = (r: HallRow): HallTemplate => ({
  id: r.id,
  example: r.example === 1,
  hall: Hall.parse(JSON.parse(r.hall)),
});

export function registerHallRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/halls', async () => {
    const rows = db
      .prepare('SELECT id, example, hall FROM halls ORDER BY example DESC, updated_at DESC')
      .all() as HallRow[];
    return rows.map(toTemplate);
  });

  app.get<{ Params: { id: string } }>('/api/halls/:id', async (req, reply) => {
    const row = db
      .prepare('SELECT id, example, hall FROM halls WHERE id = ?')
      .get(req.params.id) as HallRow | undefined;
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return toTemplate(row);
  });

  app.post('/api/halls', async (req, reply) => {
    const body = HallInput.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'invalid_body', issues: body.error.issues });
    const now = new Date().toISOString();
    const id = nanoid();
    db.prepare(
      'INSERT INTO halls (id, example, hall, created_at, updated_at) VALUES (?, 0, ?, ?, ?)',
    ).run(id, JSON.stringify(body.data.hall), now, now);
    return reply
      .code(201)
      .send({ id, example: false, hall: body.data.hall } satisfies HallTemplate);
  });

  app.put<{ Params: { id: string } }>('/api/halls/:id', async (req, reply) => {
    const body = HallInput.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'invalid_body', issues: body.error.issues });
    const r = db
      .prepare('UPDATE halls SET hall = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(body.data.hall), new Date().toISOString(), req.params.id);
    if (r.changes === 0) return reply.code(404).send({ error: 'not_found' });
    const row = db
      .prepare('SELECT id, example, hall FROM halls WHERE id = ?')
      .get(req.params.id) as HallRow;
    return toTemplate(row);
  });

  app.delete<{ Params: { id: string } }>('/api/halls/:id', async (req, reply) => {
    const r = db.prepare('DELETE FROM halls WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });
}
