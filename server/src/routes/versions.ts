import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { Project, projectFinance } from '@salla/shared';
import type { DB } from '../db.js';
import { readCatalog } from './catalog.js';

/** At most one automatic snapshot per project in this window (unless another person edits). */
export const SNAPSHOT_EVERY_MS = 10 * 60 * 1000;
/** Snapshots kept per project (oldest are removed). */
export const KEEP_SNAPSHOTS = 60;

interface SnapshotRow {
  id: string;
  version: number;
  data: string;
  updated_by: string;
  saved_at: string;
}

/**
 * Keep the state a project is about to leave: when the last snapshot is older than 10 minutes,
 * or the previous save was made by someone else, or `force` (before a restore).
 */
export function snapshotBeforeSave(
  db: DB,
  current: Project,
  savingUser: string,
  now = new Date(),
  force = false,
): boolean {
  const last = db
    .prepare(
      'SELECT saved_at, updated_by FROM project_versions WHERE project_id = ? ORDER BY saved_at DESC LIMIT 1',
    )
    .get(current.id) as { saved_at: string; updated_by: string } | undefined;
  const due =
    force ||
    !last ||
    now.getTime() - Date.parse(last.saved_at) >= SNAPSHOT_EVERY_MS ||
    current.updatedBy !== savingUser;
  if (!due) return false;
  db.prepare(
    'INSERT INTO project_versions (id, project_id, version, data, updated_by, saved_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    nanoid(10),
    current.id,
    current.version,
    JSON.stringify(current),
    current.updatedBy,
    now.toISOString(),
  );
  db.prepare(
    `DELETE FROM project_versions WHERE project_id = ? AND id NOT IN (
       SELECT id FROM project_versions WHERE project_id = ? ORDER BY saved_at DESC LIMIT ?)`,
  ).run(current.id, current.id, KEEP_SNAPSHOTS);
  return true;
}

/** Version history of a project ("Historiku"): list snapshots, restore one. */
export function registerVersionRoutes(
  app: FastifyInstance,
  db: DB,
  loadProject: (id: string) => Project | null,
  writeProject: (current: Project, next: Project, who: string) => Project | null,
): void {
  app.get<{ Params: { id: string } }>('/api/projects/:id/versions', async (req, reply) => {
    if (!loadProject(req.params.id)) return reply.code(404).send({ error: 'not_found' });
    const catalog = readCatalog(db);
    const rows = db
      .prepare(
        'SELECT id, version, data, updated_by, saved_at FROM project_versions WHERE project_id = ? ORDER BY saved_at DESC',
      )
      .all(req.params.id) as SnapshotRow[];
    return rows.flatMap((r) => {
      const parsed = Project.safeParse(JSON.parse(r.data));
      if (!parsed.success) return [];
      const p = parsed.data;
      return [
        {
          id: r.id,
          version: r.version,
          updatedBy: r.updated_by,
          savedAt: r.saved_at,
          name: p.name,
          itemCount: p.items.length,
          optionCount: 1 + (p.otherOptions?.length ?? 0),
          guestCount: p.guests?.length ?? 0,
          total: projectFinance(p.items, p.pricing, p.payments, catalog).total,
        },
      ];
    });
  });

  app.post<{ Params: { id: string; vid: string } }>(
    '/api/projects/:id/versions/:vid/restore',
    async (req, reply) => {
      const body = z.object({ version: z.number().int() }).safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
      const current = loadProject(req.params.id);
      if (!current) return reply.code(404).send({ error: 'not_found' });
      if (current.version !== body.data.version)
        return reply
          .code(409)
          .send({ error: 'conflict', updatedBy: current.updatedBy, version: current.version });
      const row = db
        .prepare('SELECT data FROM project_versions WHERE id = ? AND project_id = ?')
        .get(req.params.vid, req.params.id) as { data: string } | undefined;
      if (!row) return reply.code(404).send({ error: 'not_found' });
      const old = Project.safeParse(JSON.parse(row.data));
      if (!old.success) return reply.code(422).send({ error: 'unreadable_snapshot' });
      const who = req.user!.displayName;
      const restored = db.transaction(() => {
        // The state being replaced stays in the history, so a restore can itself be undone.
        snapshotBeforeSave(db, current, who, new Date(), true);
        // Money and progress are records, not design: keep today's payments and status.
        return writeProject(
          current,
          { ...old.data, payments: current.payments, status: current.status },
          who,
        );
      })();
      return restored ?? reply.code(409).send({ error: 'conflict' });
    },
  );
}
