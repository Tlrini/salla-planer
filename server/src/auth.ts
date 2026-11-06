import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { LoginBody, type SessionUser } from '@salla/shared';
import type { DB } from './db.js';
import { PUBLIC_SHARE_PREFIX } from './constants.js';
import { BCRYPT_ROUNDS } from './seed.js';

export const SESSION_COOKIE = 'salla_sid';
const SESSION_DAYS = 30;
const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_ATTEMPTS = 10;

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionUser;
  }
}

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: 'admin' | 'agent';
  active: number;
}

const toSessionUser = (r: UserRow): SessionUser => ({
  id: r.id,
  username: r.username,
  displayName: r.display_name,
  role: r.role,
});

/** Paths reachable without a session. */
const PUBLIC = new Set(['/api/auth/login', '/api/health']);
/** Everything under these prefixes needs a session (uploaded models are private agency data). */
const PROTECTED_PREFIXES = ['/api/', '/uploads/'];

export function registerAuth(app: FastifyInstance, db: DB, secureCookies: boolean): void {
  const attempts = new Map<string, { count: number; reset: number }>();
  // Compared against when the username does not exist, so a wrong username takes as long as a
  // wrong password and response times do not reveal which usernames exist.
  const dummyHash = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), BCRYPT_ROUNDS);
  const pruneAttempts = (now: number) => {
    for (const [ip, a] of attempts) if (a.reset <= now) attempts.delete(ip);
  };

  const userBySession = db.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ? AND u.active = 1`,
  );

  // Every /api route except the public ones needs a valid session.
  app.addHook('onRequest', async (req, reply) => {
    const url = req.url.split('?')[0]!;
    if (!PROTECTED_PREFIXES.some((p) => url.startsWith(p)) || PUBLIC.has(url)) return;
    // Client share links work without an account; each route checks its own token.
    if (url.startsWith(PUBLIC_SHARE_PREFIX)) return;
    const token = req.cookies[SESSION_COOKIE];
    const row = token ? (userBySession.get(token, Date.now()) as UserRow | undefined) : undefined;
    if (!row) return reply.code(401).send({ error: 'unauthorized' });
    req.user = toSessionUser(row);
  });

  app.post('/api/auth/login', async (req, reply) => {
    const ip = req.ip;
    const now = Date.now();
    pruneAttempts(now);
    const a = attempts.get(ip);
    if (a && a.reset > now && a.count >= LOGIN_MAX_ATTEMPTS)
      return reply.code(429).send({ error: 'too_many_attempts' });

    const body = LoginBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    const row = db
      .prepare('SELECT * FROM users WHERE username = ? AND active = 1')
      .get(body.data.username) as UserRow | undefined;
    const ok = await bcrypt.compare(body.data.password, row?.password_hash ?? dummyHash);
    if (!row || !ok) {
      const cur = a && a.reset > now ? a : { count: 0, reset: now + LOGIN_WINDOW_MS };
      cur.count++;
      attempts.set(ip, cur);
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    attempts.delete(ip);
    const token = crypto.randomBytes(32).toString('hex');
    const expires = now + SESSION_DAYS * 86_400_000;
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
      token,
      row.id,
      expires,
    );
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookies,
      expires: new Date(expires),
    });
    return toSessionUser(row);
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => req.user);
}

/** preHandler for admin-only routes. */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (req.user?.role !== 'admin') return reply.code(403).send({ error: 'forbidden' });
}
