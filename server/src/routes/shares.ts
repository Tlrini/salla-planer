import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import {
  catalogById,
  projectTotal,
  type CatalogItem,
  type ClientNotice,
  type Project,
} from '@salla/shared';
import { PUBLIC_SHARE_PREFIX } from '../constants.js';
import type { DB } from '../db.js';
import { readCatalog } from './catalog.js';
import { readAgency } from './settings.js';

export const SHARE_DAYS = 30;
const PUBLIC_POSTS_PER_MINUTE = 20;

interface ShareRow {
  token: string;
  project_id: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  revoked: number;
  approved_option_id: string | null;
  approved_option_name: string | null;
  approved_by: string | null;
  approved_at: string | null;
  seen_at: string | null;
}

interface CommentRow {
  id: string;
  author: string;
  text: string;
  from_client: number;
  created_at: string;
}

const CommentBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  text: z.string().trim().min(1).max(2000),
});

/**
 * Client share links: a private, expiring, revocable link to a read-only view of the project
 * (plan, 3D walk, design options with totals). The client can approve an option and comment.
 * Guests, costs and internal notes are never included.
 */
export function registerShareRoutes(
  app: FastifyInstance,
  db: DB,
  dataDir: string,
  loadProject: (id: string) => Project | null,
): void {
  const getShare = (token: string) =>
    db.prepare('SELECT * FROM shares WHERE token = ?').get(token) as ShareRow | undefined;
  const comments = (token: string) =>
    (
      db
        .prepare(
          'SELECT id, author, text, from_client, created_at FROM share_comments WHERE token = ? ORDER BY created_at',
        )
        .all(token) as CommentRow[]
    ).map((c) => ({
      id: c.id,
      author: c.author,
      text: c.text,
      fromClient: c.from_client === 1,
      createdAt: c.created_at,
    }));
  const shareInfo = (s: ShareRow) => ({
    token: s.token,
    createdBy: s.created_by,
    createdAt: s.created_at,
    expiresAt: s.expires_at,
    revoked: s.revoked === 1,
    ...(s.approved_at
      ? {
          approval: {
            optionId: s.approved_option_id,
            optionName: s.approved_option_name,
            by: s.approved_by,
            at: s.approved_at,
          },
        }
      : {}),
    comments: comments(s.token),
  });
  /** A link the client may use right now, with its project. */
  const live = (token: string) => {
    const s = getShare(token);
    if (!s || s.revoked || Date.parse(s.expires_at) < Date.now()) return null;
    const project = loadProject(s.project_id);
    return project ? { share: s, project } : null;
  };

  // ---- agent side (session required) ---------------------------------------------------------
  app.get<{ Params: { id: string } }>('/api/projects/:id/shares', async (req, reply) => {
    if (!loadProject(req.params.id)) return reply.code(404).send({ error: 'not_found' });
    const rows = db
      .prepare('SELECT * FROM shares WHERE project_id = ? ORDER BY created_at DESC')
      .all(req.params.id) as ShareRow[];
    // Opening the share dialog marks client activity as seen.
    db.prepare('UPDATE shares SET seen_at = ? WHERE project_id = ?').run(
      new Date().toISOString(),
      req.params.id,
    );
    return rows.map(shareInfo);
  });

  app.post<{ Params: { id: string } }>('/api/projects/:id/shares', async (req, reply) => {
    if (!loadProject(req.params.id)) return reply.code(404).send({ error: 'not_found' });
    const body = z
      .object({ days: z.number().int().min(1).max(365).optional() })
      .optional()
      .safeParse(req.body ?? undefined);
    const days = (body.success && body.data?.days) || SHARE_DAYS;
    const now = new Date();
    const token = nanoid(24);
    db.prepare(
      'INSERT INTO shares (token, project_id, created_by, created_at, expires_at, seen_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      token,
      req.params.id,
      req.user!.displayName,
      now.toISOString(),
      new Date(now.getTime() + days * 86_400_000).toISOString(),
      now.toISOString(),
    );
    return reply.code(201).send(shareInfo(getShare(token)!));
  });

  app.delete<{ Params: { token: string } }>('/api/shares/:token', async (req, reply) => {
    const r = db.prepare('UPDATE shares SET revoked = 1 WHERE token = ?').run(req.params.token);
    if (r.changes === 0) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });

  app.post<{ Params: { token: string } }>('/api/shares/:token/comments', async (req, reply) => {
    if (!getShare(req.params.token)) return reply.code(404).send({ error: 'not_found' });
    const body = CommentBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    db.prepare(
      'INSERT INTO share_comments (id, token, author, text, from_client, created_at) VALUES (?, ?, ?, ?, 0, ?)',
    ).run(
      nanoid(10),
      req.params.token,
      req.user!.displayName,
      body.data.text,
      new Date().toISOString(),
    );
    return comments(req.params.token);
  });

  // ---- the agents' bell: client activity nobody has looked at yet ------------------------------
  // "Seen" is per share link (shares.seen_at): opening the project's share dialog or clicking
  // the notice marks it seen for everyone in the agency.

  app.get('/api/notifications', async (): Promise<ClientNotice[]> => {
    const approvals = db
      .prepare(
        `SELECT s.project_id AS pid, p.name AS pname, s.approved_by AS who,
                s.approved_option_name AS text, s.approved_at AS at
         FROM shares s JOIN projects p ON p.id = s.project_id
         WHERE p.deleted_at IS NULL AND s.approved_at IS NOT NULL
           AND (s.seen_at IS NULL OR s.approved_at > s.seen_at)`,
      )
      .all() as NoticeRow[];
    const fresh = db
      .prepare(
        `SELECT s.project_id AS pid, p.name AS pname, c.author AS who, c.text AS text,
                c.created_at AS at
         FROM share_comments c
         JOIN shares s ON s.token = c.token
         JOIN projects p ON p.id = s.project_id
         WHERE p.deleted_at IS NULL AND c.from_client = 1
           AND (s.seen_at IS NULL OR c.created_at > s.seen_at)`,
      )
      .all() as NoticeRow[];
    const notice =
      (kind: ClientNotice['kind']) =>
      (r: NoticeRow): ClientNotice => ({
        projectId: r.pid,
        projectName: r.pname,
        kind,
        by: r.who ?? '',
        text: kind === 'comment' ? shorten(r.text ?? '', 80) : (r.text ?? ''),
        at: r.at,
      });
    return [...approvals.map(notice('approved')), ...fresh.map(notice('comment'))]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 50);
  });

  app.post('/api/notifications/seen', async (req, reply) => {
    const body = z
      .object({ projectId: z.string().min(1).max(64).optional() })
      .optional()
      .safeParse(req.body ?? undefined);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    const now = new Date().toISOString();
    const projectId = body.data?.projectId;
    if (projectId)
      db.prepare('UPDATE shares SET seen_at = ? WHERE project_id = ?').run(now, projectId);
    else db.prepare('UPDATE shares SET seen_at = ?').run(now);
    return { ok: true };
  });

  // ---- client side (no account) ----------------------------------------------------------------
  const posts = new Map<string, { count: number; reset: number }>();
  const tooMany = (token: string) => {
    const now = Date.now();
    const p = posts.get(token);
    if (!p || p.reset < now) {
      posts.set(token, { count: 1, reset: now + 60_000 });
      return false;
    }
    p.count++;
    return p.count > PUBLIC_POSTS_PER_MINUTE;
  };

  app.get<{ Params: { token: string } }>(`${PUBLIC_SHARE_PREFIX}:token`, async (req, reply) => {
    const l = live(req.params.token);
    if (!l) return reply.code(404).send({ error: 'not_found' });
    const { project, share } = l;
    const catalog = readCatalog(db);
    const used = usedCatalog(project, catalog);
    const fileUrl = (url: string | undefined) => {
      const m = url ? /^\/uploads\/(models|thumbs)\/([\w.-]+)$/.exec(url) : null;
      return m ? `${PUBLIC_SHARE_PREFIX}${share.token}/file/${m[1]}/${m[2]}` : undefined;
    };
    const options = [
      { id: project.option?.id ?? 'A', name: project.option?.name ?? '', items: project.items },
      ...(project.otherOptions ?? []),
    ];
    return {
      agency: readAgency(db).name,
      project: {
        id: project.id,
        name: project.name,
        clientName: project.clientName,
        eventType: project.eventType,
        eventDate: project.eventDate,
        status: project.status,
        hall: {
          ...project.hall,
          underlay: undefined,
          // The client has no login: the scanned room comes through this link too.
          ...(project.hall.shell
            ? {
                shell: {
                  ...project.hall.shell,
                  url: fileUrl(project.hall.shell.url) ?? project.hall.shell.url,
                },
              }
            : {}),
        },
        items: project.items,
        option: project.option,
        otherOptions: project.otherOptions,
        finalOptionId: project.finalOptionId,
        viewpoints: project.viewpoints,
        // Needed for the totals shown per option; costs, guests and notes stay private.
        pricing: project.pricing
          ? { discountPercent: project.pricing.discountPercent, extras: project.pricing.extras }
          : undefined,
        createdBy: project.createdBy,
        updatedBy: project.updatedBy,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        version: project.version,
      },
      totals: Object.fromEntries(
        options.map((o) => [o.id, projectTotal(o.items, project.pricing, catalog)]),
      ),
      catalog: used.map((c) => {
        const { modelFile, thumbnail, topView, stock: _stock, createdById: _id, ...rest } = c;
        return {
          ...rest,
          ...(fileUrl(modelFile) ? { modelFile: fileUrl(modelFile) } : {}),
          ...(fileUrl(thumbnail) ? { thumbnail: fileUrl(thumbnail) } : {}),
          ...(fileUrl(topView) ? { topView: fileUrl(topView) } : {}),
        };
      }),
      share: {
        expiresAt: share.expires_at,
        ...(share.approved_at
          ? {
              approval: {
                optionId: share.approved_option_id,
                optionName: share.approved_option_name,
                by: share.approved_by,
                at: share.approved_at,
              },
            }
          : {}),
      },
      comments: comments(share.token),
    };
  });

  app.get<{ Params: { token: string; folder: string; name: string } }>(
    `${PUBLIC_SHARE_PREFIX}:token/file/:folder/:name`,
    async (req, reply) => {
      const l = live(req.params.token);
      if (!l) return reply.code(404).send({ error: 'not_found' });
      const url = `/uploads/${req.params.folder}/${req.params.name}`;
      // Only files of decor that this project actually uses.
      const allowed =
        l.project.hall.shell?.url === url ||
        usedCatalog(l.project, readCatalog(db)).some((c) =>
          [c.modelFile, c.thumbnail, c.topView].includes(url),
        );
      if (!allowed || !/^(models|thumbs)$/.test(req.params.folder)) return notFound(reply);
      const file = path.join(dataDir, 'uploads', req.params.folder, path.basename(req.params.name));
      if (!fs.existsSync(file)) return notFound(reply);
      reply.header('cache-control', 'private, max-age=3600');
      reply.type(req.params.name.endsWith('.glb') ? 'model/gltf-binary' : 'image/png');
      return reply.send(fs.createReadStream(file));
    },
  );

  app.post<{ Params: { token: string } }>(
    `${PUBLIC_SHARE_PREFIX}:token/approve`,
    async (req, reply) => {
      const l = live(req.params.token);
      if (!l) return reply.code(404).send({ error: 'not_found' });
      if (tooMany(req.params.token)) return reply.code(429).send({ error: 'too_many' });
      const body = z
        .object({ optionId: z.string().min(1).max(32), name: z.string().trim().min(1).max(80) })
        .safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
      const p = l.project;
      const option =
        (p.option?.id ?? 'A') === body.data.optionId
          ? (p.option ?? { id: 'A', name: '' })
          : p.otherOptions?.find((o) => o.id === body.data.optionId);
      if (!option) return reply.code(400).send({ error: 'unknown_option' });
      const at = new Date().toISOString();
      db.prepare(
        'UPDATE shares SET approved_option_id = ?, approved_option_name = ?, approved_by = ?, approved_at = ? WHERE token = ?',
      ).run(option.id, option.name, body.data.name, at, req.params.token);
      return { optionId: option.id, optionName: option.name, by: body.data.name, at };
    },
  );

  app.post<{ Params: { token: string } }>(
    `${PUBLIC_SHARE_PREFIX}:token/comments`,
    async (req, reply) => {
      const l = live(req.params.token);
      if (!l) return reply.code(404).send({ error: 'not_found' });
      if (tooMany(req.params.token)) return reply.code(429).send({ error: 'too_many' });
      const body = CommentBody.safeParse(req.body);
      if (!body.success || !body.data.name) return reply.code(400).send({ error: 'invalid_body' });
      db.prepare(
        'INSERT INTO share_comments (id, token, author, text, from_client, created_at) VALUES (?, ?, ?, ?, 1, ?)',
      ).run(nanoid(10), req.params.token, body.data.name, body.data.text, new Date().toISOString());
      return comments(req.params.token);
    },
  );
}

