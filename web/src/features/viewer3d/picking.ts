import type { CatalogItem, Item } from '@salla/shared';

/**
 * Picking items in the 3D view (edit in 3D): every item is an oriented box, tested against the
 * pointer ray. Pure math (unit tested); three.js only supplies the ray.
 * 3D coordinates: x = plan x, y = height, z = plan y.
 */

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface Ray3 {
  origin: V3;
  direction: V3;
}

/** An item's 3D box: center, half sizes in its own axes, and its rotation around y (radians). */
export interface PickBox {
  id: string;
  center: V3;
  half: V3;
  /** Same as the item group's rotation.y in the scene: −rotation (degrees, clockwise) in rad. */
  yaw: number;
}

const MIN_HALF_HEIGHT = 0.05;
const DEG = Math.PI / 180;

/** Same rule as the chandelier builder: it hangs from the ceiling on a 0.2–1.2 m chain. */
function hangingBottom(hallHeight: number, h: number): number {
  const chain = Math.max(0.2, Math.min(1.2, hallHeight - h - 2.6));
  return Math.max(0, hallHeight - chain - h);
}

/** The box an item occupies in the scene. `baseY` = what it stands on (0, or a table top). */
export function itemBox(
  item: Item,
  cat: CatalogItem | undefined,
  baseY: number,
  hallHeight: number,
): PickBox {
  const h = item.height ?? cat?.height ?? 0.5;
  // A hanging chandelier: its box reaches from the crystals up to the ceiling.
  const bottom = item.type === 'chandelier' ? hangingBottom(hallHeight, h) : baseY;
  const top = item.type === 'chandelier' ? hallHeight : baseY + h;
  const halfY = Math.max(MIN_HALF_HEIGHT, (top - bottom) / 2);
  return {
    id: item.id,
    center: { x: item.x, y: bottom + halfY, z: item.y },
    half: { x: Math.max(0.05, item.width / 2), y: halfY, z: Math.max(0.05, item.depth / 2) },
    yaw: -item.rotation * DEG,
  };
}

/** A world point in the box's own axes (undo the translation, then the rotation). */
function toLocal(p: V3, box: PickBox): V3 {
  const x = p.x - box.center.x;
  const z = p.z - box.center.z;
  // three.js rotation.y = a maps local (x, z) to world (x·cos a + z·sin a, −x·sin a + z·cos a);
  // the inverse is the same with −a.
  const c = Math.cos(-box.yaw);
  const s = Math.sin(-box.yaw);
  return { x: x * c + z * s, y: p.y - box.center.y, z: -x * s + z * c };
}

function toLocalDir(d: V3, box: PickBox): V3 {
  const c = Math.cos(-box.yaw);
  const s = Math.sin(-box.yaw);
  return { x: d.x * c + d.z * s, y: d.y, z: -d.x * s + d.z * c };
}

/** Distance along the ray to the box, or null when the ray misses it (slab test). */
export function rayBoxDistance(ray: Ray3, box: PickBox): number | null {
  const o = toLocal(ray.origin, box);
  const d = toLocalDir(ray.direction, box);
  let tMin = 0;
  let tMax = Infinity;
  for (const k of ['x', 'y', 'z'] as const) {
    const half = box.half[k];
    if (Math.abs(d[k]) < 1e-12) {
      if (o[k] < -half || o[k] > half) return null;
      continue;
    }
    let t1 = (-half - o[k]) / d[k];
    let t2 = (half - o[k]) / d[k];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
}

/** The nearest box the ray hits, with the hit point. */
export function pickBox(
  ray: Ray3,
  boxes: readonly PickBox[],
): { id: string; distance: number; point: V3 } | null {
  let best: { id: string; distance: number } | null = null;
  for (const b of boxes) {
    const t = rayBoxDistance(ray, b);
    if (t !== null && (!best || t < best.distance)) best = { id: b.id, distance: t };
  }
  if (!best) return null;
  const t = best.distance;
  return {
    ...best,
    point: {
      x: ray.origin.x + ray.direction.x * t,
      y: ray.origin.y + ray.direction.y * t,
      z: ray.origin.z + ray.direction.z * t,
    },
  };
}

/** Where the ray crosses the horizontal plane at height `y` (plan x/y), or null if it never does. */
export function rayAtHeight(ray: Ray3, y: number): { x: number; y: number } | null {
  const dy = ray.direction.y;
  if (Math.abs(dy) < 1e-9) return null;
  const t = (y - ray.origin.y) / dy;
  if (t < 0) return null;
  return { x: ray.origin.x + ray.direction.x * t, y: ray.origin.z + ray.direction.z * t };
}
