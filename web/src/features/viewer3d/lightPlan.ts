import {
  isNaturalGround,
  isOpenAir,
  nearestWall,
  type Hall,
  type Item,
  type Wall,
} from '@salla/shared';

/**
 * Where the lights of a hall go (pure, unit tested). Real lights are expensive, so a hall gets
 * at most MAX_LAMPS of them for the evening and one for the daylight from its windows.
 */
export const MAX_LAMPS = 5;

type V3 = [number, number, number];

/** Evening lights: one per chandelier, otherwise a row of ceiling lights along the hall. */
export function lampPositions(
  hall: Pick<Hall, 'width' | 'length' | 'height' | 'kind' | 'outdoor'>,
  items: readonly (Pick<Item, 'type' | 'x' | 'y'> & Partial<Pick<Item, 'width' | 'depth'>>)[],
): V3[] {
  const { width: W, length: L, height: H } = hall;
  if (isOpenAir(hall)) {
    // No room lights outside: only strings of lights give light from above.
    const out: V3[] = [];
    // Just above the strings, so tent roofs below them don't get a hot spot.
    const y = H + 0.3;
    for (const s of items.filter((i) => i.type === 'ceiling_lights')) {
      const [w, d] = [s.width ?? 0, s.depth ?? 0];
      const long = Math.max(w, d);
      const count = Math.min(4, Math.max(1, Math.round(long / 8)));
      for (let i = 0; i < count && out.length < MAX_LAMPS; i++) {
        const t = ((i + 0.5) / count - 0.5) * long;
        out.push(w >= d ? [s.x + t, y, s.y] : [s.x, y, s.y + t]);
      }
    }
    return out;
  }
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

export type SkyName = 'day' | 'sunset' | 'night';

export const skyName = (evening: boolean, sunset: boolean): SkyName =>
  !evening ? 'day' : sunset ? 'sunset' : 'night';

/**
 * Light of each outdoor sky. Sun height and direction (degrees) are measured from the photos, so
 * shadows fall the way the picture says; `az` is three.js's equirectangular longitude.
 */
export const SKY_LIGHT: Record<
  SkyName,
  {
    elevation: number;
    azimuth: number;
    color: string;
    sun: number;
    sky: string;
    hemisphere: number;
    environment: number;
    background: number;
  }
> = {
  day: {
    elevation: 41,
    azimuth: 36,
    color: '#FFF1DF',
    sun: 3,
    sky: '#DCE8F7',
    hemisphere: 0.8,
    environment: 0.55,
    background: 1,
  },
  sunset: {
    elevation: 14,
    azimuth: 36,
    color: '#FFA868',
    sun: 2.4,
    sky: '#F4CDB0',
    hemisphere: 0.55,
    environment: 0.5,
    background: 1,
  },
  night: {
    elevation: 55,
    azimuth: 120,
    color: '#A9BEEA',
    sun: 0.22,
    sky: '#35445F',
    hemisphere: 0.28,
    environment: 0.05,
    background: 0.22,
  },
};

/** Under a roof the sun only comes in sideways, so it counts for less. */
const ROOFED_SUN = 0.45;
const ROOFED_ENVIRONMENT = 0.7;

export function sunPlan(
  hall: Pick<Hall, 'width' | 'length' | 'height' | 'kind' | 'outdoor'>,
  sky: SkyName,
): { position: V3; color: string; intensity: number; environment: number } {
  const s = SKY_LIGHT[sky];
  const el = (s.elevation * Math.PI) / 180;
  const az = (s.azimuth * Math.PI) / 180;
  const size = Math.max(hall.width, hall.length);
  const dist = size * 1.4 + hall.height;
  const open = isOpenAir(hall);
  return {
    position: [
      hall.width / 2 + Math.cos(el) * Math.cos(az) * dist,
      Math.sin(el) * dist,
      hall.length / 2 + Math.cos(el) * Math.sin(az) * dist,
    ],
    color: s.color,
    intensity: open ? s.sun : s.sun * ROOFED_SUN,
    environment: open ? s.environment : s.environment * ROOFED_ENVIRONMENT,
  };
}

const GROUND_BOUNCE: Partial<Record<Hall['floor'], string>> = {
  bar: '#6E7F4A',
  guri: '#A9A294',
  zhavorr: '#A89E8A',
  rere: '#D9C7A0',
};

/** The colour light has after bouncing off the floor; photo ground has no chosen colour. */
export function bounceColor(hall: Pick<Hall, 'floor' | 'floorColor'>): string {
  return isNaturalGround(hall.floor) ? GROUND_BOUNCE[hall.floor]! : hall.floorColor;
}

/** With a ceiling of lights and no chandeliers, the room takes the colour of those lights. */
export function lampColor(
  items: readonly Pick<Item, 'type' | 'color'>[],
  fallback: string,
): string {
  if (items.some((i) => i.type === 'chandelier')) return fallback;
  return items.find((i) => i.type === 'ceiling_lights')?.color ?? fallback;
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
