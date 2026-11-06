import { autoLabels, seatCount, type CatalogMap } from './geometry.js';
import type { Guest, Item } from './schemas.js';

/** A table guests can sit at. */
export interface SeatTable {
  id: string;
  /** User label, automatic "T1", or the catalog name (head table). */
  label: string;
  capacity: number;
  /** The couple's / head table (seated first in lists, never auto-filled with guests). */
  head: boolean;
}

/** Tables with seats, in seating order: head table first, then T1, T2… */
export function seatingTables(items: readonly Item[], catalog: CatalogMap): SeatTable[] {
  const labels = autoLabels(items, catalog);
  const tables: SeatTable[] = [];
  for (const item of items) {
    const cat = catalog.get(item.type);
    if (cat?.category !== 'tables' || item.type === 'chair') continue;
    const capacity = seatCount(item, cat);
    if (capacity <= 0) continue;
    const head = cat.chairLayout === 'one_side';
    tables.push({
      id: item.id,
      label: item.label?.trim() || labels.get(item.id) || cat.name,
      capacity,
      head,
    });
  }
  return tables.sort(
    (a, b) =>
      Number(b.head) - Number(a.head) ||
      a.label.localeCompare(b.label, 'sq', { numeric: true, sensitivity: 'base' }),
  );
}

/**
 * Guests from pasted text or a CSV export: one guest per line, optionally "Name; Group" (also
 * tab- or comma-separated when the line has two columns). A header line ("Emri…") is skipped.
 */
export function parseGuestText(text: string, makeId: () => string): Guest[] {
  const out: Guest[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line) continue;
    const sep = line.includes(';') ? ';' : line.includes('\t') ? '\t' : null;
    let cols = sep ? line.split(sep) : [line];
    // "Name, Group" only when there is exactly one comma (names rarely contain one).
    if (!sep && (line.match(/,/g) ?? []).length === 1) cols = line.split(',');
    const name = (cols[0] ?? '').replace(/^"|"$/g, '').trim();
    const group = (cols[1] ?? '').replace(/^"|"$/g, '').trim();
    if (!name) continue;
    if (i === 0 && /^(emri|emër|name)\b/i.test(name)) continue;
    out.push({
      id: makeId(),
      name: name.slice(0, 120),
      ...(group ? { group: group.slice(0, 60) } : {}),
    });
  }
  return out;
}

/** How many guests sit at each table. */
export function occupancy(guests: readonly Guest[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const g of guests) if (g.tableId) m.set(g.tableId, (m.get(g.tableId) ?? 0) + 1);
  return m;
}

/**
 * Seat everyone who has no table yet, keeping groups together where possible: biggest groups
 * first, each into the table that fits it most snugly; a group too big for any table is split
 * over the emptiest tables. Guests who declined (rsvp "jo") are never seated. The head table is
 * left to the agent. Already seated guests stay where they are.
 */
export function autoSeat(guests: readonly Guest[], tables: readonly SeatTable[]): Guest[] {
  const valid = new Set(tables.map((t) => t.id));
  const free = new Map<string, number>();
  for (const t of tables) if (!t.head) free.set(t.id, t.capacity);
  const result = guests.map((g) => {
    if (g.rsvp === 'jo') return withoutTable(g);
    if (g.tableId && !valid.has(g.tableId)) return withoutTable(g);
    return g;
  });
  for (const g of result)
    if (g.tableId && free.has(g.tableId)) free.set(g.tableId, free.get(g.tableId)! - 1);

  const groups = new Map<string, number[]>();
  result.forEach((g, i) => {
    if (g.tableId || g.rsvp === 'jo') return;
    const key = g.group?.trim().toLowerCase() || `\u0000solo-${i}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  // Named groups by size (biggest first); single guests without a group last.
  const ordered = [...groups.entries()].sort(
    (a, b) =>
      Number(a[0].startsWith('\u0000')) - Number(b[0].startsWith('\u0000')) ||
      b[1].length - a[1].length,
  );
  const order = tables.filter((t) => !t.head).map((t) => t.id);
  for (const [, members] of ordered) {
    let rest = [...members];
    while (rest.length) {
      const fitting = order
        .filter((id) => free.get(id)! >= rest.length)
        .sort((a, b) => free.get(a)! - free.get(b)!)[0];
      const target =
        fitting ??
        order.filter((id) => free.get(id)! > 0).sort((a, b) => free.get(b)! - free.get(a)!)[0];
      if (!target) return result; // hall is full
      const take = Math.min(free.get(target)!, rest.length);
      for (const idx of rest.slice(0, take)) result[idx] = { ...result[idx]!, tableId: target };
      free.set(target, free.get(target)! - take);
      rest = rest.slice(take);
    }
  }
  return result;
}

function withoutTable(g: Guest): Guest {
  const { tableId: _t, ...rest } = g;
  return rest;
}

export interface SeatingIssues {
  /** Tables with more guests than seats. */
  overfull: Array<{ tableId: string; label: string; count: number; capacity: number }>;
  /** Guests without a table (declined guests not counted). */
  unseated: number;
  /** Guests pointing to a table that no longer exists in the layout. */
  orphaned: number;
}

export function seatingIssues(
  guests: readonly Guest[],
  tables: readonly SeatTable[],
): SeatingIssues {
  const occ = occupancy(guests);
  const byId = new Map(tables.map((t) => [t.id, t]));
  return {
    overfull: tables
      .filter((t) => (occ.get(t.id) ?? 0) > t.capacity)
      .map((t) => ({ tableId: t.id, label: t.label, count: occ.get(t.id)!, capacity: t.capacity })),
    unseated: guests.filter((g) => !g.tableId && g.rsvp !== 'jo').length,
    orphaned: guests.filter((g) => g.tableId && !byId.has(g.tableId)).length,
  };
}
