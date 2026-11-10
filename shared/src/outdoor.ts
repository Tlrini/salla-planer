import { isCanopy, type P2 } from './canopy.js';
import type { CatalogItem, FloorType, Hall, HallKind, Item } from './schemas.js';

/**
 * Event places that are not a plain room: open air, a tent, a glass pavilion, a scanned outdoor
 * place. Pure rules; the drawing is in web/src/features/viewer3d.
 */
type Place = Pick<Hall, 'kind' | 'outdoor'>;

/** No walls and no ceiling: a garden, a terrace, a beach, a scanned outdoor place. */
export const isOpenAir = (h: Place): boolean =>
  h.kind === 'jashte' || (h.kind === 'skan' && !!h.outdoor);
/** The event itself is outside; a tent is, a glass pavilion is an inside place. */
export const isOutdoor = (h: Place): boolean => isOpenAir(h) || h.kind === 'tende';
/** The sky and the ground around the place can be seen, so the 3D view must show them. */
export const seesSky = (h: Place): boolean =>
  isOutdoor(h) || h.kind === 'xham' || h.kind === 'rotonde';
/** The places built as a frame with poles and a pitched fabric roof. */
export const hasTentFrame = (h: Place): boolean =>
  h.kind === 'tende' || h.kind === 'xham' || h.kind === 'rotonde';
/** The round glass pavilion: its plan is the circle inside the width × length square. */
export const isRound = (h: Pick<Hall, 'kind'>): boolean => h.kind === 'rotonde';

/** Natural ground keeps the colours of its photo; there is no colour to choose. */
const NATURAL = new Set<FloorType>(['bar', 'guri', 'zhavorr', 'rere']);
export const isNaturalGround = (f: FloorType): boolean => NATURAL.has(f);

const INDOOR_FLOORS: FloorType[] = ['parket', 'mermer', 'pllake', 'tapet'];
const OPEN_AIR_GROUNDS: FloorType[] = ['bar', 'guri', 'zhavorr', 'rere', 'pllake', 'parket'];

/** What the floor can be: anything in a tent or a scan, since those stand on any ground. */
export function groundOptions(h: Place): FloorType[] {
  if (h.kind === 'tende' || h.kind === 'skan') return [...OPEN_AIR_GROUNDS, 'mermer', 'tapet'];
  return h.kind === 'jashte' ? OPEN_AIR_GROUNDS : INDOOR_FLOORS;
}

/** The change of a hall to another kind, with a floor that makes sense there. */
export function hallKindPatch(
  hall: Pick<Hall, 'kind' | 'outdoor' | 'floor' | 'tent'> & Partial<Pick<Hall, 'width' | 'length'>>,
  kind: HallKind,
): Partial<Hall> {
  const diameter = Math.max(hall.width ?? 0, hall.length ?? 0);
  const next = { kind, outdoor: hall.outdoor };
  const fits = groundOptions(next).includes(hall.floor);
  const toGarden = kind === 'jashte' && hall.kind !== 'jashte';
  return {
    kind,
    ...(kind === 'tende' ? { tent: hall.tent ?? { openSides: false } } : {}),
    ...(kind === 'rotonde' && diameter > 0 ? { width: diameter, length: diameter } : {}),
    ...(toGarden ? { floor: 'bar' as const } : fits ? {} : { floor: 'parket' as const }),
  };
}

/** Small tents and the like: they stand on the floor but guests and tables go underneath. */
export const COVER_TYPES = new Set(['gazebo', 'pergola', 'parasol']);
export const isCover = (type: string): boolean => COVER_TYPES.has(type);
/** Anything spread above the guests, which must never get in the way of what is below it. */
export const isOverhead = (type: string): boolean => isCanopy(type) || isCover(type);

const NO_OPEN_AIR = new Set(['door', 'window', 'chandelier']);
/** Flat panels that cannot sit on a curved glass wall. */
const NO_ROUND = new Set(['door', 'window']);

/** Catalog entries that make sense at this place. */
export function catalogFor<T extends Pick<CatalogItem, 'id'>>(
  entries: readonly T[],
  h: Place,
): T[] {
  return entries.filter(
    (c) =>
      !(isCover(c.id) && !isOutdoor(h)) &&
      !(NO_OPEN_AIR.has(c.id) && isOpenAir(h)) &&
      !(NO_ROUND.has(c.id) && h.kind === 'rotonde'),
  );
}

/** Items and structure after a place loses its walls and ceiling: everything stands on the floor. */
export function toOpenAirItems(items: readonly Item[]): Item[] {
  return items
    .filter((i) => i.type !== 'door' && i.type !== 'window')
    .map((i) => {
      if (!i.mount || isCanopy(i.type)) return i;
      const copy = { ...i };
      delete copy.mount;
      delete copy.elevation;
      return copy;
    });
}

/** Most distance between the poles that hold up lights or fabric in the open air (m). */
export const CANOPY_POLE_SPACING = 6;

/**
 * Where the poles stand when there is no ceiling (item coordinates): around the edge, and in the
 * middle of a star, where all the arms meet.
 */
export function canopyPoles(item: Pick<Item, 'width' | 'depth' | 'canopy'>): P2[] {
  const hw = item.width / 2;
  const hd = item.depth / 2;
  const nx = Math.max(1, Math.ceil(item.width / CANOPY_POLE_SPACING));
  const nz = Math.max(1, Math.ceil(item.depth / CANOPY_POLE_SPACING));
  const out: P2[] = [];
  for (let i = 0; i <= nx; i++) {
    const x = -hw + (i * item.width) / nx;
    out.push({ x, z: -hd }, { x, z: hd });
  }
  for (let i = 1; i < nz; i++) {
    const z = -hd + (i * item.depth) / nz;
    out.push({ x: -hw, z }, { x: hw, z });
  }
  if (item.canopy?.pattern === 'star') out.push({ x: 0, z: 0 });
  return out;
}
