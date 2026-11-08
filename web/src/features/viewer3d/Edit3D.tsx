import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  clampToHall,
  snap,
  supportHeight,
  type CatalogMap,
  type Hall,
  type Item,
} from '@salla/shared';
import { useEditor } from '../../model/store';
import { useUi } from '../../model/ui';
import { useDrag3d } from './drag3d';
import { itemBox, pickBox, rayAtHeight, type PickBox, type Ray3 } from './picking';

const GOLD = '#C9A44C';
/** Pointer travel (px) before a press on an item becomes a drag instead of a tap. */
const DRAG_START_PX = 5;
/** A tap on empty space (short, no travel) clears the selection. */
const TAP_MS = 400;
/** Keep the drag preview until the debounced scene has caught up with the store (150 ms). */
const PREVIEW_HOLD_MS = 350;
const GRID = 0.1;

interface Props {
  hall: Hall;
  /** The items as drawn (project items, or the structure of a hall template). */
  items: readonly Item[];
  catalog: CatalogMap;
}

function boxesFor(items: readonly Item[], hall: Hall, catalog: CatalogMap): PickBox[] {
  return items.map((it) =>
    itemBox(it, catalog.get(it.type), supportHeight(it, items, catalog), hall.height),
  );
}

/**
 * "Rregullo në 3D": tap an item to select it (Shift adds), drag it over the floor to move it.
 * Listens on the canvas in the capture phase, before OrbitControls: a press on an item never
 * turns the camera, a press on empty space orbits as usual. One undo step per finished drag.
 */
export function Edit3DControls({ hall, items, catalog }: Props) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const boxes = useMemo(() => boxesFor(items, hall, catalog), [items, hall, catalog]);
  // The listeners live as long as the canvas; a drag changes `items` (the preview) on every
  // move, so they read the latest values through this ref instead of re-subscribing.
  const latest = useRef({ items, boxes, hall, catalog });
  useEffect(() => {
    latest.current = { items, boxes, hall, catalog };
  });

  useEffect(() => {
    const el = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const rayOf = (e: PointerEvent): Ray3 => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const { origin, direction } = raycaster.ray;
      return {
        origin: { x: origin.x, y: origin.y, z: origin.z },
        direction: { x: direction.x, y: direction.y, z: direction.z },
      };
    };

    let drag: {
      pointerId: number;
      startX: number;
      startY: number;
      /** Height of the grabbed point: the drag follows the pointer on that plane. */
      planeY: number;
      grab: { x: number; y: number };
      origins: Map<string, Item>;
      moved: boolean;
      last: Record<string, { x: number; y: number }> | null;
    } | null = null;
    let tap: { x: number; y: number; at: number } | null = null;
    let clearTimer: ReturnType<typeof setTimeout> | undefined;

    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) {
        // A second finger: let OrbitControls pinch; drop a drag that had not moved yet.
        if (drag && !drag.moved) drag = null;
        return;
      }
      const { items, boxes } = latest.current;
      const hit = pickBox(rayOf(e), boxes);
      if (!hit) {
        tap = { x: e.clientX, y: e.clientY, at: performance.now() };
        return; // empty space: OrbitControls turns the camera
      }
      // An item: this press is ours, the camera must not move.
      e.stopImmediatePropagation();
      e.preventDefault();
      tap = null;
      const store = useEditor.getState();
      let selection = store.selection;
      if (e.shiftKey) {
        selection = selection.includes(hit.id)
          ? selection.filter((id) => id !== hit.id)
          : [...selection, hit.id];
        store.setSelection(selection);
        if (!selection.includes(hit.id)) return;
      } else if (!selection.includes(hit.id)) {
        selection = [hit.id];
        store.setSelection(selection);
      }
      const byId = new Map(items.map((i) => [i.id, i]));
      const origins = new Map<string, Item>();
      for (const id of selection) {
        const it = byId.get(id);
        if (it && !it.locked) origins.set(id, it);
      }
      const grab = rayAtHeight(rayOf(e), hit.point.y);
      if (!origins.size || !grab) return;
      drag = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        planeY: hit.point.y,
        grab,
        origins,
        moved: false,
        last: null,
      };
      el.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      if (
        !drag.moved &&
        Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_START_PX
      )
        return;
      const at = rayAtHeight(rayOf(e), drag.planeY);
      if (!at) return;
      drag.moved = true;
      const { hall, catalog } = latest.current;
      const snapOn = useUi.getState().snap;
      const dx = at.x - drag.grab.x;
      const dy = at.y - drag.grab.y;
      const next: Record<string, { x: number; y: number }> = {};
      for (const [id, it] of drag.origins) {
        const x = snapOn ? snap(it.x + dx, GRID) : it.x + dx;
        const y = snapOn ? snap(it.y + dy, GRID) : it.y + dy;
        next[id] = clampToHall({ ...it, x, y }, hall, catalog.get(it.type));
      }
      drag.last = next;
      clearTimeout(clearTimer);
      useDrag3d.getState().setPreview(next);
    };

    const finish = (e: PointerEvent, commit: boolean) => {
      if (tap && commit) {
        const quick = performance.now() - tap.at < TAP_MS;
        const still = Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < DRAG_START_PX;
        if (quick && still) useEditor.getState().setSelection([]);
      }
      tap = null;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const { moved, last } = drag;
      drag = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      if (!moved || !last) return;
      if (commit) {
        // One store change = one undo step for the whole drag.
        const patches: Record<string, Partial<Item>> = {};
        for (const [id, p] of Object.entries(last)) patches[id] = { x: p.x, y: p.y };
        useEditor.getState().updateItems(patches);
        clearTimer = setTimeout(() => useDrag3d.getState().setPreview(null), PREVIEW_HOLD_MS);
      } else {
        useDrag3d.getState().setPreview(null);
      }
    };
    const onUp = (e: PointerEvent) => finish(e, true);
    const onCancel = (e: PointerEvent) => finish(e, false);

    // Capture phase: runs before OrbitControls' own listener on the same canvas.
    el.addEventListener('pointerdown', onDown, { capture: true });
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    return () => {
      el.removeEventListener('pointerdown', onDown, { capture: true });
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      clearTimeout(clearTimer);
      useDrag3d.getState().setPreview(null);
    };
  }, [gl, camera]);

  return <SelectionBoxes boxes={boxes} />;
}

/** Gold outline boxes around the selected items (drawn on top of everything). */
function SelectionBoxes({ boxes }: { boxes: readonly PickBox[] }) {
  const selection = useEditor((s) => s.selection);
  const selected = useMemo(() => {
    const ids = new Set(selection);
    return boxes.filter((b) => ids.has(b.id));
  }, [boxes, selection]);
  return (
    <>
      {selected.map((b) => (
        <SelectionBox key={b.id} box={b} />
      ))}
    </>
  );
}

function SelectionBox({ box }: { box: PickBox }) {
  const { x, y, z } = box.half;
  const geometry = useMemo(() => {
    const solid = new THREE.BoxGeometry(x * 2 + 0.04, y * 2 + 0.04, z * 2 + 0.04);
    const edges = new THREE.EdgesGeometry(solid);
    solid.dispose();
    return edges;
  }, [x, y, z]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments
      geometry={geometry}
      position={[box.center.x, box.center.y, box.center.z]}
      rotation={[0, box.yaw, 0]}
      renderOrder={10}
    >
      <lineBasicMaterial color={GOLD} depthTest={false} transparent />
    </lineSegments>
  );
}
