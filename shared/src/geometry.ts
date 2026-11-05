import type { CatalogItem, Hall, Item } from './schemas.js';

/** Seat spacing for per-length tables (imperial): 1 seat per 0.6 m on each side. */
export const SEAT_SPACING = 0.6;
/** Distance from the table edge to a chair center (m). */
export const CHAIR_OFFSET = 0.3;
export const CHAIR_SIZE = 0.45;

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

export function snap(value: number, step = 0.1): number {
  return round6(Math.round(value / step) * step);
}

export function snapAngle(deg: number, step = 45, tolerance = 7): number {
  const nearest = Math.round(deg / step) * step + 0; // + 0 turns -0 into 0
  return Math.abs(nearest - deg) <= tolerance ? nearest : deg;
}

export function normalizeAngle(deg: number): number {
  const r = deg % 360;
  return round6(r < 0 ? r + 360 : r);
}

export type CatalogMap = ReadonlyMap<string, CatalogItem>;

export function hasChairs(cat: CatalogItem | undefined): boolean {
  return !!cat?.chairLayout;
}

/** Number of seats an item provides (table seats, a chair = 1, sofa = 3...). */
export function seatCount(item: Item, cat: CatalogItem | undefined): number {
  if (item.seats !== undefined) return item.seats;
  if (!cat) return 0;
  if (cat.seatRule === 'per_length') {
    const perSide = Math.max(1, Math.floor(item.width / SEAT_SPACING + 1e-9));
    return cat.chairLayout === 'one_side' ? perSide : perSide * 2;
  }
  return cat.defaultSeats ?? 0;
}

export interface LocalPose {
  x: number;
  y: number;
  /** Direction the chair faces, degrees clockwise (0 = facing +y / down in the plan). */
  rotation: number;
}

function spread(count: number, length: number): number[] {
  return Array.from({ length: count }, (_, i) => -length / 2 + ((i + 0.5) * length) / count);
}

/**
 * Chair positions in the table's LOCAL frame (relative to its center, before rotation).
 * Chairs face the table.
 */
export function chairPositions(item: Item, cat: CatalogItem | undefined): LocalPose[] {
  if (!cat?.chairLayout) return [];
  const n = seatCount(item, cat);
  if (n <= 0) return [];
  const hw = item.width / 2;
  const hd = item.depth / 2;

  if (cat.chairLayout === 'ring') {
    const r = Math.max(hw, hd) + CHAIR_OFFSET;
    return Array.from({ length: n }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      // facing the center: direction vector (-cos a, -sin a); rotation 0 faces +y
      const facing = (Math.atan2(Math.cos(a), -Math.sin(a)) * 180) / Math.PI;
      return {
        x: round6(r * Math.cos(a)),
        y: round6(r * Math.sin(a)),
        rotation: normalizeAngle(facing),
      };
    });
  }

  if (cat.chairLayout === 'one_side') {
    // Behind the table (top side), facing down into the room.
    return spread(n, item.width).map((x) => ({
      x: round6(x),
      y: round6(-hd - CHAIR_OFFSET),
      rotation: 0,
    }));
  }

  const top = Math.ceil(n / 2);
  const bottom = n - top;
  return [
    ...spread(top, item.width).map((x) => ({
      x: round6(x),
      y: round6(-hd - CHAIR_OFFSET),
      rotation: 0,
    })),
    ...spread(bottom, item.width).map((x) => ({
      x: round6(x),
      y: round6(hd + CHAIR_OFFSET),
      rotation: 180,
    })),
  ];
}

