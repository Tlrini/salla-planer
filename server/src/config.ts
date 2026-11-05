import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** Repository root (server/src or server/dist -> ../..). */
export const REPO_ROOT = path.resolve(here, '..', '..');

export interface AppConfig {
  /** SQLite file path, or ':memory:' for tests. */
  dbPath: string;
  /** Folder for uploads/ and backups/. */
  dataDir: string;
  /** Built frontend to serve in production (null = don't serve). */
  webDist: string | null;
  /** Mark the session cookie Secure (only behind HTTPS). */
  secureCookies: boolean;
  production: boolean;
  logger: boolean;
  adminUser?: string;
  adminPassword?: string;
}

/** Production = NODE_ENV=production (Docker) or `--production` (npm start on an office PC). */
export function isProduction(env = process.env, argv = process.argv): boolean {
  return env.NODE_ENV === 'production' || argv.includes('--production');
}

export function configFromEnv(env = process.env): AppConfig {
  const production = isProduction(env);
  const dataDir = path.resolve(env.DATA_DIR ?? path.join(REPO_ROOT, 'data'));
  return {
    dbPath: path.join(dataDir, 'app.db'),
    dataDir,
    webDist: production ? path.resolve(env.WEB_DIST ?? path.join(REPO_ROOT, 'web', 'dist')) : null,
    secureCookies: env.COOKIE_SECURE === 'true',
    production,
    logger: env.NODE_ENV !== 'test',
    adminUser: env.ADMIN_USER,
    adminPassword: env.ADMIN_PASSWORD,
  };
}
