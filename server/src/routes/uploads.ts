import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { MAX_MODEL_BYTES } from '@salla/shared';
import { requireAdmin } from '../auth.js';
import type { DB } from '../db.js';
import { getCatalogItem, saveCatalogItem } from './catalog.js';

export const MODELS_URL = '/uploads/models/';

/** A binary glTF file starts with the ASCII magic "glTF". */
export function isGlb(buf: Buffer): boolean {
  return buf.length >= 12 && buf.toString('ascii', 0, 4) === 'glTF';
}

/** Delete a file we stored under data/uploads/<folder>/ given its public URL. Ignores anything else. */
export function removeUploadFile(dataDir: string, url: string | undefined): void {
  const m = url ? /^\/uploads\/(models|thumbs|images)\/([\w.-]+)$/.exec(url) : null;
  if (!m) return;
  fs.rmSync(path.join(dataDir, 'uploads', m[1]!, path.basename(m[2]!)), { force: true });
}

const removeModelFile = removeUploadFile;

export function registerUploadRoutes(app: FastifyInstance, db: DB, dataDir: string): void {
  const dir = path.join(dataDir, 'uploads', 'models');

  app.post<{ Params: { id: string } }>(
    '/api/catalog/:id/model',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const item = getCatalogItem(db, req.params.id);
      if (!item) return reply.code(404).send({ error: 'not_found' });
      const file = await req.file({ limits: { fileSize: MAX_MODEL_BYTES, files: 1 } });
      if (!file) return reply.code(400).send({ error: 'no_file' });
      let buf: Buffer;
      try {
        buf = await file.toBuffer();
      } catch {
        return reply.code(413).send({ error: 'too_large' });
      }
      if (file.file.truncated) return reply.code(413).send({ error: 'too_large' });
      if (!isGlb(buf)) return reply.code(400).send({ error: 'not_glb' });

      fs.mkdirSync(dir, { recursive: true });
      const name = `${item.id}-${nanoid(8)}.glb`;
      fs.writeFileSync(path.join(dir, name), buf);
      removeModelFile(dataDir, item.modelFile);
      const updated = { ...item, modelFile: `${MODELS_URL}${name}` };
      saveCatalogItem(db, updated);
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/catalog/:id/model',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const item = getCatalogItem(db, req.params.id);
      if (!item) return reply.code(404).send({ error: 'not_found' });
      removeModelFile(dataDir, item.modelFile);
      const { modelFile: _removed, ...rest } = item;
      saveCatalogItem(db, rest);
      return rest;
    },
  );
}
