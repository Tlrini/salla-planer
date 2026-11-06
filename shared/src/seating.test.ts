import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOG, catalogById } from './catalog-defaults.js';
import type { Guest, Item } from './schemas.js';
import { autoSeat, occupancy, parseGuestText, seatingIssues, seatingTables } from './seating.js';

const cat = catalogById(DEFAULT_CATALOG);
const table = (
  id: string,
  type: string,
  x: number,
  y: number,
  extra: Partial<Item> = {},
): Item => ({
  id,
  type,
  x,
  y,
  rotation: 0,
  width: cat.get(type)!.width,
  depth: cat.get(type)!.depth,
  color: '#FFFFFF',
  ...extra,
});

describe('seating', () => {
  const items = [
    table('b', 'table_round_10', 10, 5),
    table('a', 'table_round_8', 5, 5),
    table('h', 'table_head', 8, 1),
    table('s', 'stage', 20, 2),
    table('c', 'chair', 1, 1),
  ];
  const tables = seatingTables(items, cat);
  let n = 0;
  const id = () => `g${++n}`;

  it('lists tables with seats: head table first, then T1, T2', () => {
    expect(tables.map((t) => [t.label, t.capacity, t.head])).toEqual([
      ['Tavolina e çiftit', 2, true],
      ['T1', 8, false],
      ['T2', 10, false],
    ]);
  });

  it('parses pasted lists and CSV exports', () => {
    const g = parseGuestText(
      'Emri;Grupi\nArta Hoxha; Familja e nuses\n\nBesnik Krasniqi\tKolegët\nDritë, Miqtë\n',
      id,
    );
    expect(g.map((x) => [x.name, x.group])).toEqual([
      ['Arta Hoxha', 'Familja e nuses'],
      ['Besnik Krasniqi', 'Kolegët'],
      ['Dritë', 'Miqtë'],
    ]);
  });

  it('auto-seats groups together, biggest first, never on the head table', () => {
    const guests: Guest[] = [
      ...Array.from({ length: 7 }, (_, i) => ({ id: `f${i}`, name: `F${i}`, group: 'Familja' })),
      ...Array.from({ length: 9 }, (_, i) => ({ id: `k${i}`, name: `K${i}`, group: 'Kolegët' })),
      { id: 'x', name: 'Refuzoi', rsvp: 'jo' as const, tableId: 'b' },
      { id: 'y', name: 'Vetëm' },
    ];
    const seated = autoSeat(guests, tables);
    const at = (gid: string) => seated.find((g) => g.id === gid)!.tableId;
    // 9 colleagues fit only the 10-seat table; the 7 family members go to the 8-seat one.
    expect(new Set(seated.filter((g) => g.group === 'Kolegët').map((g) => g.tableId))).toEqual(
      new Set(['b']),
    );
    expect(new Set(seated.filter((g) => g.group === 'Familja').map((g) => g.tableId))).toEqual(
      new Set(['a']),
    );
    expect(at('x')).toBeUndefined();
    expect(at('y')).toBeDefined();
    expect(occupancy(seated).get('h')).toBeUndefined();
  });

  it('splits a group that fits no table and stops when the hall is full', () => {
    const big: Guest[] = Array.from({ length: 20 }, (_, i) => ({
      id: `z${i}`,
      name: `Z${i}`,
      group: 'Dasma',
    }));
    const seated = autoSeat(big, tables);
    expect(occupancy(seated).get('b')).toBe(10);
    expect(occupancy(seated).get('a')).toBe(8);
    expect(seatingIssues(seated, tables).unseated).toBe(2);
  });

  it('reports overfull tables and guests of deleted tables', () => {
    const guests: Guest[] = [
      ...Array.from({ length: 9 }, (_, i) => ({ id: `o${i}`, name: `O${i}`, tableId: 'a' })),
      { id: 'gone', name: 'Pa tavolinë', tableId: 'deleted' },
    ];
    const issues = seatingIssues(guests, tables);
    expect(issues.overfull).toEqual([{ tableId: 'a', label: 'T1', count: 9, capacity: 8 }]);
    expect(issues.orphaned).toBe(1);
    expect(autoSeat(guests, tables).find((g) => g.id === 'gone')!.tableId).not.toBe('deleted');
  });
});
