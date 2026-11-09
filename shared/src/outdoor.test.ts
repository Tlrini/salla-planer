import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOG, catalogById } from './catalog-defaults.js';
import { allowedMounts } from './geometry.js';
import {
  canopyPoles,
  catalogFor,
  groundOptions,
  hallKindPatch,
  hasTentFrame,
  isCover,
  isOpenAir,
  isOutdoor,
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
