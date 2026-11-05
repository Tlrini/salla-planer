import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { DEFAULT_CATALOG, EXAMPLE_HALLS } from '@salla/shared';
import type { DB } from './db.js';

export const BCRYPT_ROUNDS = 11;

export interface SeedOptions {
  adminUser?: string;
  adminPassword?: string;
  production: boolean;
  log: (msg: string) => void;
}

/** First start: default catalog, example halls and the first admin. Idempotent. */
export function seed(db: DB, opts: SeedOptions): void {
  const now = new Date().toISOString();

  const catalogCount = (db.prepare('SELECT COUNT(*) AS n FROM catalog').get() as { n: number }).n;
  if (catalogCount === 0) {
    const insert = db.prepare('INSERT INTO catalog (id, sort, data) VALUES (?, ?, ?)');
    db.transaction(() =>
      DEFAULT_CATALOG.forEach((c, i) => insert.run(c.id, i, JSON.stringify(c))),
    )();
  } else {
    // Add catalog types introduced by newer versions without touching admin edits.
    const existing = new Set(
      db
        .prepare('SELECT id FROM catalog')
        .all()
        .map((r) => (r as { id: string }).id),
    );
    const insert = db.prepare('INSERT INTO catalog (id, sort, data) VALUES (?, ?, ?)');
    DEFAULT_CATALOG.forEach((c, i) => {
      if (!existing.has(c.id)) insert.run(c.id, i, JSON.stringify(c));
    });
  }

  const hallCount = (db.prepare('SELECT COUNT(*) AS n FROM halls').get() as { n: number }).n;
  if (hallCount === 0) {
    const insert = db.prepare(
      'INSERT INTO halls (id, example, hall, created_at, updated_at) VALUES (?, 1, ?, ?, ?)',
    );
    db.transaction(() =>
      EXAMPLE_HALLS.forEach((h) => insert.run(h.id, JSON.stringify(h.hall), now, now)),
    )();
  }

  const userCount = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  if (userCount === 0) {
    let username = opts.adminUser;
    let password = opts.adminPassword;
    if (!username || !password) {
      if (opts.production) {
        throw new Error('No users yet: set ADMIN_USER and ADMIN_PASSWORD for the first start.');
      }
      username = 'admin';
      password = 'admin123';
      opts.log(
        'No ADMIN_USER/ADMIN_PASSWORD set: created development admin "admin" / "admin123". Change it in Administrimi.',
      );
    }
    db.prepare(
      'INSERT INTO users (id, username, display_name, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
    ).run(
      nanoid(),
      username,
      'Administrator',
      bcrypt.hashSync(password, BCRYPT_ROUNDS),
      'admin',
      now,
    );
  }
}