/** Rotate a local point by the item's rotation and translate to hall coordinates. */
export function localToWorld(
  item: Pick<Item, 'x' | 'y' | 'rotation'>,
  p: { x: number; y: number },
) {
  const r = (item.rotation * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: item.x + p.x * c - p.y * s, y: item.y + p.x * s + p.y * c };
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Half extents of the axis-aligned box around a (possibly rotated) item. */
export function halfExtents(item: Item, cat?: CatalogItem): { hx: number; hy: number } {
  const hw = item.width / 2;
  const hd = item.depth / 2;
  if (cat?.shape2d === 'circle') return { hx: hw, hy: hd };
  const r = (item.rotation * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { hx: round6(hw * c + hd * s), hy: round6(hw * s + hd * c) };
}

export function itemBox(item: Item, cat?: CatalogItem): Box {
  const { hx, hy } = halfExtents(item, cat);
  return { minX: item.x - hx, minY: item.y - hy, maxX: item.x + hx, maxY: item.y + hy };
}

/** Box including the automatic chairs around a table (the space a table really uses). */
export function footprintBox(item: Item, cat?: CatalogItem): Box {
  const b = itemBox(item, cat);
  if (!hasChairs(cat) || seatCount(item, cat) === 0) return b;
  const m = CHAIR_OFFSET + CHAIR_SIZE / 2;
  return { minX: b.minX - m, minY: b.minY - m, maxX: b.maxX + m, maxY: b.maxY + m };
}

/** Keep the item's bounding box inside the hall. Returns the corrected center. */
export function clampToHall(item: Item, hall: Pick<Hall, 'width' | 'length'>, cat?: CatalogItem) {
  // Use the footprint so the chairs around a table stay inside the walls too.
  const f = footprintBox(item, cat);
  const hx = (f.maxX - f.minX) / 2;
  const hy = (f.maxY - f.minY) / 2;
  const clamp = (v: number, h: number, size: number) =>
    2 * h >= size ? size / 2 : Math.min(size - h, Math.max(h, v));
  return { x: round6(clamp(item.x, hx, hall.width)), y: round6(clamp(item.y, hy, hall.length)) };
}

export function boxesOverlap(a: Box, b: Box, tolerance = 0.01): boolean {
  return (
    a.minX < b.maxX - tolerance &&
    b.minX < a.maxX - tolerance &&
    a.minY < b.maxY - tolerance &&
    b.minY < a.maxY - tolerance
  );
}

/** Types that are meant to sit on/under/above other items and never count as overlapping. */
const LAYERED_TYPES = new Set([
  'dance_floor',
  'carpet_aisle',
  'chandelier',
  'centerpiece',
  'candle_group',
]);

export function overlappingPairs(
  items: readonly Item[],
  catalog: CatalogMap,
): Array<[string, string]> {
  const solid = items.filter((i) => !LAYERED_TYPES.has(i.type));
  const boxes = solid.map((i) => footprintBox(i, catalog.get(i.type)));
  const pairs: Array<[string, string]> = [];
  for (let a = 0; a < solid.length; a++) {
    for (let b = a + 1; b < solid.length; b++) {
      if (boxesOverlap(boxes[a]!, boxes[b]!)) pairs.push([solid[a]!.id, solid[b]!.id]);
    }
  }
  return pairs;
}

/**
 * Find a spot near `at` where a new item does not overlap existing solid items, searching
 * outward in square rings of `step` m. Falls back to the clamped `at` if nothing is free.
 */
export function findFreeSpot(
  draft: Item,
  at: { x: number; y: number },
  items: readonly Item[],
  hall: Pick<Hall, 'width' | 'length'>,
  catalog: CatalogMap,
  step = 0.5,
  maxRings = 40,
): { x: number; y: number } {
  const cat = catalog.get(draft.type);
  const place = (x: number, y: number) => clampToHall({ ...draft, x, y }, hall, cat);
  // Tables keep a walkable aisle to everything else; other items just must not touch.
  const gap = hasChairs(cat) ? MIN_AISLE : 0.05;
  if (LAYERED_TYPES.has(draft.type)) return place(at.x, at.y);
  const others = items
    .filter((i) => !LAYERED_TYPES.has(i.type))
    .map((i) => footprintBox(i, catalog.get(i.type)));
  const free = (p: { x: number; y: number }) => {
    const box = footprintBox({ ...draft, ...p }, cat);
    return others.every((o) => !boxesOverlap(box, o, -gap));
  };
  for (let ring = 0; ring <= maxRings; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const p = place(snap(at.x + dx * step), snap(at.y + dy * step));
        if (free(p)) return p;
      }
    }
  }
  return place(at.x, at.y);
}

/**
 * Automatic labels T1, T2… for tables without a user label, ordered top-to-bottom in rows
 * (items within `rowTolerance` m of a row's first item share the row), left-to-right inside a row.
 */
