import { create } from 'zustand';

/**
 * Positions of items being dragged in the 3D view. The scene draws these instead of the store
 * values, so a drag shows instantly; the store (and the undo history) only changes once, when
 * the drag ends.
 */
interface Drag3dState {
  preview: Readonly<Record<string, { x: number; y: number }>> | null;
  setPreview: (preview: Drag3dState['preview']) => void;
}

export const useDrag3d = create<Drag3dState>()((set) => ({
  preview: null,
  setPreview: (preview) => set({ preview }),
}));
