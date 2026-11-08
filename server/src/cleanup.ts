import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db.js';

/** A photo is kept at least this long, so one that was just uploaded but not saved yet stays. */
export const IMAGE_MIN_AGE_MS = 24 * 60 * 60 * 1000;

const IMAGE_URL = /\/uploads\/images\/([\w.-]+)/g;

/** File names of /uploads/images/… mentioned anywhere in these JSON texts. Pure. */
export function referencedImages(texts: Iterable<string>): Set<string> {
  const names = new Set<string>();
  for (const text of texts) for (const m of text.matchAll(IMAGE_URL)) names.add(m[1]!);
  return names;
}

/** Image files that no project, hall template or saved version uses and that are old enough. Pure. */
export function unusedImages(
  files: ReadonlyArray<{ name: string; mtimeMs: number }>,
  referenced: ReadonlySet<string>,
  now: number,
  minAgeMs = IMAGE_MIN_AGE_MS,
): string[] {
  return files
    .filter((f) => !referenced.has(f.name) && now - f.mtimeMs >= minAgeMs)
    .map((f) => f.name);
}

/**
 * Delete floor-plan photos (Hall.underlay, data/uploads/images) that are no longer used: the
 * agent replaced or removed the photo, or deleted the project. Version history counts as use,
 * so restoring an old version still finds its photo. Returns the deleted names.
 */
export function cleanupImages(db: DB, dataDir: string, now = Date.now()): string[] {
  const dir = path.join(dataDir, 'uploads', 'images');
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const files = names.flatMap((name) => {
    try {
      const st = fs.statSync(path.join(dir, name));
      return st.isFile() ? [{ name, mtimeMs: st.mtimeMs }] : [];
    } catch {
      return [];
    }
  });
  if (!files.length) return [];

  const texts = function* () {
    for (const r of db.prepare('SELECT hall, extra FROM projects').iterate() as Iterable<{
      hall: string;
      extra: string;
    }>) {
      yield r.hall;
      yield r.extra;
    }
    for (const r of db.prepare('SELECT hall FROM halls').iterate() as Iterable<{ hall: string }>)
      yield r.hall;
    for (const r of db.prepare('SELECT data FROM project_versions').iterate() as Iterable<{
      data: string;
    }>)
      yield r.data;
  };
  const unused = unusedImages(files, referencedImages(texts()), now);
  for (const name of unused) fs.rmSync(path.join(dir, name), { force: true });
  return unused;
}
