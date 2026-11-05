import type { FastifyInstance } from 'fastify';
import { CatalogItem, CatalogUpdate } from '@salla/shared';
import { requireAdmin } from '../auth.js';
import type { DB } from '../db.js';

export function readCatalog(db: DB): CatalogItem[] {
  const rows = db.prepare('SELECT data FROM catalog ORDER BY sort, id').all() as Array<{
    data: string;
  }>;
  return rows.map((r) => CatalogItem.parse(JSON.parse(r.data)));
}

export function getCatalogItem(db: DB, id: string): CatalogItem | null {
  const row = db.prepare('SELECT data FROM catalog WHERE id = ?').get(id) as
    { data: string } | undefined;
  return row ? CatalogItem.parse(JSON.parse(row.data)) : null;
}

export function saveCatalogItem(db: DB, item: CatalogItem): void {
  db.prepare('UPDATE catalog SET data = ? WHERE id = ?').run(JSON.stringify(item), item.id);
}

export function registerCatalogRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/catalog', async () => readCatalog(db));

  app.put<{ Params: { id: string } }>(
    '/api/catalog/:id',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const current = getCatalogItem(db, req.params.id);
      if (!current) return reply.code(404).send({ error: 'not_found' });
      const patch = CatalogUpdate.safeParse(req.body);
      if (!patch.success)
        return reply.code(400).send({ error: 'invalid_body', issues: patch.error.issues });
      const merged = CatalogItem.safeParse({ ...current, ...patch.data, id: current.id });
      if (!merged.success)
        return reply.code(400).send({ error: 'invalid_body', issues: merged.error.issues });
      saveCatalogItem(db, merged.data);
      return merged.data;
    },
  );
}
