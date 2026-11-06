import type { FastifyInstance } from 'fastify';
import { AgencySettings } from '@salla/shared';
import { requireAdmin } from '../auth.js';
import type { DB } from '../db.js';

const AGENCY_KEY = 'agency';
const EMPTY: AgencySettings = { name: '' };

export function readAgency(db: DB): AgencySettings {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(AGENCY_KEY) as
    { value: string } | undefined;
  if (!row) return EMPTY;
  try {
    const parsed = AgencySettings.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** Agency details (contracts, PDF headers): everyone reads, admins edit. */
export function registerSettingsRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/settings/agency', async () => readAgency(db));

  app.put('/api/settings/agency', { preHandler: requireAdmin }, async (req, reply) => {
    const body = AgencySettings.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'invalid_body', issues: body.error.issues });
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run(AGENCY_KEY, JSON.stringify(body.data));
    return body.data;
  });
}
