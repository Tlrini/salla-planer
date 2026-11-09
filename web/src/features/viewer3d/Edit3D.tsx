import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  allowedMounts,
  baseHeight,
  clampToHall,
  mountPatch,
  snap,
  type CatalogMap,
  type Hall,
  type Item,
  type Mount,
} from '@salla/shared';
import { catalogMap, createItem, useEditor } from '../../model/store';
import { useUi } from '../../model/ui';
import { registerDropTarget } from '../catalog/touchDrag';
import { ITEM_DRAG_MIME } from '../editor2d/units';
import { useDrag3d, type DragPatch } from './drag3d';
import { itemBox, pickBox, rayAtHeight, roomSurfaceHit, type PickBox, type Ray3 } from './picking';

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
    itemBox(it, catalog.get(it.type), baseHeight(it, items, catalog, hall.height), hall.height),
  );
}

/** The pointer's ray through the scene (three.js only supplies the math). */
function usePointerRay() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  return useMemo(() => {
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    return (e: { clientX: number; clientY: number }): Ray3 => {
      const r = gl.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const { origin, direction } = raycaster.ray;
      return {
        origin: { x: origin.x, y: origin.y, z: origin.z },
        direction: { x: direction.x, y: direction.y, z: direction.z },
      };
    };
  }, [gl, camera]);
}

/**
 * Where a decor item goes for a pointer ray: the wall or ceiling under the pointer if the item
 * may hang there, otherwise the floor below the pointer. `null` when the pointer is off the hall.
 */
export function placementFor(
  item: Item,
  ray: Ray3,
  hall: Hall,
  catalog: CatalogMap,
  snapOn: boolean,
): { mount: Mount; patch: DragPatch } | null {
  const cat = catalog.get(item.type);
  const allowed = allowedMounts(cat);
  const s = (v: number) => (snapOn ? snap(v, GRID) : v);
  const hit = roomSurfaceHit(ray, hall);
  if (hit?.surface === 'wall' && allowed.includes('wall')) {
    const h = item.height ?? cat?.height ?? 0;
    const at = { x: s(hit.point.x), y: s(hit.point.z), elevation: s(hit.point.y - h / 2) };
    return {
      mount: 'wall',
      patch: mountPatch(item, 'wall', hall, catalog, { ...at, wall: hit.wall }) as DragPatch,
    };
  }
  if (hit?.surface === 'ceiling' && allowed.includes('ceiling')) {
    const at = { x: s(hit.point.x), y: s(hit.point.z) };
    return { mount: 'ceiling', patch: mountPatch(item, 'ceiling', hall, catalog, at) as DragPatch };
  }
  const floor = hit?.surface === 'floor' ? { x: hit.point.x, y: hit.point.z } : rayAtHeight(ray, 0);
  if (!floor) return null;
  const at = { x: s(floor.x), y: s(floor.y) };
  return { mount: 'floor', patch: mountPatch(item, 'floor', hall, catalog, at) as DragPatch };
}

/**
 * "Rregullo në 3D": tap an item to select it (Shift adds), drag it to move it. Decor follows
 * the pointer onto the floor, a wall or the ceiling; furniture slides over the floor.
 * Listens on the canvas in the capture phase, before OrbitControls: a press on an item never
 * turns the camera, a press on empty space orbits as usual. One undo step per finished drag.
 */
