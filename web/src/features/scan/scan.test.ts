import { describe, expect, it } from 'vitest';
import { photoCountProblem, pickRecorderMime, stepAt, videoExtension } from './capture';
import { cropBounds, FULL_CROP, keptTriangles, MIN_CROP_SPAN, setCropEnd } from './crop';
import { hallFromScan, planImageSize, shellOffset, validHallSize } from './hallFit';

describe('hall from a scan', () => {
  it('scales the scan by the real ceiling height', () => {
    // A scan in centimeters: 2400 × 450 × 1600 with a 4,5 m ceiling.
    expect(hallFromScan({ x: 2400, y: 450, z: 1600 }, 4.5)).toEqual({
      scale: 0.01,
      width: 24,
      length: 16,
      height: 4.5,
    });
  });

  it('refuses sizes the plan cannot hold', () => {
    expect(validHallSize(24, 16)).toBe(true);
    expect(validHallSize(0.3, 16)).toBe(false);
    expect(validHallSize(800, 16)).toBe(false);
  });

  it('keeps the hall proportions in the plan photo', () => {
    expect(planImageSize(24, 16)).toEqual({ w: 2048, h: 1365 });
    expect(planImageSize(10, 30, 900)).toEqual({ w: 300, h: 900 });
    expect(planImageSize(0, 5)).toEqual({ w: 2048, h: 2048 });
  });
});

describe('capture guide', () => {
  it('walks through the two rings, then the details', () => {
    expect(stepAt(0)).toBe('ring1');
    expect(stepAt(39.9)).toBe('ring1');
    expect(stepAt(40)).toBe('ring2');
    expect(stepAt(85)).toBe('details');
  });

  it('guides a hall scan along the walls, the corners, then the middle', () => {
    expect(stepAt(10, 'hall')).toBe('walls');
    expect(stepAt(120, 'hall')).toBe('corners');
    expect(stepAt(200, 'hall')).toBe('middle');
  });

  it('prefers mp4, falls back to webm, and survives a throwing check', () => {
    expect(pickRecorderMime((t) => t.startsWith('video/mp4'))).toBe('video/mp4;codecs=avc1');
    expect(pickRecorderMime((t) => t === 'video/webm')).toBe('video/webm');
    expect(
      pickRecorderMime(() => {
        throw new Error('no MediaRecorder');
      }),
    ).toBeUndefined();
    expect(videoExtension('video/mp4;codecs=avc1')).toBe('mp4');
    expect(videoExtension('video/webm;codecs=vp9')).toBe('webm');
  });

  it('checks the number of photos', () => {
    expect(photoCountProblem(5)).toBe('tooFew');
    expect(photoCountProblem(60)).toBeNull();
    expect(photoCountProblem(500)).toBe('tooMany');
  });
});

describe('crop', () => {
  const bounds = { min: { x: -1, y: 0, z: -2 }, max: { x: 1, y: 2, z: 2 } };

  it('maps fractions to a box in model coordinates', () => {
    expect(cropBounds(bounds, FULL_CROP)).toEqual(bounds);
    expect(cropBounds(bounds, { x: [0.25, 0.75], y: [0, 0.5], z: [0.5, 1] })).toEqual({
      min: { x: -0.5, y: 0, z: 0 },
      max: { x: 0.5, y: 1, z: 2 },
    });
  });

  it('never lets a range collapse or leave 0–1', () => {
    expect(setCropEnd([0, 1], 0, 0.4)).toEqual([0.4, 1]);
    expect(setCropEnd([0.4, 0.5], 0, 0.9)).toEqual([0.5 - MIN_CROP_SPAN, 0.5]);
    expect(setCropEnd([0.4, 0.5], 1, 0.1)).toEqual([0.4, 0.4 + MIN_CROP_SPAN]);
    expect(setCropEnd([0, 1], 1, 7)).toEqual([0, 1]);
    expect(setCropEnd([0.5, 1], 0, -3)).toEqual([0, 1]);
  });

  it('keeps triangles whose centre is inside the box', () => {
    // Triangle A near the origin, triangle B far away on x.
    const positions = [0, 0, 0, 0.2, 0, 0, 0, 0.2, 0, 5, 0, 0, 5.2, 0, 0, 5, 0.2, 0];
    const box = { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } };
    expect(keptTriangles(positions, null, box)).toEqual([0, 1, 2]);
    // Indexed: the same two triangles, listed B first.
    expect(keptTriangles(positions, [3, 4, 5, 0, 1, 2], box)).toEqual([0, 1, 2]);
    expect(keptTriangles(positions, [3, 4, 5], box)).toEqual([]);
  });
});

describe('scanned hall as the 3D shell', () => {
  it('puts the lowest corner of the scaled scan on the origin', () => {
    const min = { x: -1200, y: 10, z: 0 };
    const scale = 0.01;
    const offset = shellOffset(min, scale);
    expect(offset).toEqual({ x: 12, y: -0.1, z: 0 });
    expect(min.x * scale + offset.x).toBeCloseTo(0);
    expect(min.y * scale + offset.y).toBeCloseTo(0);
    expect(min.z * scale + offset.z).toBeCloseTo(0);
  });
});
