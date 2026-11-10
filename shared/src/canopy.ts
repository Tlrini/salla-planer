import type { Item } from './schemas.js';

/**
 * Ceiling decor that covers an area instead of hanging at one spot: strings of lights or draped
 * fabric, in rows or as a star from the centre. Pure geometry; local coordinates are centered on
 * the item, x along its width, z along its depth (meters).
 */
export const CANOPY_TYPES = new Set(['ceiling_lights', 'ceiling_drape']);
export const isCanopy = (type: string): boolean => CANOPY_TYPES.has(type);

export type CanopyPattern = 'rows' | 'star';
export interface CanopySettings {
  pattern: CanopyPattern;
  /** Rows: meters between rows. Star: number of arms. */
  spacing: number;
}

export const DEFAULT_ROW_SPACING = 1;
export const DEFAULT_STAR_ARMS = 24;
export const MIN_ROW_SPACING = 0.3;
export const MAX_ROW_SPACING = 5;
export const MIN_STAR_ARMS = 6;
export const MAX_STAR_ARMS = 60;
/** Most points a light canopy draws; beyond this the bulbs are simply spaced further apart. */
export const MAX_CANOPY_LIGHTS = 6000;
/** Distance between bulbs on a string (m). */
export const LIGHT_STEP = 0.2;

export const defaultSpacing = (pattern: CanopyPattern): number =>
  pattern === 'rows' ? DEFAULT_ROW_SPACING : DEFAULT_STAR_ARMS;

/** What a new canopy starts with: lights in rows, fabric as the classic star. */
export function defaultCanopy(type: string): CanopySettings {
  const pattern: CanopyPattern = type === 'ceiling_drape' ? 'star' : 'rows';
  return { pattern, spacing: defaultSpacing(pattern) };
}

/** The item's settings with the spacing kept in its allowed range. */
export function canopySettings(item: Pick<Item, 'type' | 'canopy'>): CanopySettings {
  const c = item.canopy ?? defaultCanopy(item.type);
  return {
    pattern: c.pattern,
    spacing:
      c.pattern === 'rows'
        ? Math.min(MAX_ROW_SPACING, Math.max(MIN_ROW_SPACING, c.spacing))
        : Math.round(Math.min(MAX_STAR_ARMS, Math.max(MIN_STAR_ARMS, c.spacing))),
  };
}

export interface P2 {
  x: number;
  z: number;
}
/** One hanging line, from its fixed start to its fixed end. */
export interface Strand {
  a: P2;
  b: P2;
}
/** One piece of fabric: its two edges at the start (a1, a2) and at the end (b1, b2). */
export interface Panel {
  a1: P2;
  a2: P2;
  b1: P2;
  b2: P2;
}

/** The point on the rectangle's edge in direction `angle` from its center. */
function edgePoint(angle: number, hw: number, hd: number): P2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = Math.min(
    Math.abs(c) < 1e-9 ? Infinity : hw / Math.abs(c),
    Math.abs(s) < 1e-9 ? Infinity : hd / Math.abs(s),
  );
  return { x: c * k, z: s * k };
}

/** The point on the ellipse inside the rectangle, in direction `angle` from its center. */
function ellipsePoint(angle: number, hw: number, hd: number): P2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = 1 / Math.hypot(c / hw, s / hd);
  return { x: c * k, z: s * k };
}

/** Half the length of a row at `offset` across `half`, inside the ellipse. */
const chord = (offset: number, half: number, along: number): number =>
  along * Math.sqrt(Math.max(0, 1 - (offset / half) ** 2));

/** Rows at the very edge of an ellipse would be shorter than this, and are left out (m). */
const MIN_ROUND_ROW = 0.2;

/** Offsets of the rows across `span`: as many as fit, centered, never fewer than one. */
function rowOffsets(span: number, spacing: number): number[] {
  const count = Math.max(1, Math.floor(span / spacing));
  return Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * span - span / 2);
}

type Sized = Pick<Item, 'type' | 'canopy' | 'width' | 'depth'>;

