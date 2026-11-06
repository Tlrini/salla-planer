import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  addUsage,
  catalogById,
  Item,
  shortages,
  usageOf,
  type CatalogItem,
  type Shortage,
} from '@salla/shared';
import type { DB } from '../db.js';
import { readCatalog } from './catalog.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ItemList = z.array(Item);

interface EventRow {
  id: string;
  name: string;
  client_name: string;
  status: 'draft' | 'konfirmuar' | 'instaluar';
  event_type: string;
  event_date: string;
  items: string;
}

/** Statuses that hold inventory; drafts are only tentative. */
const BOOKED = new Set(['konfirmuar', 'instaluar']);

function rowsBetween(db: DB, from: string, to: string): EventRow[] {
  return db
    .prepare(
      `SELECT id, name, client_name, status, event_type, event_date, items FROM projects
       WHERE event_date >= ? AND event_date <= ? ORDER BY event_date, name`,
    )
    .all(from, to) as EventRow[];
}

function usage(row: EventRow, catalog: readonly CatalogItem[]) {
  try {
    return usageOf(ItemList.parse(JSON.parse(row.items)), catalog);
  } catch {
    return new Map<string, number>();
  }
}

/**
 * Inventory planning across events: availability for one date (editor warnings) and a calendar
 * of events with the dates where booked events need more than the agency owns.
 */
export function registerPlanningRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/availability', async (req, reply) => {
    const q = z
      .object({ date: isoDate, exclude: z.string().max(64).optional() })
      .safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'invalid_query' });
    const catalog = readCatalog(db);
    const rows = rowsBetween(db, q.data.date, q.data.date).filter((r) => r.id !== q.data.exclude);
    const booked = rows.filter((r) => BOOKED.has(r.status));
    const tentative = rows.filter((r) => !BOOKED.has(r.status));
    return {
      date: q.data.date,
      taken: Object.fromEntries(addUsage(...booked.map((r) => usage(r, catalog)))),
      tentative: Object.fromEntries(addUsage(...tentative.map((r) => usage(r, catalog)))),
      events: rows.map((r) => ({ id: r.id, name: r.name, status: r.status })),
    };
  });

  app.get('/api/calendar', async (req, reply) => {
    const q = z.object({ from: isoDate, to: isoDate }).safeParse(req.query);
    if (!q.success || q.data.to < q.data.from)
      return reply.code(400).send({ error: 'invalid_query' });
    const catalog = readCatalog(db);
    const byId = catalogById(catalog);
    const rows = rowsBetween(db, q.data.from, q.data.to);
    const days = new Map<string, EventRow[]>();
    for (const r of rows) days.set(r.event_date, [...(days.get(r.event_date) ?? []), r]);
    const conflicts: Array<{ date: string; shortages: Shortage[] }> = [];
    for (const [date, list] of days) {
      const booked = list.filter((r) => BOOKED.has(r.status));
      if (booked.length === 0) continue;
      const s = shortages(addUsage(...booked.map((r) => usage(r, catalog))), new Map(), byId);
      if (s.length) conflicts.push({ date, shortages: s });
    }
    return {
      events: rows.map((r) => ({
        id: r.id,
        name: r.name,
        clientName: r.client_name,
        status: r.status,
        eventType: r.event_type,
        eventDate: r.event_date,
      })),
      conflicts,
    };
  });
}
