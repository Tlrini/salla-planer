import { describe, expect, it } from 'vitest';
import {
  failureText,
  framesPerSecond,
  jpegName,
  pickEvenly,
  pickMeshOutput,
  reconstructProgress,
  rewriteMtl,
  simplifyRatio,
} from './plan';

describe('scan worker plan', () => {
  it('chooses a frame rate that gives about 200 frames', () => {
    expect(framesPerSecond(60)).toBe(2);
    expect(framesPerSecond(100)).toBe(2);
    expect(framesPerSecond(200)).toBe(1);
    expect(framesPerSecond(400)).toBe(0.5);
    expect(framesPerSecond(null)).toBe(2);
    expect(framesPerSecond(Number.NaN)).toBe(2);
  });

  it('picks frames evenly, first and last included', () => {
    const frames = Array.from({ length: 10 }, (_, i) => i);
    expect(pickEvenly(frames, 20)).toEqual(frames);
    expect(pickEvenly(frames, 4)).toEqual([0, 3, 6, 9]);
    expect(pickEvenly(frames, 1)).toEqual([0]);
    expect(pickEvenly(frames, 0)).toEqual([]);
  });

  it('shows rising but never finished progress during reconstruction', () => {
    const expected = 20 * 60_000;
    expect(reconstructProgress(0, expected)).toBe(10);
    const half = reconstructProgress(expected / 2, expected);
    const full = reconstructProgress(expected, expected);
    const late = reconstructProgress(expected * 5, expected);
    expect(half).toBeGreaterThan(10);
    expect(full).toBeGreaterThan(half);
    expect(late).toBeLessThanOrEqual(88);
  });

  it('simplifies only large meshes', () => {
    expect(simplifyRatio(100_000, 150_000)).toBe(1);
    expect(simplifyRatio(600_000, 150_000)).toBe(0.25);
    expect(simplifyRatio(1e9, 150_000)).toBe(0.01);
  });

  it('finds the textured mesh among the outputs', () => {
    expect(pickMeshOutput(['texture_1001.exr', 'texturedMesh.obj', 'mesh.obj'])).toEqual({
      file: 'texturedMesh.obj',
      kind: 'obj',
    });
    expect(pickMeshOutput(['a.obj', 'b.gltf'])).toEqual({ file: 'b.gltf', kind: 'gltf' });
    expect(pickMeshOutput(['cameras.sfm'])).toBeNull();
  });

  it('renames textures in the material file', () => {
    expect(jpegName('texture_1001.exr')).toBe('texture_1001.jpg');
    expect(jpegName('a.PNG')).toBe('a.jpg');
    const mtl = 'newmtl TextureAtlas_1001\nmap_Kd texture_1001.exr\n';
    expect(rewriteMtl(mtl, { 'texture_1001.exr': 'texture_1001.jpg' })).toBe(
      'newmtl TextureAtlas_1001\nmap_Kd texture_1001.jpg\n',
    );
  });

  it('keeps failure texts short and on one line', () => {
    expect(failureText(new Error('meshroom\nexited with 1'))).toBe('meshroom exited with 1');
    expect(failureText('x'.repeat(900))).toHaveLength(480);
    expect(failureText('')).toBe('unknown error');
  });
});
