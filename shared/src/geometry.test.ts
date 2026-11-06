import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOG, catalogById } from './catalog-defaults.js';
import type { Item } from './schemas.js';
import {
  autoLabels,
  chairPositions,
  clampToHall,
  autoLayoutTables,
  findFreeSpot,
  layoutWarnings,
  halfExtents,
  localToWorld,
  nearestWall,
  pointInItem,
  supportHeight,
  overlappingPairs,
  seatCount,
  snap,
  snapAngle,
  summarize,
  isTabletop,
  uniformModelSize,
  decorPositions,
  tableDecorItems,
  walkArea,
  isWalkable,
  walkTarget,
  isPathClear,
  walkStep,
  yawWrap,
  WALL_MARGIN,
  quoteTotals,
  usageOf,
  addUsage,
  shortages,
  projectFinance,
} from './geometry.js';
import type { CatalogItem } from './schemas.js';

const cat = catalogById(DEFAULT_CATALOG);
const mk = (type: string, x: number, y: number, extra: Partial<Item> = {}): Item => {
  const c = cat.get(type)!;
  return {
    id: `${type}_${x}_${y}`,
    type,
    x,
    y,
    rotation: 0,
    width: c.width,
    depth: c.depth,
    color: c.defaultColor,
    ...extra,
  };
};

describe('snap', () => {
  it('snaps to 10 cm without float noise', () => {
    expect(snap(1.234)).toBe(1.2);
    expect(snap(1.25)).toBe(1.3);
    expect(snap(0.30000000000000004)).toBe(0.3);
  });
  it('snaps angles near 45° multiples only', () => {
    expect(snapAngle(43)).toBe(45);
    expect(snapAngle(30)).toBe(30);
    expect(snapAngle(-2)).toBe(0);
  });
});

describe('seatCount', () => {
  it('uses fixed catalog seats', () => {
    expect(seatCount(mk('table_round_10', 5, 5), cat.get('table_round_10'))).toBe(10);
  });
  it('item override wins', () => {
    expect(seatCount(mk('table_round_10', 5, 5, { seats: 12 }), cat.get('table_round_10'))).toBe(
      12,
    );
  });
  it('imperial table: 1 per 0.6 m each side', () => {
    expect(seatCount(mk('table_imperial', 5, 5), cat.get('table_imperial'))).toBe(20);
    expect(seatCount(mk('table_imperial', 5, 5, { width: 3 }), cat.get('table_imperial'))).toBe(10);
  });
});

describe('chairPositions', () => {
  it('round table: evenly spaced ring facing center', () => {
    const t = mk('table_round_8', 0, 0);
    const chairs = chairPositions(t, cat.get('table_round_8'));
    expect(chairs).toHaveLength(8);
    for (const c of chairs) expect(Math.hypot(c.x, c.y)).toBeCloseTo(0.75 + 0.3);
    // top chair faces down (+y)
    expect(chairs[0]!.y).toBeLessThan(0);
    expect(chairs[0]!.rotation).toBeCloseTo(0);
  });
  it('rect table: both long sides', () => {
    const chairs = chairPositions(mk('table_rect', 0, 0), cat.get('table_rect'));
    expect(chairs.filter((c) => c.y < 0)).toHaveLength(4);
    expect(chairs.filter((c) => c.y > 0)).toHaveLength(4);
  });
  it('head table: one side only', () => {
    const chairs = chairPositions(mk('table_head', 0, 0), cat.get('table_head'));
    expect(chairs).toHaveLength(2);
    expect(chairs.every((c) => c.y < 0)).toBe(true);
  });
  it('non-tables have no chairs', () => {
    expect(chairPositions(mk('stage', 0, 0), cat.get('stage'))).toEqual([]);
  });
});

