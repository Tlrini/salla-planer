import { create } from 'zustand';

export type SaveStatus =
  | { kind: 'saved'; at: Date }
  | { kind: 'saving' }
  | { kind: 'error' }
  | { kind: 'conflict'; by: string };
export type CanvasMode = 'pan' | 'select';
export type Drawer = 'none' | 'catalog' | 'properties';
export type ViewMode = '2d' | '3d' | 'split';
export type CameraPreset = 'top' | 'perspective' | 'entrance';
export type Quality = 'normal' | 'high';

interface UiState {
  snap: boolean;
  mode: CanvasMode;
  drawer: Drawer;
  save: SaveStatus;
  view: ViewMode;
  evening: boolean;
  camera: CameraPreset;
  /** Eye-level "Street View" walking instead of orbiting (Beta 3). */
  walk: boolean;
  /** Two-point scale calibration of the floor-plan photo is running on the 2D plan. */
  calibrating: boolean;
  /** Annotation tool on the 2D plan (measure / text / zone), or none. */
  annotateTool: 'measure' | 'text' | 'zone' | null;
  /** Full-screen client presentation: only the 3D walk, options and viewpoints. */
  present: boolean;
  /** 3D render quality: 'high' adds soft contact shadows and full resolution. */
  quality: Quality;
  /** Bumped when the same camera preset is chosen again, to re-aim the camera. */
  cameraNonce: number;
  /** Center of the visible plan area in hall meters (for tap-to-add). */
  viewCenter: { x: number; y: number } | null;
  set: (patch: Partial<Omit<UiState, 'set'>>) => void;
}

export const useUi = create<UiState>()((set) => ({
  snap: true,
  mode: 'pan',
  drawer: 'none',
  save: { kind: 'saved', at: new Date() },
  view: '2d',
  evening: false,
  camera: 'perspective',
  walk: false,
  calibrating: false,
  annotateTool: null,
  present: false,
  // Phones/tablets (coarse pointer) start in normal quality.
  quality:
    typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
      ? 'normal'
      : 'high',
  cameraNonce: 0,
  viewCenter: null,
  set: (patch) => set(patch),
}));
