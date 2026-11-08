import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import {
  chosenItems,
  projectTotal,
  DuplicateBody,
  Hall,
  Item,
  ProjectExtra,
  ProjectInput,
  ProjectListQuery,
  ProjectUpdate,
  TRASH_DAYS,
  type CatalogItem,
  type Checklist,
  type Project,
  type ProjectSummary,
  type SessionUser,
  type TrashedProject,
} from '@salla/shared';
import { z } from 'zod';
import type { DB } from '../db.js';
import { readCatalog } from './catalog.js';
import { registerShareRoutes, shareActivity } from './shares.js';
import { requireAdmin } from '../auth.js';
import { computeStats } from '../stats.js';
import { registerVersionRoutes, snapshotBeforeSave } from './versions.js';
import { projectFor, seesCosts } from '../visibility.js';

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
  extra?: string;
  notes: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  version: number;
}

const ItemList = z.array(Item);

/** Beta fields stored in the `extra` JSON column. Invalid or missing JSON reads as empty. */
function readExtra(raw: string | undefined): ProjectExtra {
  if (!raw) return {};
  try {
    const parsed = ProjectExtra.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function writeExtra(p: ProjectExtra): string {
  return JSON.stringify(ProjectExtra.parse(p));
}

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

export const rowToProject = (r: ProjectRow): Project => {
  const extra = readExtra(r.extra);
  return {
    ...base(r),
    items: ItemList.parse(JSON.parse(r.items ?? '[]')),
    ...presentExtras(extra),
  };
};

/** Extra fields that are set (empty lists dropped), for project responses. */
function presentExtras(extra: ProjectExtra): ProjectExtra {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return out as ProjectExtra;
}
const rowToSummary = (r: ProjectRow, catalog: CatalogItem[]): ProjectSummary => {
  const extra = readExtra(r.extra);
  let items: Item[] = [];
  try {
    items = ItemList.parse(JSON.parse(r.items ?? '[]'));
  } catch {
    // A broken row still lists; its total shows as 0.
  }
  return {
    ...base(r),
    // The total of the client's final option (the open one if none is chosen yet).
    quoteTotal: projectTotal(chosenItems({ items, ...extra }), extra.pricing, catalog),
    ...(extra.pricing ? { pricing: extra.pricing } : {}),
    itemCount: r.item_count ?? 0,
    optionCount: 1 + (extra.otherOptions?.length ?? 0),
    ...(extra.option ? { option: extra.option } : {}),
    ...(extra.finalOptionId ? { finalOptionId: extra.finalOptionId } : {}),
  };
};

/**
 * The checklist for a project copy: the tasks stay (not done); the per-item loaded / installed /
 * returned marks are dropped, since nothing of the copy has been moved yet.
 */
function resetChecklist(c: Checklist): Checklist | undefined {
  if (!c.tasks?.length) return undefined;
  return { tasks: c.tasks.map((t) => ({ ...t, done: false })) };
}

function insertProject(db: DB, p: Project) {
  db.prepare(
    `INSERT INTO projects (id, name, client_name, client_phone, event_type, event_date, guest_target, status, hall, items, extra, notes,
       created_by, updated_by, created_at, updated_at, version)
     VALUES (@id, @name, @clientName, @clientPhone, @eventType, @eventDate, @guestTarget, @status, @hall, @items, @extra, @notes,
       @createdBy, @updatedBy, @createdAt, @updatedAt, @version)`,
  ).run({
    id: p.id,
    name: p.name,
    clientName: p.clientName,
    eventType: p.eventType,
    status: p.status,
    createdBy: p.createdBy,
    updatedBy: p.updatedBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    version: p.version,
    extra: writeExtra(p),
    clientPhone: p.clientPhone ?? null,
    eventDate: p.eventDate ?? null,
    guestTarget: p.guestTarget ?? null,
    notes: p.notes ?? null,
    hall: JSON.stringify(p.hall),
    items: JSON.stringify(p.items),
  });
}

export function registerProjectRoutes(app: FastifyInstance, db: DB, dataDir: string): void {
  // Projects in the bin are invisible to everything except the bin routes below.
  const getRow = db.prepare('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL');
  // Optimistic locking: the update only applies if nobody saved a newer version meanwhile.
  const updateStmt = db.prepare(
    `UPDATE projects SET name = @name, client_name = @clientName, client_phone = @clientPhone, event_type = @eventType,
       event_date = @eventDate, guest_target = @guestTarget, status = @status, hall = @hall, items = @items, extra = @extra, notes = @notes,
       updated_by = @who, updated_at = @now, version = version + 1
     WHERE id = @id AND version = @version AND deleted_at IS NULL`,
  );

  // "Paneli": business numbers for a year (admins).
  app.get('/api/stats', { preHandler: requireAdmin }, async (req, reply) => {
    const q = z.object({ year: z.coerce.number().int().min(2000).max(2100) }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'invalid_query' });
    const rows = db
      .prepare('SELECT * FROM projects WHERE deleted_at IS NULL')
      .all() as ProjectRow[];
    const projects = rows.flatMap((r) => {
      try {
        return [rowToProject(r)];
      } catch {
        return [];
      }
    });
    const today = new Date().toISOString().slice(0, 10);
    return computeStats(projects, readCatalog(db), q.data.year, today);
  });

  registerShareRoutes(app, db, dataDir, (id) => {
    const row = getRow.get(id) as ProjectRow | undefined;
    return row ? rowToProject(row) : null;
  });

  registerVersionRoutes(
    app,
    db,
    (id) => {
      const row = getRow.get(id) as ProjectRow | undefined;
      return row ? rowToProject(row) : null;
    },
    (current, next, who) => {
      const r = updateStmt.run({
        id: current.id,
        name: next.name,
        clientName: next.clientName,
        clientPhone: next.clientPhone ?? null,
        eventType: next.eventType,
        eventDate: next.eventDate ?? null,
        guestTarget: next.guestTarget ?? null,
        status: next.status,
        hall: JSON.stringify(next.hall),
        items: JSON.stringify(next.items),
        extra: writeExtra(next),
        notes: next.notes ?? null,
        who,
        now: new Date().toISOString(),
        version: current.version,
      });
      if (r.changes === 0) return null;
      return rowToProject(getRow.get(current.id) as ProjectRow);
    },
  );

  app.get('/api/projects', async (req, reply) => {
    const q = ProjectListQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'invalid_query' });
    const where: string[] = ['deleted_at IS NULL'];
    const params: Record<string, string> = {};
    if (q.data.query?.trim()) {
      // % and _ typed by the user are literal characters, not wildcards.
      where.push("(LOWER(name) LIKE @q ESCAPE '!' OR LOWER(client_name) LIKE @q ESCAPE '!')");
      const term = q.data.query
        .trim()
        .toLowerCase()
        .replace(/[!%_]/g, (c) => `!${c}`);
      params.q = `%${term}%`;
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
           created_by, updated_by, created_at, updated_at, version, extra, items, json_array_length(items) AS item_count
         FROM projects WHERE ${where.join(' AND ')}
         ORDER BY updated_at DESC LIMIT 500`,
      )
      .all(params) as ProjectRow[];
    const catalog = readCatalog(db);
    const activity = shareActivity(db);
    return rows.map((r) => {
      const a = activity.get(r.id);
      return {
        ...rowToSummary(r, catalog),
        ...(a?.approved !== undefined ? { clientApproved: a.approved } : {}),
        ...(a?.newComments ? { clientComments: a.newComments } : {}),
      };
    });
  });

  app.post('/api/projects', async (req, reply) => {
    const body = ProjectInput.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'invalid_body', issues: body.error.issues });
    const now = new Date().toISOString();
    const who = req.user!.displayName;
    const { costs, ...data } = body.data;
    const project: Project = {
      ...data,
      // Only admins set the agency's costs.
      ...(costs && seesCosts(req.user) ? { costs } : {}),
      id: nanoid(),
      createdBy: who,
      updatedBy: who,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    insertProject(db, project);
    return reply.code(201).send(projectFor(project, req.user));
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    const row = getRow.get(req.params.id) as ProjectRow | undefined;
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return projectFor(rowToProject(row), req.user);
  });

  app.put<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    const body = ProjectUpdate.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'invalid_body', issues: body.error.issues });
    const p = body.data;
    const now = new Date().toISOString();
    const who = req.user!.displayName;
    const before = getRow.get(req.params.id) as ProjectRow | undefined;
    if (!before) return reply.code(404).send({ error: 'not_found' });
    if (before.version !== p.version)
      return reply
        .code(409)
        .send({ error: 'conflict', updatedBy: before.updated_by, version: before.version });
    // Agents never see the costs, so their saves keep the stored ones.
    const costs = seesCosts(req.user) ? p.costs : readExtra(before.extra).costs;
    // Keep the state being left in the history (throttled), then save.
    const result = db.transaction(() => {
      snapshotBeforeSave(db, rowToProject(before), who);
      return updateStmt.run({
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
        extra: writeExtra({ ...p, costs }),
        notes: p.notes ?? null,
        who,
        now,
        version: p.version,
      });
    })();
    const row = getRow.get(req.params.id) as ProjectRow | undefined;
    if (!row) return reply.code(404).send({ error: 'not_found' });
    if (result.changes === 0) {
      return reply
        .code(409)
        .send({ error: 'conflict', updatedBy: row.updated_by, version: row.version });
    }
    return projectFor(rowToProject(row), req.user);
  });

  app.post<{ Params: { id: string } }>('/api/projects/:id/duplicate', async (req, reply) => {
    const row = getRow.get(req.params.id) as ProjectRow | undefined;
    if (!row) return reply.code(404).send({ error: 'not_found' });
    const body = DuplicateBody.safeParse(req.body ?? undefined);
    // A copy is a new draft: work done belongs to the original event only, and its guest list
    // to the original client (a copy is usually for someone else).
    const { guests: _guests, checklist, ...src } = rowToProject(row);
    const now = new Date().toISOString();
    const who = req.user!.displayName;
    const freshChecklist = checklist && resetChecklist(checklist);
    const copy: Project = {
      ...src,
      ...(freshChecklist ? { checklist: freshChecklist } : {}),
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
    return reply.code(201).send(projectFor(copy, req.user));
  });

  // ---- bin ("Koshi") -------------------------------------------------------------------------
  // Deleting moves a project to the bin for TRASH_DAYS (purgeTrash removes it for good). A
  // confirmed or installed event can only be deleted by the agent who created it or an admin.

  app.delete<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    const row = getRow.get(req.params.id) as ProjectRow | undefined;
    if (!row) return reply.code(404).send({ error: 'not_found' });
    const user = req.user!;
    if (!mayDelete(row, user)) return reply.code(403).send({ error: 'forbidden' });
    db.prepare(
      'UPDATE projects SET deleted_at = ?, deleted_by = ? WHERE id = ? AND deleted_at IS NULL',
    ).run(new Date().toISOString(), user.displayName, row.id);
    return { ok: true };
  });

  app.get('/api/projects/trash', async (): Promise<TrashedProject[]> => {
    const rows = db
      .prepare(
        `SELECT id, name, client_name, event_date, status, deleted_at, deleted_by FROM projects
         WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`,
      )
      .all() as Array<{
      id: string;
      name: string;
      client_name: string;
      event_date: string | null;
      status: Project['status'];
      deleted_at: string;
      deleted_by: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      clientName: r.client_name,
      ...(r.event_date ? { eventDate: r.event_date } : {}),
      status: r.status,
      deletedAt: r.deleted_at,
      deletedBy: r.deleted_by ?? '',
      purgeAt: new Date(Date.parse(r.deleted_at) + TRASH_DAYS * DAY_MS).toISOString(),
    }));
  });

  app.post<{ Params: { id: string } }>('/api/projects/:id/restore', async (req, reply) => {
    const r = db
      .prepare(
        'UPDATE projects SET deleted_at = NULL, deleted_by = NULL WHERE id = ? AND deleted_at IS NOT NULL',
      )
      .run(req.params.id);
    if (r.changes === 0) return reply.code(404).send({ error: 'not_found' });
    return projectFor(rowToProject(getRow.get(req.params.id) as ProjectRow), req.user);
  });
}

const DAY_MS = 86_400_000;

/** Drafts: any agent. Confirmed / installed events: the agent who created it, or an admin. */
export function mayDelete(
  row: Pick<ProjectRow, 'status' | 'created_by'>,
  user: Pick<SessionUser, 'role' | 'displayName'>,
): boolean {
  return row.status === 'draft' || user.role === 'admin' || row.created_by === user.displayName;
}

/** Remove projects that have been in the bin longer than TRASH_DAYS (versions and links go too). */
export function purgeTrash(db: DB, now = Date.now()): number {
  const before = new Date(now - TRASH_DAYS * DAY_MS).toISOString();
  return db
    .prepare('DELETE FROM projects WHERE deleted_at IS NOT NULL AND deleted_at < ?')
    .run(before).changes;
}
