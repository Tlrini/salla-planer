import { nearestWall, type Hall, type Item, type Wall } from '@salla/shared';

/**
 * Where the lights of a hall go (pure, unit tested). Real lights are expensive, so a hall gets
 * at most MAX_LAMPS of them for the evening and one for the daylight from its windows.
 */
export const MAX_LAMPS = 5;

type V3 = [number, number, number];

/** Evening lights: one per chandelier, otherwise a row of ceiling lights along the hall. */
export function lampPositions(
  hall: Pick<Hall, 'width' | 'length' | 'height'>,
  items: readonly Pick<Item, 'type' | 'x' | 'y'>[],
): V3[] {
  const { width: W, length: L, height: H } = hall;
  const chandeliers = items.filter((i) => i.type === 'chandelier').slice(0, MAX_LAMPS);
  if (chandeliers.length) return chandeliers.map((c) => [c.x, Math.max(1.8, H - 1.6), c.y]);
  const y = Math.max(1.8, H - 0.5);
  const long = Math.max(W, L);
  const count = Math.min(4, Math.max(2, Math.round(long / 8)));
  return Array.from({ length: count }, (_, i): V3 => {
    const t = ((i + 0.5) / count) * long;
    return W >= L ? [t, y, L / 2] : [W / 2, y, t];
  });
}

/** Daylight from the wall with the most windows, reaching across the room; null without any. */
export function windowLight(
  hall: Pick<Hall, 'width' | 'length' | 'height' | 'structure'>,
): { position: V3; target: V3 } | null {
  const byWall = new Map<Wall, Array<Pick<Item, 'x' | 'y'>>>();
  for (const s of hall.structure) {
    if (s.type !== 'window') continue;
    const { wall } = nearestWall(s.x, s.y, hall);
    byWall.set(wall, [...(byWall.get(wall) ?? []), s]);
  }
  let best: Array<Pick<Item, 'x' | 'y'>> = [];
  let side: Wall | null = null;
  for (const [wall, list] of byWall) {
    if (list.length > best.length) {
      best = list;
      side = wall;
    }
  }
  if (!side) return null;
  const x = best.reduce((a, w) => a + w.x, 0) / best.length;
  const y = best.reduce((a, w) => a + w.y, 0) / best.length;
  const z = Math.min(hall.height - 0.3, 2.2);
  const { width: W, length: L } = hall;
  // Just inside the glass, shining down across the room to the far side.
  switch (side) {
    case 'top':
      return { position: [x, z, 0.2], target: [x, 0, L * 0.6] };
    case 'bottom':
      return { position: [x, z, L - 0.2], target: [x, 0, L * 0.4] };
    case 'left':
      return { position: [0.2, z, y], target: [W * 0.6, 0, y] };
    case 'right':
      return { position: [W - 0.2, z, y], target: [W * 0.4, 0, y] };
  }
}
