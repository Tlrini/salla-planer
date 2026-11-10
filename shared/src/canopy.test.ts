import { describe, expect, it } from 'vitest';
import {
  canopyLights,
  canopyPanels,
  canopySettings,
  canopyStrands,
  defaultCanopy,
  isCanopy,
  MAX_CANOPY_LIGHTS,
  maxCanopySag,
  sagAt,
} from './canopy.js';
import { DEFAULT_CATALOG, catalogById } from './catalog-defaults.js';
import { allowedMounts } from './geometry.js';

const item = (over: object) => ({ type: 'ceiling_lights', width: 20, depth: 10, ...over });
const rows = (spacing: number) => ({ pattern: 'rows' as const, spacing });
const star = (spacing: number) => ({ pattern: 'star' as const, spacing });

describe('canopy settings', () => {
  it('recognises the two types, which only go on the ceiling', () => {
    const catalog = catalogById(DEFAULT_CATALOG);
    for (const id of ['ceiling_lights', 'ceiling_drape']) {
      expect(isCanopy(id)).toBe(true);
      expect(allowedMounts(catalog.get(id))).toEqual(['ceiling']);
      expect(catalog.get(id)!.resizable).toBe('both');
    }
    expect(isCanopy('light_curtain')).toBe(false);
  });

  it('starts lights in rows and fabric as a star', () => {
    expect(defaultCanopy('ceiling_lights').pattern).toBe('rows');
    expect(defaultCanopy('ceiling_drape').pattern).toBe('star');
  });

  it('keeps the spacing in range', () => {
    expect(canopySettings(item({ canopy: rows(0.01) })).spacing).toBe(0.3);
    expect(canopySettings(item({ canopy: rows(99) })).spacing).toBe(5);
    expect(canopySettings(item({ canopy: star(2) })).spacing).toBe(6);
    expect(canopySettings(item({ canopy: star(24.4) })).spacing).toBe(24);
  });
});

describe('canopy strands', () => {
  it('runs rows along the longer side, centered, inside the area', () => {
    const strands = canopyStrands(item({ canopy: rows(2) }));
    expect(strands).toHaveLength(5);
    for (const s of strands) {
      expect([s.a.x, s.b.x]).toEqual([-10, 10]);
      expect(Math.abs(s.a.z)).toBeLessThan(5);
    }
    expect(strands.reduce((sum, s) => sum + s.a.z, 0)).toBeCloseTo(0);
    const tall = canopyStrands(item({ width: 6, depth: 12, canopy: rows(2) }));
    expect(tall[0]!.a.z).toBe(-6);
  });

  it('always has at least one row, even in a narrow strip', () => {
    expect(canopyStrands(item({ width: 8, depth: 0.5, canopy: rows(2) }))).toHaveLength(1);
  });

  it('sends star arms from the center to the edge of the area', () => {
    const strands = canopyStrands(item({ canopy: star(12) }));
    expect(strands).toHaveLength(12);
    for (const s of strands) {
      expect(s.a).toEqual({ x: 0, z: 0 });
      const onEdge = Math.abs(Math.abs(s.b.x) - 10) < 1e-6 || Math.abs(Math.abs(s.b.z) - 5) < 1e-6;
      expect(onEdge).toBe(true);
      expect(Math.abs(s.b.x)).toBeLessThanOrEqual(10 + 1e-6);
      expect(Math.abs(s.b.z)).toBeLessThanOrEqual(5 + 1e-6);
    }
  });
});

describe('canopy panels', () => {
  it('makes one strip per row, with a small gap', () => {
    const panels = canopyPanels(item({ canopy: rows(2) }));
    expect(panels).toHaveLength(5);
    const [p] = panels;
    expect(p!.a2.z - p!.a1.z).toBeCloseTo(2 * 0.96);
  });

  it('makes wedges that meet at the center and close the circle', () => {
    const panels = canopyPanels(item({ canopy: star(8) }));
    expect(panels).toHaveLength(8);
    for (let i = 0; i < 8; i++) {
      expect(panels[i]!.a1).toEqual({ x: 0, z: 0 });
      expect(panels[i]!.b2.x).toBeCloseTo(panels[(i + 1) % 8]!.b1.x);
      expect(panels[i]!.b2.z).toBeCloseTo(panels[(i + 1) % 8]!.b1.z);
    }
  });
});

describe('hanging and lights', () => {
  it('hangs lowest in the middle and is fixed at both ends', () => {
    expect(sagAt(0, 0.5)).toBe(0);
    expect(sagAt(1, 0.5)).toBe(0);
    expect(sagAt(0.5, 0.5)).toBe(0.5);
  });

  it('places bulbs along each strand, following the curve', () => {
    const lights = canopyLights([{ a: { x: 0, z: 0 }, b: { x: 2, z: 0 } }], 0.4, 0.5);
    expect(lights).toHaveLength(5);
    expect(lights[2]).toEqual({ x: 1, y: 0.4, z: 0 });
    expect(lights[0]!.y).toBe(0);
  });

  it('spreads bulbs further apart in a huge canopy instead of drawing too many', () => {
    const strands = canopyStrands(item({ width: 100, depth: 100, canopy: rows(0.3) }));
    const lights = canopyLights(strands, 0.5);
    expect(lights.length).toBeLessThanOrEqual(MAX_CANOPY_LIGHTS);
    expect(lights.length).toBeGreaterThan(MAX_CANOPY_LIGHTS * 0.8);
  });

  it('leaves room to walk underneath', () => {
    expect(maxCanopySag(4)).toBeCloseTo(1.7);
    expect(maxCanopySag(2.2)).toBe(0.1);
  });
});

describe('canopy under a round roof', () => {
  const round = (c: object) => item({ width: 20, depth: 20, canopy: { ...c, round: true } });

  it('ends every star arm on the circle', () => {
    for (const s of canopyStrands(round(star(16)))) {
      expect(Math.hypot(s.b.x, s.b.z)).toBeCloseTo(10);
    }
  });

  it('cuts rows at the circle, longest in the middle', () => {
    const strands = canopyStrands(round(rows(2)));
    for (const s of strands) {
      expect(Math.hypot(s.a.x, s.a.z)).toBeCloseTo(10);
      expect(Math.hypot(s.b.x, s.b.z)).toBeCloseTo(10);
    }
    const lengths = strands.map((s) => s.b.x - s.a.x);
    expect(Math.max(...lengths)).toBeCloseTo(lengths[Math.floor(lengths.length / 2)]!);
  });

  it('keeps fabric inside the circle', () => {
    for (const p of canopyPanels(round(rows(2)))) {
      for (const c of [p.a1, p.a2, p.b1, p.b2]) {
        expect(Math.hypot(c.x, c.z)).toBeLessThanOrEqual(10 + 1e-6);
      }
    }
  });
});
