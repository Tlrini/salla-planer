import { describe, expect, it } from 'vitest';
import {
  bounceColor,
  lampColor,
  lampPositions,
  MAX_LAMPS,
  skyName,
  sunPlan,
  windowLight,
} from './lightPlan';

const hall = { width: 30, length: 18, height: 5, structure: [] };

describe('lampPositions', () => {
  it('puts one light at each chandelier, at most MAX_LAMPS', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ type: 'chandelier', x: i, y: 3 }));
    const lamps = lampPositions(hall, items);
    expect(lamps).toHaveLength(MAX_LAMPS);
    expect(lamps[1]).toEqual([1, 3.4, 3]);
  });
  it('uses a row of ceiling lights without chandeliers, along the longer side', () => {
    const lamps = lampPositions(hall, [{ type: 'stage', x: 1, y: 1 }]);
    expect(lamps).toHaveLength(4);
    expect(lamps.every(([, y, z]) => y === 4.5 && z === 9)).toBe(true);
    expect(lamps[0]![0]).toBeLessThan(lamps[3]![0]);
    const narrow = lampPositions({ width: 10, length: 20, height: 3 }, []);
    expect(narrow.every(([x]) => x === 5)).toBe(true);
  });
  it('keeps the lights reachable in a very low hall', () => {
    expect(lampPositions({ width: 8, length: 8, height: 2 }, [])[0]![1]).toBe(1.8);
  });
});

describe('windowLight', () => {
  const win = (x: number, y: number) => ({
    id: `w${x}${y}`,
    type: 'window',
    x,
    y,
    rotation: 0,
    width: 2,
    depth: 0.15,
    color: '#FFFFFF',
  });
  it('is null without windows', () => {
    expect(windowLight(hall)).toBeNull();
  });
  it('comes from the wall with the most windows and shines across the room', () => {
    const light = windowLight({ ...hall, structure: [win(10, 0.1), win(20, 0.1), win(29.9, 9)] });
    expect(light).toEqual({ position: [15, 2.2, 0.2], target: [15, 0, 18 * 0.6] });
  });
  it('stays below a low ceiling', () => {
    const light = windowLight({ ...hall, height: 2.4, structure: [win(29.9, 9)] });
    expect(light!.position[1]).toBeCloseTo(2.1);
    expect(light!.position[0]).toBeCloseTo(29.8);
  });
});

describe('lampColor', () => {
  const lights = { type: 'ceiling_lights', color: '#AACCFF' };
  it('takes the colour of a ceiling of lights', () => {
    expect(lampColor([lights], '#FFE2B0')).toBe('#AACCFF');
  });
  it('keeps the warm lamps with chandeliers or without ceiling lights', () => {
    expect(lampColor([lights, { type: 'chandelier', color: '#FFFFFF' }], '#FFE2B0')).toBe(
      '#FFE2B0',
    );
    expect(lampColor([], '#FFE2B0')).toBe('#FFE2B0');
  });
});

describe('outdoor light', () => {
  const garden = { width: 30, length: 20, height: 4, kind: 'jashte' as const };
  const glass = { ...garden, kind: 'xham' as const };

  it('names the sky from the two switches', () => {
    expect(skyName(false, true)).toBe('day');
    expect(skyName(true, true)).toBe('sunset');
    expect(skyName(true, false)).toBe('night');
  });

  it('keeps the sun above the ground and lowest at sunset', () => {
    const [day, sunset] = [sunPlan(garden, 'day'), sunPlan(garden, 'sunset')];
    expect(sunset.position[1]).toBeGreaterThan(0);
    expect(sunset.position[1]).toBeLessThan(day.position[1]);
    expect(sunPlan(garden, 'night').intensity).toBeLessThan(day.intensity / 5);
  });

  it('gives a roofed place less direct sun', () => {
    expect(sunPlan(glass, 'day').intensity).toBeLessThan(sunPlan(garden, 'day').intensity);
  });

  it('has no hidden room lamps in the open air', () => {
    expect(lampPositions(garden, [])).toEqual([]);
    expect(lampPositions(garden, [{ type: 'plant', x: 1, y: 1 }])).toEqual([]);
    expect(lampPositions(glass, []).length).toBeGreaterThan(0);
  });

  it('puts lamps under strings of lights, within the limit', () => {
    const strings = { type: 'ceiling_lights', x: 15, y: 10, width: 24, depth: 10 };
    const lamps = lampPositions(garden, [strings]);
    expect(lamps).toHaveLength(3);
    for (const l of lamps) expect(Math.abs(l[0] - 15)).toBeLessThan(12);
    expect(lampPositions(garden, [strings, strings, strings]).length).toBeLessThanOrEqual(
      MAX_LAMPS,
    );
  });

  it('bounces the colour of the ground, chosen or natural', () => {
    expect(bounceColor({ floor: 'bar', floorColor: '#FFFFFF' })).not.toBe('#FFFFFF');
    expect(bounceColor({ floor: 'parket', floorColor: '#123456' })).toBe('#123456');
  });
});
