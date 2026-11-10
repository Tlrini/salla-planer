import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOG, catalogById } from './catalog-defaults.js';
import {
  allowedMounts,
  autoLayoutTables,
  clampToHall,
  fitToRound,
  isWalkable,
  tentPoles,
  walkArea,
  walkTarget,
} from './geometry.js';
import {
  canopyPoles,
  catalogFor,
  groundOptions,
  hallKindPatch,
  hasTentFrame,
  isCover,
  isOpenAir,
  isOutdoor,
  isRound,
  seesSky,
  toOpenAirItems,
} from './outdoor.js';
import type { Item } from './schemas.js';

const item = (over: Partial<Item>): Item => ({
  id: 'a',
  type: 'plant',
  x: 1,
  y: 1,
  rotation: 0,
  width: 1,
  depth: 1,
  color: '#FFFFFF',
  ...over,
});

describe('kinds of place', () => {
  it('tells open air, outdoor, sky and frame apart', () => {
    const rows = [
      { h: {}, open: false, out: false, sky: false, frame: false },
      { h: { kind: 'salle' as const }, open: false, out: false, sky: false, frame: false },
      { h: { kind: 'xham' as const }, open: false, out: false, sky: true, frame: true },
      { h: { kind: 'tende' as const }, open: false, out: true, sky: true, frame: true },
      { h: { kind: 'jashte' as const }, open: true, out: true, sky: true, frame: false },
      { h: { kind: 'skan' as const }, open: false, out: false, sky: false, frame: false },
      {
        h: { kind: 'skan' as const, outdoor: true },
        open: true,
        out: true,
        sky: true,
        frame: false,
      },
    ];
    for (const r of rows) {
      expect([isOpenAir(r.h), isOutdoor(r.h), seesSky(r.h), hasTentFrame(r.h)]).toEqual([
        r.open,
        r.out,
        r.sky,
        r.frame,
      ]);
    }
  });

  it('offers the right floors', () => {
    expect(groundOptions({ kind: 'jashte' })).toEqual(
      expect.arrayContaining(['bar', 'guri', 'zhavorr', 'rere']),
    );
    expect(groundOptions({ kind: 'xham' })).not.toContain('bar');
    expect(groundOptions({})).not.toContain('rere');
    expect(groundOptions({ kind: 'skan' })).toEqual(expect.arrayContaining(['bar', 'mermer']));
  });

  it('picks a floor that fits when the kind changes', () => {
    expect(hallKindPatch({ floor: 'mermer' }, 'jashte').floor).toBe('bar');
    expect(hallKindPatch({ kind: 'jashte', floor: 'bar' }, 'salle').floor).toBe('parket');
    expect(hallKindPatch({ floor: 'parket' }, 'xham').floor).toBeUndefined();
    expect(hallKindPatch({ floor: 'parket' }, 'tende').tent).toEqual({ openSides: false });
  });
});

describe('catalog and mounts by place', () => {
  const catalog = catalogById(DEFAULT_CATALOG);
  const ids = (h: { kind?: 'salle' | 'xham' | 'tende' | 'jashte' }) =>
    catalogFor(DEFAULT_CATALOG, h).map((c) => c.id);

  it('shows covers only outdoors', () => {
    expect(ids({})).not.toContain('gazebo');
    expect(ids({ kind: 'xham' })).not.toContain('parasol');
    expect(ids({ kind: 'jashte' })).toEqual(
      expect.arrayContaining(['gazebo', 'pergola', 'parasol']),
    );
    expect(ids({ kind: 'tende' })).toContain('gazebo');
  });

  it('hides what needs a building in the open air', () => {
    const open = ids({ kind: 'jashte' });
    for (const id of ['door', 'window', 'chandelier']) expect(open).not.toContain(id);
    expect(ids({ kind: 'tende' })).toContain('chandelier');
  });

  it('keeps everything on the floor in the open air, except hung lights', () => {
    const open = { kind: 'jashte' as const };
    expect(allowedMounts(catalog.get('flower_wall'), open)).toEqual(['floor']);
    expect(allowedMounts(catalog.get('ceiling_lights'), open)).toEqual(['ceiling']);
    expect(allowedMounts(catalog.get('flower_stand'), { kind: 'xham' })).toEqual(
      allowedMounts(catalog.get('flower_stand')),
    );
    expect(isCover('gazebo')).toBe(true);
    expect(allowedMounts(catalog.get('gazebo'))).toEqual(['floor']);
  });
});

describe('going to the open air', () => {
  it('brings wall and ceiling items down and removes doors and windows', () => {
    const out = toOpenAirItems([
      item({ id: 'w', mount: 'wall', elevation: 1.2 }),
      item({ id: 'c', mount: 'ceiling' }),
      item({ id: 'l', type: 'ceiling_lights', mount: 'ceiling' }),
      item({ id: 'd', type: 'door' }),
      item({ id: 'x', type: 'window' }),
      item({ id: 'p' }),
    ]);
    expect(out.map((i) => i.id)).toEqual(['w', 'c', 'l', 'p']);
    expect(out[0]).not.toHaveProperty('mount');
    expect(out[0]).not.toHaveProperty('elevation');
    expect(out[1]).not.toHaveProperty('mount');
    expect(out[2]!.mount).toBe('ceiling');
  });
});

