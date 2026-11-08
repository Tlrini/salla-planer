import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import {
  CatalogItem,
  LibraryImages,
  LibraryUpdate,
  MAX_LIBRARY_MODEL_BYTES,
  MAX_THUMBNAIL_BYTES,
  type SessionUser,
} from '@salla/shared';
import type { DB } from '../db.js';
import { getCatalogItem, saveCatalogItem } from './catalog.js';
import { isGlb, MODELS_URL, removeUploadFile } from './uploads.js';
import { catalogItemFor } from '../visibility.js';

export const THUMBS_URL = '/uploads/thumbs/';
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DEFAULT_NAME = 'Dekor i ri';

/** "Peonia_bardhe-scan.glb" -> "Peonia bardhe scan" */
export function nameFromFile(filename: string | undefined): string {
  const base = (filename ?? '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  return base.slice(0, 120) || DEFAULT_NAME;
}

export function isPng(buf: Buffer): boolean {
  return buf.length > PNG_MAGIC.length && buf.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC);
}

function decodePng(dataUrl: string): Buffer | null {
  const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  return isPng(buf) && buf.length <= MAX_THUMBNAIL_BYTES ? buf : null;
}

/**
 * Store a .glb as a new draft library decor (the agent finishes it in the setup dialog). Used by
 * the upload from phone scan apps and by in-page scans (Beta 5). `buf` must be a checked GLB.
 */
export function createLibraryItem(
  db: DB,
  dataDir: string,
  buf: Buffer,
  name: string,
  user: SessionUser,
): CatalogItem {
  const modelsDir = path.join(dataDir, 'uploads', 'models');
  const id = `lib_${nanoid(10)}`;
  fs.mkdirSync(modelsDir, { recursive: true });
  const fileName = `${id}-${nanoid(8)}.glb`;
  fs.writeFileSync(path.join(modelsDir, fileName), buf);
  const item: CatalogItem = {
    id,
    name: name.trim().slice(0, 120) || DEFAULT_NAME,
    category: 'floral',
    // Placeholder size until the agent sets the real height in the setup dialog.
    width: 0.5,
    depth: 0.5,
    height: 0.5,
    shape2d: 'circle',
    resizable: 'none',
    defaultColor: '#FFFFFF',
    price: 0,
    modelFile: `${MODELS_URL}${fileName}`,
    active: true,
    source: 'library',
    createdBy: user.displayName,
    createdById: user.id,
    draft: true,
    tabletop: false,
    modelRotation: { x: 0, y: 0, z: 0 },
    scaleMode: 'uniform',
  };
  db.prepare(
    'INSERT INTO catalog (id, sort, data) VALUES (?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM catalog), ?)',
  ).run(id, JSON.stringify(item));
  return item;
}

/**
 * The agency-wide decor library (Beta 1): agents upload .glb files from phone scan apps; every
 * agent sees and may edit them. Library items are ordinary catalog items (source 'library'), so
 * the editor, 3D view, summary and PDF handle them without special cases.
 */
export function registerLibraryRoutes(app: FastifyInstance, db: DB, dataDir: string): void {
  const thumbsDir = path.join(dataDir, 'uploads', 'thumbs');
  const libraryItem = (id: string) => {
    const item = getCatalogItem(db, id);
    return item?.source === 'library' ? item : null;
  };

  app.post('/api/library', async (req, reply) => {
    const file = await req.file({ limits: { fileSize: MAX_LIBRARY_MODEL_BYTES, files: 1 } });
    if (!file) return reply.code(400).send({ error: 'no_file' });
    let buf: Buffer;
    try {
      buf = await file.toBuffer();
    } catch {
      return reply.code(413).send({ error: 'too_large' });
    }
    if (file.file.truncated) return reply.code(413).send({ error: 'too_large' });
    if (!isGlb(buf)) return reply.code(400).send({ error: 'not_glb' });
    const item = createLibraryItem(db, dataDir, buf, nameFromFile(file.filename), req.user!);
    return reply.code(201).send(item);
  });

  app.put<{ Params: { id: string } }>('/api/library/:id', async (req, reply) => {
    const current = libraryItem(req.params.id);
    if (!current) return reply.code(404).send({ error: 'not_found' });
    const patch = LibraryUpdate.safeParse(req.body);
    if (!patch.success)
      return reply.code(400).send({ error: 'invalid_body', issues: patch.error.issues });
    const next: Record<string, unknown> = { ...current, ...patch.data, id: current.id };
    if (next.stock === null) delete next.stock; // null = no longer tracked
    const merged = CatalogItem.safeParse(next);
    if (!merged.success)
      return reply.code(400).send({ error: 'invalid_body', issues: merged.error.issues });
    saveCatalogItem(db, merged.data);
    return catalogItemFor(merged.data, req.user);
  });

  app.post<{ Params: { id: string } }>('/api/library/:id/images', async (req, reply) => {
    const current = libraryItem(req.params.id);
    if (!current) return reply.code(404).send({ error: 'not_found' });
    const body = LibraryImages.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    const thumbnail = decodePng(body.data.thumbnail);
    const topView = decodePng(body.data.topView);
    if (!thumbnail || !topView) return reply.code(400).send({ error: 'not_png' });

    fs.mkdirSync(thumbsDir, { recursive: true });
    const stamp = nanoid(8);
    const thumbName = `${current.id}-${stamp}-thumb.png`;
    const topName = `${current.id}-${stamp}-top.png`;
    fs.writeFileSync(path.join(thumbsDir, thumbName), thumbnail);
    fs.writeFileSync(path.join(thumbsDir, topName), topView);
    removeUploadFile(dataDir, current.thumbnail);
    removeUploadFile(dataDir, current.topView);
    const updated: CatalogItem = {
      ...current,
      thumbnail: `${THUMBS_URL}${thumbName}`,
      topView: `${THUMBS_URL}${topName}`,
    };
    saveCatalogItem(db, updated);
    return catalogItemFor(updated, req.user);
  });

  app.delete<{ Params: { id: string } }>('/api/library/:id', async (req, reply) => {
    const current = libraryItem(req.params.id);
    if (!current) return reply.code(404).send({ error: 'not_found' });
    const user = req.user!;
    if (user.role !== 'admin' && current.createdById !== user.id)
      return reply.code(403).send({ error: 'forbidden' });

    // Ids are random, so any occurrence in a project's JSON is a real use (as an item type or as
    // a table decor). Saved versions count too, so restoring one never meets missing decor.
    // Used decor is archived so old projects keep rendering and pricing it. instr() is a plain
    // substring test (LIKE would treat the "_" in "lib_…" as a wildcard).
    const used = db
      .prepare(
        `SELECT 1 FROM projects WHERE instr(items, @q) > 0 OR instr(hall, @q) > 0 OR instr(extra, @q) > 0
         UNION ALL
         SELECT 1 FROM project_versions WHERE instr(data, @q) > 0
         LIMIT 1`,
      )
      .get({ q: `"${current.id}"` });
    if (used) {
      const archived = { ...current, active: false };
      saveCatalogItem(db, archived);
      return { archived: true, item: catalogItemFor(archived, user) };
    }
    db.prepare('DELETE FROM catalog WHERE id = ?').run(current.id);
    removeUploadFile(dataDir, current.modelFile);
    removeUploadFile(dataDir, current.thumbnail);
    removeUploadFile(dataDir, current.topView);
    return { deleted: true };
  });
}
