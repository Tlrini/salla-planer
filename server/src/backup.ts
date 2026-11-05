import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db.js';

export const KEEP_DAYS = 14;
const NAME = /^app-(\d{4})-(\d{2})-(\d{2})\.db$/;

export function backupName(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `app-${y}-${m}-${d}.db`;
}

/** Backup files older than `keepDays` days (by the date in their name). Pure. */
export function backupsToDelete(
  files: readonly string[],
  now: Date,
  keepDays = KEEP_DAYS,
): string[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return files.filter((f) => {
    const m = NAME.exec(f);
    if (!m) return false;
    const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
    return (today - day) / 86_400_000 >= keepDays;
  });
}

/** Copy the database to backups/app-YYYY-MM-DD.db once per day and prune old copies. */
export async function runDailyBackup(
  db: DB,
  dataDir: string,
  now = new Date(),
): Promise<string | null> {
  const dir = path.join(dataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, backupName(now));
  let created: string | null = null;
  if (!fs.existsSync(target)) {
    await db.backup(target);
    created = target;
  }
  for (const f of backupsToDelete(fs.readdirSync(dir), now))
    fs.rmSync(path.join(dir, f), { force: true });
  return created;
}
