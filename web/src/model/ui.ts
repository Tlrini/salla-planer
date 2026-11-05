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

interface UiState {
  snap: boolean;
  mode: CanvasMode;
  drawer: Drawer;
  save: SaveStatus;
  view: ViewMode;
  evening: boolean;
  camera: CameraPreset;
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
  cameraNonce: 0,
  viewCenter: null,
  set: (patch) => set(patch),
}));
