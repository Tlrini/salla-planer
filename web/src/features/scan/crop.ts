/** Cropping a scan result to the decor (pure geometry, no three.js). */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

export type Range = readonly [number, number];

/** The kept part of the model per axis, as fractions 0–1 of its bounding box. */
export interface CropFractions {
  x: Range;
  y: Range;
  z: Range;
}

export const FULL_CROP: CropFractions = { x: [0, 1], y: [0, 1], z: [0, 1] };

/** Smallest kept part of an axis (fraction), so the box never collapses. */
export const MIN_CROP_SPAN = 0.02;

/** Set one end of an axis range, keeping it inside 0–1 and wider than MIN_CROP_SPAN. Pure. */
export function setCropEnd(range: Range, end: 0 | 1, value: number): [number, number] {
  const v = Math.min(1, Math.max(0, value));
  return end === 0
    ? [Math.min(v, range[1] - MIN_CROP_SPAN), range[1]]
    : [range[0], Math.max(v, range[0] + MIN_CROP_SPAN)];
}

/** The crop box in model coordinates. Pure. */
export function cropBounds(bounds: Bounds, f: CropFractions): Bounds {
  const axis = (k: keyof Vec3) => {
    const r = f[k];
    const span = bounds.max[k] - bounds.min[k];
    return [bounds.min[k] + span * r[0], bounds.min[k] + span * r[1]] as const;
  };
  const [x0, x1] = axis('x');
  const [y0, y1] = axis('y');
  const [z0, z1] = axis('z');
  return { min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } };
}

const inside = (b: Bounds, x: number, y: number, z: number) =>
  x >= b.min.x && x <= b.max.x && y >= b.min.y && y <= b.max.y && z >= b.min.z && z <= b.max.z;

/**
 * Triangle indices to keep: those whose centre lies inside the box. `positions` are xyz triples
 * in the same space as the box; `index` is the geometry's index (null = non-indexed). Pure.
 */
export function keptTriangles(
  positions: ArrayLike<number>,
  index: ArrayLike<number> | null,
  box: Bounds,
): number[] {
  const count = index ? index.length : positions.length / 3;
  const vertex = (i: number) => (index ? index[i]! : i);
  const out: number[] = [];
  for (let t = 0; t + 2 < count; t += 3) {
    const a = vertex(t) * 3;
    const b = vertex(t + 1) * 3;
    const c = vertex(t + 2) * 3;
    const cx = (positions[a]! + positions[b]! + positions[c]!) / 3;
    const cy = (positions[a + 1]! + positions[b + 1]! + positions[c + 1]!) / 3;
    const cz = (positions[a + 2]! + positions[b + 2]! + positions[c + 2]!) / 3;
    if (inside(box, cx, cy, cz)) out.push(vertex(t), vertex(t + 1), vertex(t + 2));
  }
  return out;
}