export function autoLabels(
  items: readonly Item[],
  catalog: CatalogMap,
  rowTolerance = 1,
): Map<string, string> {
  const tables = items
    .filter((i) => {
      const cat = catalog.get(i.type);
      // The head table is not numbered; it shows its own name.
      return hasChairs(cat) && cat?.chairLayout !== 'one_side' && !i.label?.trim();
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Item[][] = [];
  for (const t of tables) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(t.y - row[0]!.y) < rowTolerance) row.push(t);
    else rows.push([t]);
  }
  const labels = new Map<string, string>();
  let n = 1;
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    for (const t of row) labels.set(t.id, `T${n++}`);
  }
  return labels;
}

export interface SummaryLine {
  type: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Summary {
  lines: SummaryLine[];
  /** Chairs: standalone chair items plus chairs drawn around tables. */
  totalChairs: number;
  /** Guest capacity: sum of seats of all items. */
  capacity: number;
  total: number;
}

export function summarize(items: readonly Item[], catalog: readonly CatalogItem[]): Summary {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const counts = new Map<string, number>();
  let autoChairs = 0;
  let capacity = 0;
  for (const item of items) {
    const cat = byId.get(item.type);
    counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
    const seats = seatCount(item, cat);
    capacity += seats;
    if (hasChairs(cat)) autoChairs += seats;
  }
  if (autoChairs > 0) counts.set('chair', (counts.get('chair') ?? 0) + autoChairs);

  const order = new Map(catalog.map((c, i) => [c.id, i]));
  const lines: SummaryLine[] = [...counts.entries()]
    .sort((a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999))
    .map(([type, quantity]) => {
      const cat = byId.get(type);
      const unitPrice = cat?.price ?? 0;
      return {
        type,
        name: cat?.name ?? type,
        quantity,
        unitPrice,
        total: round6(unitPrice * quantity),
      };
    });
  return {
    lines,
    totalChairs: counts.get('chair') ?? 0,
    capacity,
    total: round6(lines.reduce((s, l) => s + l.total, 0)),
  };
}

/** True if the plan point (px, py) lies on the item (rotated rect or ellipse). */
export function pointInItem(px: number, py: number, item: Item, cat?: CatalogItem): boolean {
  const r = (-item.rotation * Math.PI) / 180;
  const dx = px - item.x;
  const dy = py - item.y;
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);
  const hw = item.width / 2;
  const hd = item.depth / 2;
  if (cat?.shape2d === 'circle') return (lx * lx) / (hw * hw) + (ly * ly) / (hd * hd) <= 1;
  return Math.abs(lx) <= hw && Math.abs(ly) <= hd;
}

/** Items that sit on a table top when placed over a table. */
export const TABLETOP_TYPES = new Set(['centerpiece', 'candle_group']);

/**
 * Height (m) an item stands on: the top of the table under it for table-top items,
 * otherwise the floor (0).
 */
export function supportHeight(item: Item, items: readonly Item[], catalog: CatalogMap): number {
  if (!TABLETOP_TYPES.has(item.type)) return 0;
  for (const other of items) {
    if (other.id === item.id) continue;
    const cat = catalog.get(other.type);
    if (cat?.category !== 'tables' || TABLETOP_TYPES.has(other.type)) continue;
    if (other.type === 'chair' || other.type === 'lounge_sofa') continue;
    if (pointInItem(item.x, item.y, other, cat)) return other.height ?? cat.height;
  }
  return 0;
}

export type Wall = 'top' | 'bottom' | 'left' | 'right';

/** The hall wall nearest to a plan point, and the distance to it. */
export function nearestWall(
  x: number,
  y: number,
  hall: Pick<Hall, 'width' | 'length'>,
): { wall: Wall; distance: number } {
  const options: Array<[Wall, number]> = [
    ['top', y],
    ['bottom', hall.length - y],
    ['left', x],
    ['right', hall.width - x],
  ];
  options.sort((a, b) => a[1] - b[1]);
  const [wall, distance] = options[0]!;
  return { wall, distance };
}

/** Clear walking space kept around auto-placed tables (m). */
export const AISLE = 1.2;
/** Gaps between tables below this are flagged (m). */
export const MIN_AISLE = 0.9;

/** Overhead / table-top items never block floor space. */
const NON_BLOCKING = new Set(['chandelier', 'centerpiece', 'candle_group']);

/**
 * Place `count` tables of `type` in a grid over the free floor, keeping `aisle` meters between
 * tables, from walls (half an aisle) and from existing items and structure. Returns the centers
 * found, in reading order; fewer than `count` when the hall is full.
 */
