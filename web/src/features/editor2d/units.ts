/** Konva works in centimeters: 1 unit = 1 cm. The data model is in meters. */
export const CM = 100;

/** dataTransfer type used when dragging a catalog entry onto the plan. */
export const ITEM_DRAG_MIME = 'application/x-salla-item';

export const BLUEPRINT = {
  paper: '#1D3B6A',
  line: 'rgba(222, 236, 255, 0.95)',
  lineSoft: 'rgba(200, 222, 252, 0.7)',
  gridMinor: 'rgba(170, 200, 240, 0.13)',
  gridMajor: 'rgba(170, 200, 240, 0.32)',
  hallFill: 'rgba(255, 255, 255, 0.025)',
  selection: '#C9A44C',
  selectionFill: 'rgba(201, 164, 76, 0.12)',
  text: 'rgba(232, 241, 255, 0.95)',
} as const;

export const FONT_UI = 'Figtree, system-ui, sans-serif';
export const FONT_MONO = '"JetBrains Mono", ui-monospace, monospace';

export function hexToRgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Draw order: floor coverings first, ceiling items last. */
export function layerRank(type: string): number {
  if (type === 'dance_floor' || type === 'carpet_aisle') return 0;
  if (type === 'chandelier') return 3;
  if (type === 'centerpiece' || type === 'candle_group') return 2;
  return 1;
}
