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
  /**
   * Proxy IPs/CIDRs (comma-separated) allowed to set X-Forwarded-For, the client IP used for the
   * login limit. false = no proxy (direct access, the default). Behind Caddy in docker-compose
   * this is Caddy's fixed container IP.
   */
  trustProxy?: false | string;
  adminUser?: string;
  adminPassword?: string;
  /**
   * Shared secret of the GPU scan worker (Beta 5). Unset or shorter than
   * MIN_WORKER_TOKEN_LENGTH = in-page scanning is off.
   */
  scanWorkerToken?: string;
}

export const MIN_WORKER_TOKEN_LENGTH = 32;

/**
 * TRUST_PROXY env: unset/"false" -> false, "172.28.0.10" or "10.0.0.0/8,127.0.0.1" -> that list.
 * "true" and hop counts are refused: "true" trusts any client-sent header (the login limit
 * becomes bypassable), and Fastify does not apply hop counts to X-Forwarded-For.
 */
export function parseTrustProxy(value: string | undefined): false | string {
  const v = value?.trim();
  if (!v || v === 'false') return false;
  if (v === 'true' || /^\d+$/.test(v))
    throw new Error(
      'TRUST_PROXY must list proxy IPs/CIDRs, e.g. 172.28.0.10 (not true or a hop count).',
    );
  return v;
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
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    adminUser: env.ADMIN_USER,
    adminPassword: env.ADMIN_PASSWORD,
    scanWorkerToken: env.SCAN_WORKER_TOKEN?.trim() || undefined,
  };
}