describe('localToWorld / bounds', () => {
  it('rotates clockwise in plan coordinates', () => {
    const p = localToWorld({ x: 10, y: 10, rotation: 90 }, { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(11);
  });
  it('rotated rect swaps extents at 90°', () => {
    const e = halfExtents(mk('table_rect', 0, 0, { rotation: 90 }), cat.get('table_rect'));
    expect(e.hx).toBeCloseTo(0.45);
    expect(e.hy).toBeCloseTo(1.2);
  });
  it('clamps inside the hall', () => {
    const hall = { width: 10, length: 8 };
    expect(clampToHall(mk('stage', 0, 0), hall, cat.get('stage'))).toEqual({ x: 3, y: 1.5 });
    expect(clampToHall(mk('stage', 20, 20), hall, cat.get('stage'))).toEqual({ x: 7, y: 6.5 });
    // round 10: radius 0.9 + chair margin 0.525
    expect(clampToHall(mk('table_round_10', 0, 0), hall, cat.get('table_round_10'))).toEqual({
      x: 1.425,
      y: 1.425,
    });
  });
});

describe('overlappingPairs', () => {
  it('finds overlapping tables but ignores dance floor', () => {
    const items = [
      mk('table_round_10', 5, 5),
      mk('table_round_10', 6, 5),
      mk('dance_floor', 5, 5),
      mk('table_round_10', 12, 5),
    ];
    expect(overlappingPairs(items, cat)).toEqual([[items[0]!.id, items[1]!.id]]);
  });
});

describe('findFreeSpot', () => {
  const hall = { width: 20, length: 12 };
  it('returns the requested spot when free', () => {
    const t = mk('table_round_10', 0, 0);
    expect(findFreeSpot(t, { x: 10, y: 6 }, [], hall, cat)).toEqual({ x: 10, y: 6 });
  });
  it('moves next to an occupied spot, keeping a small gap', () => {
    const t = mk('table_round_10', 0, 0);
    const existing = [mk('table_round_10', 10, 6)];
    const p = findFreeSpot(t, { x: 10, y: 6 }, existing, hall, cat);
    expect(Math.max(Math.abs(p.x - 10), Math.abs(p.y - 6))).toBeGreaterThanOrEqual(1.85);
    expect(overlappingPairs([...existing, { ...t, ...p, id: 'new' }], cat)).toEqual([]);
  });
});

describe('autoLabels', () => {
  it('numbers left-to-right, top-to-bottom, skipping labeled tables', () => {
    const items = [
      mk('table_round_10', 8, 3.3),
      mk('table_round_10', 2, 3),
      mk('table_round_10', 5, 7),
      mk('table_head', 5, 1, { label: 'Çifti' }),
      mk('stage', 10, 10),
    ];
    const labels = autoLabels(items, cat);
    expect(labels.get(items[1]!.id)).toBe('T1');
    expect(labels.get(items[0]!.id)).toBe('T2');
    expect(labels.get(items[2]!.id)).toBe('T3');
    expect(labels.has(items[3]!.id)).toBe(false);
    expect(labels.has(items[4]!.id)).toBe(false);
  });
  it('never numbers the head table', () => {
    expect(autoLabels([mk('table_head', 5, 1)], cat).size).toBe(0);
  });
});

describe('summarize', () => {
  it('counts, adds table chairs to chair line, totals', () => {
    const items = [
      mk('table_round_10', 2, 2),
      mk('table_round_10', 6, 2),
      mk('stage', 10, 10),
      mk('chair', 1, 1),
    ];
    const s = summarize(items, DEFAULT_CATALOG);
    expect(s.capacity).toBe(21);
    expect(s.totalChairs).toBe(21);
    const chair = s.lines.find((l) => l.type === 'chair')!;
    expect(chair.quantity).toBe(21);
    expect(s.total).toBe(2 * 25 + 150 + 21 * 3);
  });
});

describe('supportHeight / pointInItem / nearestWall', () => {
  it('centerpiece on a round table stands on the table top', () => {
    const table = mk('table_round_10', 5, 5);
    const cp = mk('centerpiece', 5.3, 5.2);
    expect(supportHeight(cp, [table, cp], cat)).toBe(0.75);
    expect(supportHeight(mk('centerpiece', 8, 8), [table], cat)).toBe(0);
    expect(supportHeight(mk('flower_stand', 5, 5), [table], cat)).toBe(0);
  });
  it('respects rotation for rect tables', () => {
    const t = mk('table_rect', 5, 5, { rotation: 90 });
    expect(pointInItem(5, 6, t, cat.get('table_rect'))).toBe(true);
    expect(pointInItem(6, 5, t, cat.get('table_rect'))).toBe(false);
  });
  it('finds the nearest wall', () => {
    expect(nearestWall(1, 9, { width: 30, length: 18 })).toEqual({ wall: 'left', distance: 1 });
    expect(nearestWall(15, 17.5, { width: 30, length: 18 })).toEqual({
      wall: 'bottom',
      distance: 0.5,
    });
  });
});

describe('autoLayoutTables', () => {
  const hall = { width: 30, length: 18, structure: [] as Item[] };
  it('fills an empty hall in a grid with 1.2 m aisles, no overlaps', () => {
    const spots = autoLayoutTables('table_round_10', 20, hall, [], cat);
    expect(spots).toHaveLength(20);
    const placed = spots.map((p, i) => mk('table_round_10', p.x, p.y, { id: `t${i}` }));
    expect(overlappingPairs(placed, cat)).toEqual([]);
    expect(layoutWarnings(placed, cat).filter((w) => w.kind === 'aisle')).toEqual([]);
    for (const t of placed)
      expect(clampToHall(t, hall, cat.get('table_round_10'))).toEqual({ x: t.x, y: t.y });
  });
  it('avoids existing items and returns fewer when the hall is full', () => {
    const stage = mk('stage', 15, 3, { id: 'stage', width: 30, depth: 6 });
    const spots = autoLayoutTables('table_round_10', 100, hall, [stage], cat);
    expect(spots.length).toBeGreaterThan(0);
    expect(spots.length).toBeLessThan(100);
    for (const p of spots) expect(p.y - 1.425).toBeGreaterThanOrEqual(6 + 1.2 - 1e-6);
  });
  it('treats columns as obstacles', () => {
    const column = mk('column', 15, 9, { id: 'c' });
    const spots = autoLayoutTables('table_round_8', 200, { ...hall, structure: [column] }, [], cat);
    for (const p of spots) {
      const near =
        Math.abs(p.x - 15) < 1.275 + 0.25 + 1.2 && Math.abs(p.y - 9) < 1.275 + 0.25 + 1.2;
      expect(near).toBe(false);
    }
  });
});

describe('layoutWarnings', () => {
  it('flags overlaps, narrow aisles and missing seats', () => {
    const a = mk('table_round_10', 5, 5, { id: 'a' });
    const b = mk('table_round_10', 5 + 2.85 + 0.5, 5, { id: 'b' }); // 0.5 m gap
    const c = mk('table_round_10', 6, 6, { id: 'c' }); // overlaps a
    const w = layoutWarnings([a, b, c], cat, 50);
    expect(w).toContainEqual({ kind: 'aisle', ids: ['a', 'b'], gap: 0.5 });
    expect(w.some((x) => x.kind === 'overlap')).toBe(true);
    expect(w).toContainEqual({ kind: 'seats', missing: 20 });
  });
  it('is quiet for a good layout', () => {
    const a = mk('table_round_10', 5, 5, { id: 'a' });
    const b = mk('table_round_10', 5 + 2.85 + 1.2, 5, { id: 'b' });
    expect(layoutWarnings([a, b], cat, 20)).toEqual([]);
  });
});

describe('findFreeSpot spacing', () => {
  it('tapping a table 20 times leaves no narrow-aisle warnings', () => {
    const hall = { width: 30, length: 18 };
    const items: Item[] = [];
    for (let i = 0; i < 20; i++) {
      const t = mk('table_round_10', 0, 0, { id: `t${i}` });
      items.push({ ...t, ...findFreeSpot(t, { x: 15, y: 9 }, items, hall, cat) });
    }
    expect(layoutWarnings(items, cat)).toEqual([]);
  });
});

describe('library decor (Beta 1)', () => {
  const peony: CatalogItem = {
    id: 'lib_peony',
    name: 'Peonia rozë',
    category: 'floral',
    width: 0.37,
    depth: 0.37,
    height: 0.46,
    shape2d: 'circle',
    resizable: 'none',
    defaultColor: '#FFFFFF',
    price: 28,
    active: true,
    source: 'library',
    tabletop: true,
    scaleMode: 'uniform',
  };
  const withPeony = new Map([...cat, [peony.id, peony]]);

  it('keeps the scan proportions from the real height', () => {
    expect(uniformModelSize({ x: 36.8, y: 46, z: 36.8 }, 0.46)).toEqual({
      width: 0.368,
      depth: 0.368,
      height: 0.46,
    });
    expect(uniformModelSize({ x: 1, y: 0, z: 1 }, 1)).toEqual({ width: 0, depth: 0, height: 0 });
  });

  it('knows which items stand on tables (flag, or built-in fallback)', () => {
    expect(isTabletop(peony)).toBe(true);
    expect(isTabletop({ ...cat.get('centerpiece')!, tabletop: undefined })).toBe(true);
    expect(isTabletop(cat.get('stage'))).toBe(false);
    expect(isTabletop(undefined)).toBe(false);
  });

  it('a scanned centerpiece on a table stands on the table top and is no overlap', () => {
    const table = mk('table_round_10', 5, 5);
    const decor: Item = {
      ...mk('centerpiece', 5, 5),
      id: 'p',
      type: peony.id,
      width: 0.37,
      depth: 0.37,
    };
    expect(supportHeight(decor, [table, decor], withPeony)).toBe(0.75);
    expect(overlappingPairs([table, decor], withPeony)).toEqual([]);
    // Placing it next to a table does not push it away from the table.
    const spot = findFreeSpot(decor, { x: 5, y: 5 }, [table], { width: 20, length: 20 }, withPeony);
    expect(spot).toEqual({ x: 5, y: 5 });
  });

  it('prices library decor in the summary by its catalog price', () => {
    const decor: Item = { ...mk('centerpiece', 5, 5), id: 'p', type: peony.id };
    const s = summarize([decor, { ...decor, id: 'q' }], [...withPeony.values()]);
    expect(s.lines.find((l) => l.type === peony.id)).toMatchObject({
      name: 'Peonia rozë',
      quantity: 2,
      total: 56,
    });
  });
});

describe('table decor (Beta 2)', () => {
  it('one piece on a round table, about one per 2 m along long tables', () => {
    expect(decorPositions(mk('table_round_10', 5, 5), cat.get('table_round_10'))).toEqual([
      { x: 0, y: 0 },
    ]);
    const imperial = mk('table_imperial', 10, 5, { width: 6 });
    expect(decorPositions(imperial, cat.get('table_imperial'))).toEqual([
      { x: -2, y: 0 },
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(decorPositions(mk('stage', 5, 5), cat.get('stage'))).toEqual([]);
  });

  it('turns table decor into placed items that follow the table rotation', () => {
    const t = mk('table_imperial', 10, 5, { width: 4, rotation: 90, tableDecor: 'centerpiece' });
    const decor = tableDecorItems([t], cat);
    expect(decor.map((d) => [d.type, d.x, d.y, d.rotation])).toEqual([
      ['centerpiece', 10, 4, 90],
      ['centerpiece', 10, 6, 90],
    ]);
    expect(tableDecorItems([{ ...t, tableDecor: 'unknown' }], cat)).toEqual([]);
  });

  it('prices decor per piece in the summary', () => {
    const tables = [1, 2, 3].map((i) =>
      mk('table_round_10', i * 4, 5, { tableDecor: 'centerpiece' }),
    );
    const s = summarize(tables, DEFAULT_CATALOG);
    expect(s.lines.find((l) => l.type === 'centerpiece')).toMatchObject({
      quantity: 3,
      total: 105,
    });
    expect(s.capacity).toBe(30);
  });
});

describe('walking through the hall (Beta 3)', () => {
  const hall = { width: 20, length: 14, structure: [mk('column', 15, 3)] };
  const table = mk('table_round_10', 6, 7);
  const dance = mk('dance_floor', 12, 9, { width: 4, depth: 4 });
  const area = walkArea(hall, [table, dance, mk('chandelier', 6, 7)], cat);

  it('tables (with chairs) and columns block; dance floor and chandeliers do not', () => {
    expect(area.obstacles).toHaveLength(2);
    expect(isWalkable({ x: 6, y: 7 }, area)).toBe(false); // table
    expect(isWalkable({ x: 6, y: 5.4 }, area)).toBe(false); // a chair
    expect(isWalkable({ x: 12, y: 9 }, area)).toBe(true); // on the dance floor
    expect(isWalkable({ x: 15, y: 3 }, area)).toBe(false); // column
    expect(isWalkable({ x: 0.1, y: 7 }, area)).toBe(false); // wall
  });

  it('a tap on a table or a wall resolves to the nearest free spot', () => {
    const p = walkTarget({ x: 6, y: 7 }, area)!;
    expect(isWalkable(p, area)).toBe(true);
    expect(Math.hypot(p.x - 6, p.y - 7)).toBeLessThan(2);
    expect(walkTarget({ x: -5, y: 7 }, area)).toEqual({ x: WALL_MARGIN, y: 7 });
  });

  it('knows when furniture is in the way (then the view jumps instead of gliding)', () => {
    expect(isPathClear({ x: 2, y: 7 }, { x: 10, y: 7 }, area)).toBe(false);
    expect(isPathClear({ x: 2, y: 12 }, { x: 10, y: 12 }, area)).toBe(true);
  });

  it('keyboard steps slide along obstacles instead of passing through', () => {
    const at = { x: 3, y: 7.1 };
    // Straight into the table: blocked, stays put.
    expect(walkStep(at, { x: 4.6, y: 7.1 }, area)).toEqual(at);
    // Diagonally into a wall: slides along it.
    expect(walkStep({ x: 0.5, y: 3 }, { x: 0.2, y: 3.2 }, area)).toEqual({ x: 0.5, y: 3.2 });
    expect(yawWrap(-90)).toBe(270);
    expect(yawWrap(370)).toBe(10);
  });
});

describe('quote totals', () => {
  it('subtracts the discount and adds extra services (cents rounded)', () => {
    const q = quoteTotals(1110, {
      discountPercent: 10,
      extras: [
        { label: ' Transport dhe montim ', amount: 150 },
        { label: 'Bosh', amount: 0 },
      ],
    });
    expect(q).toEqual({
      subtotal: 1110,
      discountPercent: 10,
      discount: 111,
      extras: [{ label: 'Transport dhe montim', amount: 150 }],
      total: 1149,
    });
    expect(quoteTotals(99.99, { discountPercent: 12.5 }).total).toBe(87.49);
    expect(quoteTotals(500).total).toBe(500);
    expect(quoteTotals(100, { discountPercent: 150 }).discount).toBe(100);
  });
});

describe('inventory', () => {
  it('counts what a layout needs (auto chairs included) and finds shortages', () => {
    const items = [mk('table_round_10', 5, 5), mk('table_round_10', 10, 5), mk('stage', 15, 2)];
    const need = usageOf(items, DEFAULT_CATALOG);
    expect(need.get('chair')).toBe(20);
    expect(need.get('table_round_10')).toBe(2);
    const stocked = new Map([...cat].map(([k, v]) => [k, k === 'chair' ? { ...v, stock: 25 } : v]));
    expect(shortages(need, new Map(), stocked)).toEqual([]);
    const taken = addUsage(new Map([['chair', 10]]), new Map([['chair', 4]]));
    expect(shortages(need, taken, stocked)).toEqual([
      { type: 'chair', name: 'Karrige', stock: 25, need: 20, taken: 14, missing: 9 },
    ]);
  });
});

describe('project finance', () => {
  it('total after discount and services, deposit, paid and balance', () => {
    const items = [mk('table_round_10', 5, 5)]; // 25 € + 10 chairs × 3 € = 55 €
    const f = projectFinance(
      items,
      { discountPercent: 10, depositPercent: 30, extras: [{ label: 'Transport', amount: 50.5 }] },
      [{ amount: 40 }, { amount: 20 }],
      DEFAULT_CATALOG,
    );
    expect(f).toEqual({ total: 100, deposit: 30, paid: 60, balance: 40, paidShare: 0.6 });
    expect(projectFinance(items, undefined, [{ amount: 80 }], DEFAULT_CATALOG).balance).toBe(0);
  });
});
