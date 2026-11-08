import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { MAX_MODEL_BYTES, ModelFromLibrary, type CatalogItem } from '@salla/shared';
import { requireAdmin } from '../auth.js';
import type { DB } from '../db.js';
import { simplifyGlb, trianglesFor } from '../modelOptimize.js';
import { getCatalogItem, saveCatalogItem } from './catalog.js';

export const MODELS_URL = '/uploads/models/';

/** A binary glTF file starts with the ASCII magic "glTF". */
export function isGlb(buf: Buffer): boolean {
  return buf.length >= 12 && buf.toString('ascii', 0, 4) === 'glTF';
}

/** Delete a file we stored under data/uploads/<folder>/ given its public URL. Ignores anything else. */
export function removeUploadFile(dataDir: string, url: string | undefined): void {
  const m = url ? /^\/uploads\/(models|thumbs|images|scans)\/([\w.-]+)$/.exec(url) : null;
  if (!m) return;
  fs.rmSync(path.join(dataDir, 'uploads', m[1]!, path.basename(m[2]!)), { force: true });
}

const removeModelFile = removeUploadFile;

/** A built-in item without the upright rotation / scaling of a previously assigned scan. */
function withoutScanSetup(item: CatalogItem): CatalogItem {
  const { modelRotation: _rotation, scaleMode: _scale, ...rest } = item;
  return rest;
}

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
      // A new raw upload: the setup of a previously assigned scan no longer applies.
      const updated = { ...withoutScanSetup(item), modelFile: `${MODELS_URL}${name}` };
      saveCatalogItem(db, updated);
      return updated;
    },
  );

  // A scanned chair or table becomes the 3D model of a built-in item, for every project.
  app.post<{ Params: { id: string } }>(
    '/api/catalog/:id/model-from-library',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const item = getCatalogItem(db, req.params.id);
      if (!item) return reply.code(404).send({ error: 'not_found' });
      if (item.source === 'library' || item.category !== 'tables')
        return reply.code(400).send({ error: 'not_allowed' });
      const body = ModelFromLibrary.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
      const scan = getCatalogItem(db, body.data.libraryId);
      const file = /^\/uploads\/models\/([\w.-]+)$/.exec(scan?.modelFile ?? '')?.[1];
      if (!scan || scan.source !== 'library' || !file)
        return reply.code(404).send({ error: 'scan_not_found' });

      fs.mkdirSync(dir, { recursive: true });
      const name = `${item.id}-${nanoid(8)}.glb`;
      const target = path.join(dir, name);
      try {
        // Its own lighter copy: 200 chairs can't each carry a full scan, and the library item
        // stays independent (deleting it never touches this model).
        await simplifyGlb(path.join(dir, path.basename(file)), target, trianglesFor(item.id));
      } catch (err) {
        fs.rmSync(target, { force: true });
        req.log.warn({ err }, 'simplifying the scan failed');
        return reply.code(422).send({ error: 'cannot_optimize' });
      }
      removeModelFile(dataDir, item.modelFile);
      const updated: CatalogItem = {
        ...withoutScanSetup(item),
        modelFile: `${MODELS_URL}${name}`,
        ...(scan.modelRotation ? { modelRotation: scan.modelRotation } : {}),
        // A chair keeps the scan's real proportions; a table must fill its exact footprint.
        scaleMode: item.id === 'chair' ? 'uniform' : 'stretch',
      };
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
      const { modelFile: _removed, ...rest } = withoutScanSetup(item);
      saveCatalogItem(db, rest);
      return rest;
    },
  );
}
