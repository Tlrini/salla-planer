import { describe, expect, it } from 'vitest';
import type { Item } from '@salla/shared';
import { itemBox, pickBox, rayAtHeight, rayBoxDistance, type Ray3 } from './picking';

const item = (over: Partial<Item>): Item => ({
  id: 't1',
  type: 'table_rect',
  x: 5,
  y: 3,
  rotation: 0,
  width: 2.4,
  depth: 0.9,
  color: '#FFFFFF',
  ...over,
});
const down = (x: number, z: number): Ray3 => ({
  origin: { x, y: 10, z },
  direction: { x: 0, y: -1, z: 0 },
});

describe('3D picking', () => {
  it('boxes stand on their support and hang chandeliers from the ceiling', () => {
    const table = itemBox(item({ height: 0.75 }), undefined, 0, 5);
    expect(table.center).toEqual({ x: 5, y: 0.375, z: 3 });
    expect(table.half).toEqual({ x: 1.2, y: 0.375, z: 0.45 });
    const onTable = itemBox(item({ height: 0.5 }), undefined, 0.75, 5);
    expect(onTable.center.y).toBeCloseTo(1);
    const chandelier = itemBox(item({ type: 'chandelier', height: 1 }), undefined, 0, 5);
    expect(chandelier.center.y + chandelier.half.y).toBeCloseTo(5);
    expect(chandelier.center.y - chandelier.half.y).toBeCloseTo(5 - 1.2 - 1);
  });

  it('hits a box from above and misses next to it', () => {
    const box = itemBox(item({ height: 0.75 }), undefined, 0, 5);
    expect(rayBoxDistance(down(5, 3), box)).toBeCloseTo(10 - 0.75);
    expect(rayBoxDistance(down(6.1, 3), box)).not.toBeNull();
    expect(rayBoxDistance(down(6.3, 3), box)).toBeNull();
  });

  it('respects the rotation (90° turns a long table across)', () => {
    const turned = itemBox(item({ height: 0.75, rotation: 90 }), undefined, 0, 5);
    // Along plan x the table is now only 0.9 m wide, along plan y 2.4 m long.
    expect(rayBoxDistance(down(5.6, 3), turned)).toBeNull();
    expect(rayBoxDistance(down(5, 4.1), turned)).not.toBeNull();
  });

  it('picks the nearest box: the centerpiece on top of the table', () => {
    const table = itemBox(item({ height: 0.75 }), undefined, 0, 5);
    const decor = itemBox(
      item({ id: 'c1', type: 'centerpiece', width: 0.4, depth: 0.4, height: 0.5 }),
      undefined,
      0.75,
      5,
    );
    const hit = pickBox(down(5, 3), [table, decor]);
    expect(hit?.id).toBe('c1');
    expect(hit?.point.y).toBeCloseTo(1.25);
    expect(pickBox(down(20, 20), [table, decor])).toBeNull();
  });

  it('finds where a slanted ray meets the floor', () => {
    const ray: Ray3 = { origin: { x: 0, y: 2, z: 0 }, direction: { x: 1, y: -1, z: 0.5 } };
    expect(rayAtHeight(ray, 0)).toEqual({ x: 2, y: 1 });
    expect(rayAtHeight(ray, 5)).toBeNull();
    expect(
      rayAtHeight({ origin: { x: 0, y: 1, z: 0 }, direction: { x: 1, y: 0, z: 0 } }, 0),
    ).toBeNull();
  });
});
