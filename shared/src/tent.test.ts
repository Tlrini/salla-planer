import { describe, expect, it } from 'vitest';
import { isTentPole, TENT_BAY, tentPoles, tentRoof } from './geometry.js';
import { scanExpectedMinutes, scanMinutesLeft } from './scans.js';

describe('tent', () => {
  const hall = { width: 30, length: 15, height: 3 };

  it('runs the ridge along the longer side with a 20° pitch', () => {
    const roof = tentRoof(hall);
    expect(roof).toMatchObject({ alongX: true, len: 30, span: 15 });
    expect(roof.rise).toBeCloseTo(7.5 * Math.tan((20 * Math.PI) / 180), 5);
    expect(tentRoof({ width: 10, length: 20 })).toMatchObject({ alongX: false, len: 20, span: 10 });
  });

  it('puts poles around the edge, at most one bay apart, inside the hall', () => {
    const poles = tentPoles(hall);
    // 30 m = 6 bays → 7 poles on each long side; 15 m = 3 bays → 2 more on each end.
    expect(poles).toHaveLength(7 * 2 + 2 * 2);
    expect(new Set(poles.map((p) => p.id)).size).toBe(poles.length);
    for (const p of poles) {
      expect(isTentPole(p)).toBe(true);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(hall.width);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(hall.length);
    }
    const side = poles
      .filter((p) => p.y < 1)
      .map((p) => p.x)
      .sort((a, b) => a - b);
    for (let i = 1; i < side.length; i++)
      expect(side[i]! - side[i - 1]!).toBeLessThanOrEqual(TENT_BAY);
    // Nothing stands in the middle of the span.
    expect(poles.filter((p) => p.x > 1 && p.x < 29 && p.y > 1 && p.y < 14)).toEqual([]);
  });

  it('makes end poles reach the roof above them', () => {
    const poles = tentPoles(hall);
    const ends = poles.filter((p) => p.x < 1 && p.y > 1 && p.y < 14);
    const { rise } = tentRoof(hall);
    expect(ends.every((p) => p.height! > hall.height)).toBe(true);
    expect(Math.max(...ends.map((p) => p.height!))).toBeLessThanOrEqual(hall.height + rise);
    expect(poles.filter((p) => p.y < 1).every((p) => p.height === hall.height)).toBe(true);
  });
});

describe('scan time estimates', () => {
  it('expects a quick scan to be shorter, a hall to be longer', () => {
    expect(scanExpectedMinutes('quick', 'decor')).toBeLessThan(
      scanExpectedMinutes('detailed', 'decor'),
    );
    expect(scanExpectedMinutes('quick', 'hall')).toBeGreaterThan(
      scanExpectedMinutes('quick', 'decor'),
    );
  });

  it('counts down with the progress', () => {
    const job = { quality: 'quick', purpose: 'decor' } as const;
    expect(scanMinutesLeft({ ...job, status: 'queued', progress: 0 })).toBe(12);
    expect(scanMinutesLeft({ ...job, status: 'processing', progress: 50 })).toBe(6);
    expect(scanMinutesLeft({ ...job, status: 'processing', progress: 99 })).toBe(1);
    expect(scanMinutesLeft({ ...job, status: 'ready', progress: 100 })).toBeNull();
  });
});