export function autoLayoutTables(
  type: string,
  count: number,
  hall: Pick<Hall, 'width' | 'length' | 'structure'>,
  items: readonly Item[],
  catalog: CatalogMap,
  aisle = AISLE,
): Array<{ x: number; y: number }> {
  const cat = catalog.get(type);
  if (!cat || count <= 0) return [];
  const probe: Item = {
    id: '_',
    type,
    x: 0,
    y: 0,
    rotation: 0,
    width: cat.width,
    depth: cat.depth,
    color: '#FFFFFF',
  };
  const f = footprintBox(probe, cat);
  const fw = f.maxX - f.minX;
  const fd = f.maxY - f.minY;
  const margin = aisle / 2;
  const usableW = hall.width - 2 * margin;
  const usableL = hall.length - 2 * margin;
  if (fw > usableW || fd > usableL) return [];

  const nx = Math.floor((usableW - fw) / (fw + aisle)) + 1;
  const ny = Math.floor((usableL - fd) / (fd + aisle)) + 1;
  const gridW = (nx - 1) * (fw + aisle) + fw;
  const gridL = (ny - 1) * (fd + aisle) + fd;
  const x0 = (hall.width - gridW) / 2 + fw / 2;
  const y0 = (hall.length - gridL) / 2 + fd / 2;

  const obstacles = [...items, ...hall.structure]
    .filter((i) => !NON_BLOCKING.has(i.type))
    .map((i) => {
      const b = footprintBox(i, catalog.get(i.type));
      return {
        minX: b.minX - aisle,
        minY: b.minY - aisle,
        maxX: b.maxX + aisle,
        maxY: b.maxY + aisle,
      };
    });

  const out: Array<{ x: number; y: number }> = [];
  for (let j = 0; j < ny && out.length < count; j++) {
    for (let i = 0; i < nx && out.length < count; i++) {
      const x = round6(x0 + i * (fw + aisle));
      const y = round6(y0 + j * (fd + aisle));
      const box = footprintBox({ ...probe, x, y }, cat);
      if (obstacles.every((o) => !boxesOverlap(box, o, 0.001)))
        out.push({ x: snap(x, 0.01), y: snap(y, 0.01) });
    }
  }
  return out;
}

export type LayoutWarning =
  | { kind: 'overlap'; ids: [string, string] }
  | { kind: 'aisle'; ids: [string, string]; gap: number }
  | { kind: 'seats'; missing: number };

function boxGap(a: Box, b: Box): number {
  const dx = Math.max(0, b.minX - a.maxX, a.minX - b.maxX);
  const dy = Math.max(0, b.minY - a.maxY, a.minY - b.maxY);
  return Math.hypot(dx, dy);
}

/** Non-blocking layout checks: overlapping items, aisles under 0.9 m between tables, too few seats. */
export function layoutWarnings(
  items: readonly Item[],
  catalog: CatalogMap,
  guestTarget?: number,
): LayoutWarning[] {
  const out: LayoutWarning[] = [];
  const overlaps = overlappingPairs(items, catalog);
  const overlapKeys = new Set(overlaps.map(([a, b]) => `${a}|${b}`));
  for (const ids of overlaps) out.push({ kind: 'overlap', ids });

  const tables = items.filter((i) => hasChairs(catalog.get(i.type)));
  const boxes = tables.map((t) => footprintBox(t, catalog.get(t.type)));
  for (let a = 0; a < tables.length; a++) {
    for (let b = a + 1; b < tables.length; b++) {
      const ta = tables[a]!;
      const tb = tables[b]!;
      if (overlapKeys.has(`${ta.id}|${tb.id}`) || overlapKeys.has(`${tb.id}|${ta.id}`)) continue;
      const gap = boxGap(boxes[a]!, boxes[b]!);
      if (gap < MIN_AISLE - 1e-6)
        out.push({ kind: 'aisle', ids: [ta.id, tb.id], gap: round6(gap) });
    }
  }

  if (guestTarget) {
    const capacity = items.reduce((s, i) => s + seatCount(i, catalog.get(i.type)), 0);
    if (capacity < guestTarget) out.push({ kind: 'seats', missing: guestTarget - capacity });
  }
  return out;
}
