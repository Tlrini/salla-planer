import { describe, expect, it } from 'vitest';
import { EXAMPLE_HALLS, type Item } from '@salla/shared';
import { cameraFor } from './cameras';

const hall = EXAMPLE_HALLS[0]!.hall; // 30 x 18 x 5, door at the bottom wall (y = 17.925)

describe('cameraFor', () => {
  it('top: straight above the hall center', () => {
    const c = cameraFor('top', hall, []);
    expect(c.target).toEqual([15, 0, 9]);
    expect(c.position[0]).toBe(15);
    expect(c.position[1]).toBeGreaterThan(hall.height * 3);
  });
  it('perspective: above the floor and outside the hall', () => {
    const c = cameraFor('perspective', hall, []);
    expect(c.position[1]).toBeGreaterThan(hall.height);
    expect(c.position[2]).toBeGreaterThan(hall.length);
  });
  it('entrance: eye level just inside the door, looking at the stage', () => {
    const stage: Item = {
      id: 's',
      type: 'stage',
      x: 15,
      y: 2,
      rotation: 0,
      width: 6,
      depth: 3,
      color: '#000000',
    };
    const c = cameraFor('entrance', hall, [stage]);
    expect(c.position[1]).toBe(1.6);
    expect(c.position[2]).toBeCloseTo(17.925 - 1.2);
    expect(c.target).toEqual([15, 1.2, 2]);
  });
});
