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

describe('eye-level poses (Beta 3)', () => {
  it('yaw 0 looks up the plan, 90 to the right; pitch follows the height', async () => {
    const { poseLookingAt, yawDirection } = await import('./cameras');
    expect(poseLookingAt(5, 5, [5, 1.6, 1]).yaw).toBeCloseTo(0);
    expect(poseLookingAt(5, 5, [9, 1.6, 5]).yaw).toBeCloseTo(90);
    expect(poseLookingAt(5, 5, [5, 5.6, 1]).pitch).toBeCloseTo(45);
    const d = yawDirection(90);
    expect(d.x).toBeCloseTo(1);
    expect(d.y).toBeCloseTo(0);
  });

  it('derives viewpoints in front of the head table and the stage', async () => {
    const { autoViewpoints } = await import('./cameras');
    const hall = EXAMPLE_HALLS[0]!.hall;
    const head = {
      id: 'h',
      type: 'table_head',
      x: 15,
      y: 4,
      rotation: 0,
      width: 3,
      depth: 0.8,
      color: '#FFFFFF',
    };
    const stage = {
      id: 's',
      type: 'stage',
      x: 15,
      y: 1.6,
      rotation: 0,
      width: 6,
      depth: 3,
      color: '#FFFFFF',
    };
    const views = autoViewpoints(hall, [head, stage]);
    expect(views.map((v) => v.key)).toEqual(['entrance', 'headTable', 'stage']);
    const h = views.find((v) => v.key === 'headTable')!.pose;
    expect(h.x).toBeCloseTo(15);
    expect(h.y).toBeCloseTo(7.4);
    expect(Math.abs(h.yaw)).toBeCloseTo(0); // looking back up the plan at the couple
  });
});

describe('ceiling view', () => {
  it('stands inside the hall and looks up at the ceiling', () => {
    const hall = {
      width: 20,
      length: 12,
      height: 4,
      structure: [],
    } as unknown as (typeof EXAMPLE_HALLS)[number]['hall'];
    const { position, target } = cameraFor('ceiling', hall, []);
    expect(position[1]).toBeLessThan(target[1]);
    expect(target[1]).toBe(4);
    expect(position[0]).toBeGreaterThan(0);
    expect(position[2]).toBeLessThan(12);
  });
});
