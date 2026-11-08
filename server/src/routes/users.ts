import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { UserCreate, UserUpdate, type User } from '@salla/shared';
import { requireAdmin, SESSION_COOKIE } from '../auth.js';
import type { DB } from '../db.js';
import { BCRYPT_ROUNDS } from '../seed.js';

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  role: User['role'];
  active: number;
  created_at: string;
}

const toUser = (r: UserRow): User => ({
  id: r.id,
  username: r.username,
  displayName: r.display_name,
  role: r.role,
  active: r.active === 1,
  createdAt: r.created_at,
});

const COLUMNS = 'id, username, display_name, role, active, created_at';

export function registerUserRoutes(app: FastifyInstance, db: DB): void {
  const adminOnly = { preHandler: requireAdmin };
  const activeAdmins = () =>
    (
      db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").get() as {
        n: number;
      }
    ).n;

  app.get('/api/users', adminOnly, async () => {
    const rows = db
      .prepare(`SELECT ${COLUMNS} FROM users ORDER BY display_name`)
      .all() as UserRow[];
    return rows.map(toUser);
  });

  app.post('/api/users', adminOnly, async (req, reply) => {
    const body = UserCreate.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'invalid_body', issues: body.error.issues });
    const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(body.data.username);
    if (exists) return reply.code(409).send({ error: 'username_taken' });
    const id = nanoid();
    const hash = await bcrypt.hash(body.data.password, BCRYPT_ROUNDS);
    try {
      db.prepare(
        'INSERT INTO users (id, username, display_name, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
      ).run(
        id,
        body.data.username,
        body.data.displayName,
        hash,
        body.data.role,
        new Date().toISOString(),
      );
    } catch (err) {
      // Two admins created the same username at the same moment (hashing takes ~100 ms).
      if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE')
        return reply.code(409).send({ error: 'username_taken' });
      throw err;
    }
    return reply
      .code(201)
      .send(toUser(db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(id) as UserRow));
  });

  app.put<{ Params: { id: string } }>('/api/users/:id', adminOnly, async (req, reply) => {
    const body = UserUpdate.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'invalid_body', issues: body.error.issues });
    const row = db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(req.params.id) as
      UserRow | undefined;
    if (!row) return reply.code(404).send({ error: 'not_found' });
    const u = body.data;
    const losesAdmin =
      row.role === 'admin' && row.active === 1 && (u.role === 'agent' || u.active === false);
    if (losesAdmin && activeAdmins() <= 1) return reply.code(409).send({ error: 'last_admin' });
    db.prepare('UPDATE users SET display_name = ?, role = ?, active = ? WHERE id = ?').run(
      u.displayName ?? row.display_name,
      u.role ?? row.role,
      u.active === undefined ? row.active : u.active ? 1 : 0,
      row.id,
    );
    if (u.password) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
        await bcrypt.hash(u.password, BCRYPT_ROUNDS),
        row.id,
      );
    }
    // A new password or a deactivation signs the user out everywhere, except the session that
    // made the change (an admin changing their own password stays logged in on this device).
    if (u.active === false || u.password)
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(
        row.id,
        req.cookies[SESSION_COOKIE] ?? '',
      );
    return toUser(db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(row.id) as UserRow);
  });

  app.delete<{ Params: { id: string } }>('/api/users/:id', adminOnly, async (req, reply) => {
    if (req.params.id === req.user!.id)
      return reply.code(409).send({ error: 'cannot_delete_self' });
    const row = db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(req.params.id) as
      UserRow | undefined;
    if (!row) return reply.code(404).send({ error: 'not_found' });
    if (row.role === 'admin' && row.active === 1 && activeAdmins() <= 1)
      return reply.code(409).send({ error: 'last_admin' });
    db.prepare('DELETE FROM users WHERE id = ?').run(row.id);
    return { ok: true };
  });
}
