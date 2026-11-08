import { create } from 'zustand';
import type { Item } from '@salla/shared';

/**
 * Items being dragged in the 3D view: their new position (and, for decor moved onto a wall or
 * the ceiling, their new mount, elevation and rotation). The scene draws these instead of the
 * store values, so a drag shows instantly; the store (and the undo history) only changes once,
 * when the drag ends.
 */
export type DragPatch = Partial<Pick<Item, 'x' | 'y' | 'rotation' | 'mount' | 'elevation'>>;

interface Drag3dState {
  preview: Readonly<Record<string, DragPatch>> | null;
  setPreview: (preview: Drag3dState['preview']) => void;
}

export const useDrag3d = create<Drag3dState>()((set) => ({
  preview: null,
  setPreview: (preview) => set({ preview }),
}));
