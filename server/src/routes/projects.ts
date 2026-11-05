import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import {
  DuplicateBody,
  Hall,
  Item,
  ProjectInput,
  ProjectListQuery,
  ProjectUpdate,
  type Project,
  type ProjectSummary,
} from '@salla/shared';
import { z } from 'zod';
import type { DB } from '../db.js';

interface ProjectRow {
  id: string;
  name: string;
  client_name: string;
  client_phone: string | null;
  event_type: Project['eventType'];
  event_date: string | null;
  guest_target: number | null;
  status: Project['status'];
  hall: string;
  items?: string;
  item_count?: number;
  notes: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  version: number;
}

const ItemList = z.array(Item);

function base(r: ProjectRow): Omit<Project, 'items'> {
  return {
    id: r.id,
    name: r.name,
    clientName: r.client_name,
    ...(r.client_phone ? { clientPhone: r.client_phone } : {}),
    eventType: r.event_type,
    ...(r.event_date ? { eventDate: r.event_date } : {}),
    ...(r.guest_target !== null ? { guestTarget: r.guest_target } : {}),
    status: r.status,
    hall: Hall.parse(JSON.parse(r.hall)),
    ...(r.notes ? { notes: r.notes } : {}),
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    version: r.version,
  };
}

export const rowToProject = (r: ProjectRow): Project => ({
  ...base(r),
  items: ItemList.parse(JSON.parse(r.items ?? '[]')),
});
const rowToSummary = (r: ProjectRow): ProjectSummary => ({
  ...base(r),
  itemCount: r.item_count ?? 0,
});

function insertProject(db: DB, p: Project) {
  db.prepare(
    `INSERT INTO projects (id, name, client_name, client_phone, event_type, event_date, guest_target, status, hall, items, notes,
       created_by, updated_by, created_at, updated_at, version)
     VALUES (@id, @name, @clientName, @clientPhone, @eventType, @eventDate, @guestTarget, @status, @hall, @items, @notes,
       @createdBy, @updatedBy, @createdAt, @updatedAt, @version)`,
  ).run({
    ...p,
    clientPhone: p.clientPhone ?? null,
    eventDate: p.eventDate ?? null,
    guestTarget: p.guestTarget ?? null,
    notes: p.notes ?? null,
    hall: JSON.stringify(p.hall),
    items: JSON.stringify(p.items),
  });
}

export function registerProjectRoutes(app: FastifyInstance, db: DB): void {
  const getRow = db.prepare('SELECT * FROM projects WHERE id = ?');

  app.get('/api/projects', async (req, reply) => {
    const q = ProjectListQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'invalid_query' });
    const where: string[] = [];
    const params: Record<string, string> = {};
    if (q.data.query?.trim()) {
      where.push('(LOWER(name) LIKE @q OR LOWER(client_name) LIKE @q)');
      params.q = `%${q.data.query.trim().toLowerCase()}%`;
    }
    if (q.data.status) {
      where.push('status = @status');
      params.status = q.data.status;
    }
    if (q.data.from) {
      where.push('event_date >= @from');
      params.from = q.data.from;
    }
    if (q.data.to) {
      where.push('event_date <= @to');
      params.to = q.data.to;
    }
    const rows = db
      .prepare(
        `SELECT id, name, client_name, client_phone, event_type, event_date, guest_target, status, hall, notes,
           created_by, updated_by, created_at, updated_at, version, json_array_length(items) AS item_count
         FROM projects ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY updated_at DESC LIMIT 500`,
      )
      .all(params) as ProjectRow[];
    return rows.map(rowToSummary);
  });

  app.post('/api/projects', async (req, reply) => {
    const body = ProjectInput.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'invalid_body', issues: body.error.issues });
    const now = new Date().toISOString();
    const who = req.user!.displayName;
    const project: Project = {
      ...body.data,
      id: nanoid(),
      createdBy: who,
      updatedBy: who,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    insertProject(db, project);
    return reply.code(201).send(project);
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    const row = getRow.get(req.params.id) as ProjectRow | undefined;
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return rowToProject(row);
  });

  app.put<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    const body = ProjectUpdate.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'invalid_body', issues: body.error.issues });
    const p = body.data;
    const now = new Date().toISOString();
    const who = req.user!.displayName;
    // Optimistic locking: the update only applies if nobody saved a newer version meanwhile.
    const result = db
      .prepare(
        `UPDATE projects SET name = @name, client_name = @clientName, client_phone = @clientPhone, event_type = @eventType,
           event_date = @eventDate, guest_target = @guestTarget, status = @status, hall = @hall, items = @items, notes = @notes,
           updated_by = @who, updated_at = @now, version = version + 1
         WHERE id = @id AND version = @version`,
      )
      .run({
        id: req.params.id,
        name: p.name,
        clientName: p.clientName,
        clientPhone: p.clientPhone ?? null,
        eventType: p.eventType,
        eventDate: p.eventDate ?? null,
        guestTarget: p.guestTarget ?? null,
        status: p.status,
        hall: JSON.stringify(p.hall),
        items: JSON.stringify(p.items),
        notes: p.notes ?? null,
        who,
        now,
        version: p.version,
      });
    const row = getRow.get(req.params.id) as ProjectRow | undefined;
    if (!row) return reply.code(404).send({ error: 'not_found' });
    if (result.changes === 0) {
      return reply
        .code(409)
        .send({ error: 'conflict', updatedBy: row.updated_by, version: row.version });
    }
    return rowToProject(row);
  });

  app.post<{ Params: { id: string } }>('/api/projects/:id/duplicate', async (req, reply) => {
    const row = getRow.get(req.params.id) as ProjectRow | undefined;
    if (!row) return reply.code(404).send({ error: 'not_found' });
    const body = DuplicateBody.safeParse(req.body ?? undefined);
    const src = rowToProject(row);
    const now = new Date().toISOString();
    const who = req.user!.displayName;
    const copy: Project = {
      ...src,
      id: nanoid(),
      name: (body.success && body.data?.name) || src.name,
      status: 'draft',
      createdBy: who,
      updatedBy: who,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    insertProject(db, copy);
    return reply.code(201).send(copy);
  });

  app.delete<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    const r = db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });
}
