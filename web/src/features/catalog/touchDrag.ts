import type { PointerEvent as ReactPointerEvent } from 'react';
import { create } from 'zustand';

/**
 * Dragging from the catalog with a finger. HTML5 drag and drop doesn't fire on touch screens, so
 * a long press on a catalog row starts this pointer-based drag instead. A plain swipe still
 * scrolls the list and a tap still adds the item.
 */

/** How long a finger must rest on a row before it picks the item up (ms). */
const LONG_PRESS_MS = 280;
/** A finger moving further than this before the long press is a scroll (px). */
const MOVE_TOLERANCE = 10;
/** The item lands above the fingertip, where the user can see it (px). */
export const DROP_OFFSET_Y = 64;

interface DragState {
  drag: { type: string; x: number; y: number } | null;
}
export const useCatalogDrag = create<DragState>()(() => ({ drag: null }));

type DropHandler = (type: string, clientX: number, clientY: number) => void;
const targets = new Map<HTMLElement, DropHandler>();

/** A view (2D plan, 3D canvas) that accepts catalog items. Returns the unregister function. */
export function registerDropTarget(el: HTMLElement, onDrop: DropHandler): () => void {
  targets.set(el, onDrop);
  return () => {
    targets.delete(el);
  };
}

function dropAt(type: string, x: number, y: number) {
  const hit = document.elementFromPoint(x, y);
  if (!hit) return;
  for (const [el, onDrop] of targets) {
    if (el.contains(hit)) {
      onDrop(type, x, y);
      return;
    }
  }
}

export const isCatalogDragging = (): boolean => useCatalogDrag.getState().drag !== null;

let suppressClickUntil = 0;
/** The click a browser may still fire when a drag ends must not add the item a second time. */
export const clickSuppressed = (): boolean => performance.now() < suppressClickUntil;

/** Start watching a touch on a catalog row; `onStart` runs when the long press picks it up. */
export function pressCatalogItem(e: ReactPointerEvent, type: string, onStart: () => void): void {
  if (e.pointerType === 'mouse') return;
  const id = e.pointerId;
  const startX = e.clientX;
  const startY = e.clientY;
  let active = false;

  const timer = setTimeout(() => {
    active = true;
    navigator.vibrate?.(15);
    useCatalogDrag.setState({ drag: { type, x: startX, y: startY } });
    onStart();
  }, LONG_PRESS_MS);

  const stop = () => {
    clearTimeout(timer);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
  };
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    if (active) {
      useCatalogDrag.setState({ drag: { type, x: ev.clientX, y: ev.clientY } });
    } else if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > MOVE_TOLERANCE) {
      stop(); // a scroll, not a press
    }
  };
  const up = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    stop();
    if (!active) return;
    useCatalogDrag.setState({ drag: null });
    suppressClickUntil = performance.now() + 400;
    dropAt(type, ev.clientX, ev.clientY - DROP_OFFSET_Y);
  };
  const cancel = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    stop();
    if (active) useCatalogDrag.setState({ drag: null });
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
}