interface NoticeRow {
  pid: string;
  pname: string;
  who: string | null;
  text: string | null;
  at: string;
}

const shorten = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

function notFound(reply: FastifyReply) {
  return reply.code(404).send({ error: 'not_found' });
}

/** Catalog items a project uses in any option (item types and table decor). */
export function usedCatalog(project: Project, catalog: readonly CatalogItem[]): CatalogItem[] {
  const byId = catalogById(catalog);
  const ids = new Set<string>();
  for (const items of [project.items, ...(project.otherOptions ?? []).map((o) => o.items)])
    for (const i of items) {
      ids.add(i.type);
      if (i.tableDecor) ids.add(i.tableDecor);
    }
  for (const s of project.hall.structure) ids.add(s.type);
  // The procedural chairs around tables use the chair entry's colors.
  ids.add('chair');
  return [...ids].flatMap((id) => {
    const c = byId.get(id);
    return c ? [c] : [];
  });
}

/** Client activity per project for the project list ("Klienti aprovoi", new comments). */
export function shareActivity(db: DB): Map<string, { approved?: string; newComments: number }> {
  const rows = db
    .prepare(
      `SELECT s.project_id AS pid, s.approved_option_name AS approved, s.approved_at AS approvedAt,
              s.seen_at AS seenAt,
              (SELECT COUNT(*) FROM share_comments c WHERE c.token = s.token AND c.from_client = 1
                 AND (s.seen_at IS NULL OR c.created_at > s.seen_at)) AS fresh
       FROM shares s`,
    )
    .all() as Array<{
    pid: string;
    approved: string | null;
    approvedAt: string | null;
    seenAt: string | null;
    fresh: number;
  }>;
  const out = new Map<string, { approved?: string; newComments: number }>();
  for (const r of rows) {
    const cur = out.get(r.pid) ?? { newComments: 0 };
    if (r.approvedAt && r.approved !== null) cur.approved = r.approved || '—';
    cur.newComments += r.fresh;
    out.set(r.pid, cur);
  }
  return out;
}