export function Edit3DControls({ hall, items, catalog }: Props) {
  const gl = useThree((s) => s.gl);
  const rayOf = usePointerRay();
  const boxes = useMemo(() => boxesFor(items, hall, catalog), [items, hall, catalog]);
  // The listeners live as long as the canvas; a drag changes `items` (the preview) on every
  // move, so they read the latest values through this ref instead of re-subscribing.
  const latest = useRef({ items, boxes, hall, catalog });
  useEffect(() => {
    latest.current = { items, boxes, hall, catalog };
  });

  useEffect(() => {
    const el = gl.domElement;

    let drag: {
      pointerId: number;
      startX: number;
      startY: number;
      /** Height of the grabbed point: a floor drag follows the pointer on that plane. */
      planeY: number;
      grab: { x: number; y: number };
      origins: Map<string, Item>;
      /** One decor item: it follows the pointer onto walls and the ceiling too. */
      surface: boolean;
      moved: boolean;
      last: Record<string, DragPatch> | null;
    } | null = null;
    let tap: { x: number; y: number; at: number } | null = null;
    let clearTimer: ReturnType<typeof setTimeout> | undefined;

    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) {
        // A second finger: let OrbitControls pinch; drop a drag that had not moved yet.
        if (drag && !drag.moved) drag = null;
        return;
      }
      const { items, boxes, catalog } = latest.current;
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
      const only = origins.size === 1 ? [...origins.values()][0]! : null;
      drag = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        planeY: hit.point.y,
        grab,
        origins,
        surface: !!only && allowedMounts(catalog.get(only.type)).length > 1,
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
      const { hall, catalog } = latest.current;
      const snapOn = useUi.getState().snap;
      const next: Record<string, DragPatch> = {};
      if (drag.surface) {
        const [id, it] = [...drag.origins][0]!;
        const placed = placementFor(it, rayOf(e), hall, catalog, snapOn);
        if (!placed) return;
        next[id] = placed.patch;
      } else {
        const at = rayAtHeight(rayOf(e), drag.planeY);
        if (!at) return;
        const dx = at.x - drag.grab.x;
        const dy = at.y - drag.grab.y;
        for (const [id, it] of drag.origins) {
          const x = snapOn ? snap(it.x + dx, GRID) : it.x + dx;
          const y = snapOn ? snap(it.y + dy, GRID) : it.y + dy;
          next[id] = clampToHall({ ...it, x, y }, hall, catalog.get(it.type));
        }
      }
      drag.moved = true;
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
        for (const [id, p] of Object.entries(last)) {
          patches[id] = {
            ...p,
            ...(p.x !== undefined ? { x: snap(p.x, 0.01) } : {}),
            ...(p.y !== undefined ? { y: snap(p.y, 0.01) } : {}),
          };
        }
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
  }, [gl, rayOf]);

  return <SelectionBoxes boxes={boxes} />;
}

/**
 * Drop from the catalog straight into the 3D view: the item lands where it was dropped, on
 * the floor, a wall or the ceiling (if it may go there). Then "Rregullo" turns on so it can be
 * moved right away.
 */
export function Drop3D({ hall }: { hall: Hall }) {
  const gl = useThree((s) => s.gl);
  const rayOf = usePointerRay();
  const hallRef = useRef(hall);
  useEffect(() => {
    hallRef.current = hall;
  });

  useEffect(() => {
    const el = gl.domElement;
    const onOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes(ITEM_DRAG_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };
    const dropAt = (type: string, clientX: number, clientY: number) => {
      if (!catalogMap.has(type)) return;
      const hall = hallRef.current;
      // A throw-away draft tells where it may go and how big it is.
      const draft = createItem(type, { x: hall.width / 2, y: hall.length / 2 });
      const placed = placementFor(
        draft,
        rayOf({ clientX, clientY }),
        hall,
        catalogMap,
        useUi.getState().snap,
      );
      const store = useEditor.getState();
      if (!placed) {
        store.addItem(type, { x: hall.width / 2, y: hall.length / 2 });
      } else {
        const { patch, mount } = placed;
        store.addPlacedItem(type, mount, {
          x: patch.x ?? draft.x,
          y: patch.y ?? draft.y,
          ...(patch.elevation !== undefined ? { elevation: patch.elevation } : {}),
        });
      }
      useUi.getState().set({ edit3d: true });
    };
    const onDrop = (e: DragEvent) => {
      const type = e.dataTransfer?.getData(ITEM_DRAG_MIME);
      if (!type) return;
      e.preventDefault();
      dropAt(type, e.clientX, e.clientY);
    };
    el.addEventListener('dragover', onOver);
    el.addEventListener('drop', onDrop);
    // The same drop for a finger (see catalog/touchDrag.ts).
    const unregister = registerDropTarget(el, dropAt);
    return () => {
      unregister();
      el.removeEventListener('dragover', onOver);
      el.removeEventListener('drop', onDrop);
    };
  }, [gl, rayOf]);
  return null;
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
