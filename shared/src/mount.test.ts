import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOG, catalogById } from './catalog-defaults.js';
import type { Item } from './schemas.js';
import {
  allowedMounts,
  baseHeight,
  clampElevation,
  clampToHall,
  defaultElevation,
  mountPatch,
  overlappingPairs,
  walkArea,
  wallPlacement,
} from './geometry.js';

const catalog = catalogById(DEFAULT_CATALOG);
const hall = { width: 20, length: 12, height: 4, structure: [] };
const item = (over: Partial<Item>): Item => ({
  id: 'i1',
  type: 'flower_wall',
  x: 10,
  y: 6,
  rotation: 0,
  width: 3,
  depth: 0.3,
  color: '#FFFFFF',
  ...over,
});

describe('allowedMounts', () => {
  it('lets decor go on walls and the ceiling', () => {
    expect(allowedMounts(catalog.get('flower_wall'))).toEqual(['floor', 'wall', 'ceiling']);
    expect(allowedMounts(catalog.get('balloon_cluster'))).toEqual(['floor', 'wall', 'ceiling']);
  });
  it('keeps furniture, floors, structure and the chandelier on the floor', () => {
    for (const id of ['table_round_10', 'chair', 'dance_floor', 'stage', 'door', 'chandelier'])
      expect(allowedMounts(catalog.get(id))).toEqual(['floor']);
    expect(allowedMounts(undefined)).toEqual(['floor']);
  });
});

describe('wallPlacement', () => {
  it('presses the item against the nearest wall, facing the room', () => {
    expect(wallPlacement(item({ x: 8, y: 1 }), hall)).toEqual({ x: 8, y: 0.15, rotation: 0 });
    expect(wallPlacement(item({ x: 8, y: 11 }), hall)).toEqual({ x: 8, y: 11.85, rotation: 180 });
    expect(wallPlacement(item({ x: 0.5, y: 6 }), hall)).toEqual({ x: 0.15, y: 6, rotation: 270 });
    expect(wallPlacement(item({ x: 19, y: 6 }), hall)).toEqual({ x: 19.85, y: 6, rotation: 90 });
  });
  it('keeps the whole width on the wall', () => {
    expect(wallPlacement(item({ x: 0.2, y: 0.1 }), hall, 'top').x).toBe(1.5);
    expect(wallPlacement(item({ x: 19.9, y: 0.1 }), hall, 'top').x).toBe(18.5);
  });
  it('is what clampToHall does for wall items', () => {
    expect(clampToHall(item({ mount: 'wall', x: 7, y: 2 }), hall)).toEqual({
      x: 7,
      y: 0.15,
      rotation: 0,
    });
  });
});

describe('heights', () => {
  it('hangs new wall items with their middle at eye height, under the ceiling', () => {
    expect(defaultElevation(1, 4)).toBe(1.1);
    expect(defaultElevation(3, 4)).toBe(0.1);
    // Too tall to center at eye height: it stands on the floor.
    expect(defaultElevation(3.5, 4)).toBe(0);
    expect(defaultElevation(5, 4)).toBe(0);
    expect(clampElevation(9, 2.6, 4)).toBe(1.4);
    expect(clampElevation(-1, 2.6, 4)).toBe(0);
  });
  it('gives the bottom of floor, wall and ceiling items', () => {
    const items: Item[] = [];
    expect(baseHeight(item({}), items, catalog, 4)).toBe(0);
    expect(baseHeight(item({ mount: 'wall', elevation: 0.8 }), items, catalog, 4)).toBe(0.8);
    // flower_wall is 2.6 m high: on a 4 m ceiling its top touches the ceiling.
    expect(baseHeight(item({ mount: 'ceiling' }), items, catalog, 4)).toBeCloseTo(1.4);
    expect(baseHeight(item({ mount: 'ceiling', height: 0.5 }), items, catalog, 4)).toBe(3.5);
  });
});

describe('mountPatch', () => {
  it('moves an item to a wall, to the ceiling and back to the floor', () => {
    const onWall = mountPatch(item({ x: 6, y: 2 }), 'wall', hall, catalog);
    expect(onWall).toMatchObject({ mount: 'wall', x: 6, y: 0.15, rotation: 0 });
    expect(onWall.elevation).toBeCloseTo(0.3);
    const wallItem = { ...item({}), ...onWall };
    const up = mountPatch(wallItem, 'ceiling', hall, catalog, { x: 9, y: 5 });
    expect(up).toEqual({ mount: 'ceiling', elevation: undefined, x: 9, y: 5 });
    const down = mountPatch({ ...wallItem, ...up }, 'floor', hall, catalog);
    expect(down).toEqual({ mount: undefined, elevation: undefined, x: 9, y: 5 });
  });
  it('uses the wished wall and height', () => {
    const p = mountPatch(item({}), 'wall', hall, catalog, {
      x: 0.1,
      y: 0.1,
      elevation: 1,
      wall: 'left',
    });
    expect(p).toMatchObject({ mount: 'wall', elevation: 1, x: 0.15, rotation: 270, y: 1.5 });
  });
});

describe('mounted items on the plan', () => {
  it('never overlap floor items and never block walking', () => {
    const table: Item = { ...item({ id: 't', type: 'table_round_10', width: 1.8, depth: 1.8 }) };
    const hanging = item({
      id: 'h',
      type: 'balloon_cluster',
      width: 1,
      depth: 1,
      mount: 'ceiling',
    });
    expect(overlappingPairs([table, hanging], catalog)).toEqual([]);
    expect(walkArea(hall, [hanging], catalog).obstacles).toEqual([]);
    expect(walkArea(hall, [table], catalog).obstacles).toHaveLength(1);
  });
});