/** Rows run along the longer side; star arms go from the center to the edge. */
export function canopyStrands(item: Sized): Strand[] {
  const { pattern, spacing } = canopySettings(item);
  const hw = item.width / 2;
  const hd = item.depth / 2;
  const round = !!item.canopy?.round;
  const edge = round ? ellipsePoint : edgePoint;
  if (pattern === 'rows') {
    const alongX = item.width >= item.depth;
    const span = alongX ? item.depth : item.width;
    const [halfAlong, halfAcross] = alongX ? [hw, hd] : [hd, hw];
    return rowOffsets(span, spacing).flatMap((o) => {
      const reach = round ? chord(o, halfAcross, halfAlong) : halfAlong;
      if (round && 2 * reach < MIN_ROUND_ROW) return [];
      return alongX
        ? [{ a: { x: -reach, z: o }, b: { x: reach, z: o } }]
        : [{ a: { x: o, z: -reach }, b: { x: o, z: reach } }];
    });
  }
  return Array.from({ length: spacing }, (_, i) => ({
    a: { x: 0, z: 0 },
    b: edge((i / spacing) * 2 * Math.PI, hw, hd),
  }));
}

/** The fabric pieces of a pattern: strips side by side, or wedges from the center. */
export function canopyPanels(item: Sized): Panel[] {
  const { pattern, spacing } = canopySettings(item);
  const hw = item.width / 2;
  const hd = item.depth / 2;
  const round = !!item.canopy?.round;
  const edge = round ? ellipsePoint : edgePoint;
  if (pattern === 'rows') {
    const alongX = item.width >= item.depth;
    const span = alongX ? item.depth : item.width;
    const offsets = rowOffsets(span, spacing);
    // A small gap, so the rows read as separate swags.
    const half = (span / offsets.length / 2) * 0.96;
    const [halfAlong, halfAcross] = alongX ? [hw, hd] : [hd, hw];
    const reach = (o: number) => (round ? chord(o, halfAcross, halfAlong) : halfAlong);
    return offsets.flatMap((o) => {
      const [r1, r2] = [reach(o - half), reach(o + half)];
      if (round && r1 + r2 < MIN_ROUND_ROW) return [];
      return alongX
        ? [
            {
              a1: { x: -r1, z: o - half },
              a2: { x: -r2, z: o + half },
              b1: { x: r1, z: o - half },
              b2: { x: r2, z: o + half },
            },
          ]
        : [
            {
              a1: { x: o - half, z: -r1 },
              a2: { x: o + half, z: -r2 },
              b1: { x: o - half, z: r1 },
              b2: { x: o + half, z: r2 },
            },
          ];
    });
  }
  const center = { x: 0, z: 0 };
  const step = (2 * Math.PI) / spacing;
  return Array.from({ length: spacing }, (_, i) => ({
    a1: center,
    a2: center,
    b1: edge((i - 0.5) * step, hw, hd),
    b2: edge((i + 0.5) * step, hw, hd),
  }));
}

/** How far below its fixed ends a strand hangs at `t` (0 at the ends, `sag` in the middle). */
export function sagAt(t: number, sag: number): number {
  return sag * 4 * t * (1 - t);
}

export const strandLength = (s: Strand): number => Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);

/**
 * Bulb positions along the strands; `y` is the distance below the ceiling. In a very large or
 * dense canopy the bulbs are spread further apart to stay within MAX_CANOPY_LIGHTS.
 */
export function canopyLights(
  strands: readonly Strand[],
  sag: number,
  step = LIGHT_STEP,
): Array<{ x: number; y: number; z: number }> {
  const total = strands.reduce((sum, s) => sum + strandLength(s), 0);
  const spacing = Math.max(step, total / MAX_CANOPY_LIGHTS);
  const out: Array<{ x: number; y: number; z: number }> = [];
  for (const s of strands) {
    const len = strandLength(s);
    const count = Math.max(1, Math.floor(len / spacing));
    for (let i = 0; i <= count && out.length < MAX_CANOPY_LIGHTS; i++) {
      const t = i / count;
      out.push({
        x: s.a.x + (s.b.x - s.a.x) * t,
        y: sagAt(t, sag),
        z: s.a.z + (s.b.z - s.a.z) * t,
      });
    }
  }
  return out;
}

/** Lowest a canopy may hang: people must still walk under it. */
export const maxCanopySag = (hallHeight: number): number => Math.max(0.1, hallHeight - 2.3);