describe('poles for lights in the open air', () => {
  it('stands around the edge, at most 6 m apart', () => {
    const poles = canopyPoles({ width: 12, depth: 6 });
    expect(poles).toHaveLength(6);
    for (const p of poles) {
      expect(Math.abs(p.x) === 6 || Math.abs(p.z) === 3).toBe(true);
    }
    expect(canopyPoles({ width: 30, depth: 20 })).toHaveLength(2 * 6 + 2 * 3);
  });

  it('adds one in the middle of a star', () => {
    const poles = canopyPoles({ width: 6, depth: 6, canopy: { pattern: 'star', spacing: 12 } });
    expect(poles).toContainEqual({ x: 0, z: 0 });
    expect(poles).toHaveLength(5);
  });
});

describe('the round glass pavilion', () => {
  const catalog = catalogById(DEFAULT_CATALOG);
  const hall = {
    name: 'R',
    width: 20,
    length: 20,
    height: 4,
    floor: 'parket' as const,
    floorColor: '#FFFFFF',
    wallColor: '#FFFFFF',
    structure: [],
    kind: 'rotonde' as const,
  };
  const off = (p: { x: number; y: number }) => Math.hypot(p.x - 10, p.y - 10);

  it('is an inside place that sees the sky and has a frame', () => {
    expect(isRound(hall)).toBe(true);
    expect(seesSky(hall)).toBe(true);
    expect(isOutdoor(hall)).toBe(false);
    expect(hasTentFrame(hall)).toBe(true);
    expect(groundOptions(hall)).not.toContain('bar');
  });

  it('becomes a circle as wide as the longer side', () => {
    const patch = hallKindPatch({ width: 30, length: 18, floor: 'parket' }, 'rotonde');
    expect([patch.width, patch.length]).toEqual([30, 30]);
  });

  it('has no doors, windows or wall decor', () => {
    const ids = catalogFor(DEFAULT_CATALOG, hall).map((c) => c.id);
    expect(ids).not.toContain('door');
    expect(ids).not.toContain('window');
    expect(allowedMounts(catalog.get('flower_stand'), hall)).not.toContain('wall');
  });

  it('keeps items inside the circle, chairs included', () => {
    const cat = catalog.get('table_round_10')!;
    const table = item({
      type: 'table_round_10',
      x: 19.5,
      y: 19.5,
      width: cat.width,
      depth: cat.width,
    });
    const at = clampToHall(table, hall, cat);
    expect(off(at)).toBeLessThan(10 - cat.width / 2);
    const inside = item({ x: 12, y: 11 });
    expect(clampToHall(inside, hall, catalog.get('plant'))).toEqual({ x: 12, y: 11 });
  });

  it('puts a full round ceiling in the middle', () => {
    const at = clampToHall(
      item({
        type: 'ceiling_lights',
        x: 3,
        y: 3,
        width: 20,
        depth: 20,
        canopy: { pattern: 'star', spacing: 12, round: true },
      }),
      hall,
      catalog.get('ceiling_lights'),
    );
    expect(at).toEqual({ x: 10, y: 10 });
  });

  it('stands its poles evenly on the circle', () => {
    const poles = tentPoles(hall);
    expect(poles.length).toBe(13);
    for (const p of poles) expect(off(p)).toBeCloseTo(9.92, 1);
  });

  it('moves items to the centre of a new circle and off the walls', () => {
    const out = fitToRound(
      [
        item({ id: 'c', x: 15, y: 9 }),
        item({ id: 'w', x: 1, y: 1, mount: 'wall', elevation: 1 }),
        item({ id: 'd', type: 'door' }),
        item({
          id: 'l',
          type: 'ceiling_lights',
          x: 15,
          y: 9,
          width: 30,
          depth: 18,
          mount: 'ceiling',
          canopy: { pattern: 'rows', spacing: 1 },
        }),
      ],
      { width: 30, length: 18 },
      { width: 30, length: 30, kind: 'rotonde' },
      catalog,
    );
    expect(out.map((i) => i.id)).toEqual(['c', 'w', 'l']);
    expect([out[0]!.x, out[0]!.y]).toEqual([15, 15]);
    expect(out[1]).not.toHaveProperty('mount');
    expect(Math.hypot(out[1]!.x - 15, out[1]!.y - 15)).toBeLessThanOrEqual(15);
    expect(out[2]!.canopy!.round).toBe(true);
    expect([out[2]!.x, out[2]!.y]).toEqual([15, 15]);
  });

  it('lays tables out only inside the circle', () => {
    const cat = catalog.get('table_round_10')!;
    const spots = autoLayoutTables('table_round_10', 60, hall, [], catalog);
    expect(spots.length).toBeGreaterThan(4);
    for (const p of spots) expect(off(p)).toBeLessThan(10 - cat.width / 2);
  });

  it('stops walkers at the curved wall', () => {
    const area = walkArea(hall, [], catalog);
    expect(isWalkable({ x: 10, y: 10 }, area)).toBe(true);
    expect(isWalkable({ x: 1, y: 1 }, area)).toBe(false);
    const q = walkTarget({ x: 0.5, y: 0.5 }, area)!;
    expect(isWalkable(q, area)).toBe(true);
  });
});
