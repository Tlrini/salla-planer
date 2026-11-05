import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Konva from 'konva';
import { Layer, Rect, Stage } from 'react-konva';
import {
  autoLabels,
  boxesOverlap,
  clampToHall,
  halfExtents,
  itemBox,
  normalizeAngle,
  snap,
  type Item,
} from '@salla/shared';
import { catalogMap, useEditor } from '../../model/store';
import { useUi } from '../../model/ui';
import { HallLayer } from './HallLayer';
import { ItemNode } from './ItemNode';
import { SelectionTransformer } from './SelectionTransformer';
import { SelectionInfo } from './SelectionInfo';
import { CanvasControls } from './CanvasControls';
import { BLUEPRINT, CM, ITEM_DRAG_MIME, layerRank } from './units';
import { sq } from '../../i18n/sq';

Konva.hitOnDragEnabled = true;
Konva.dragDistance = 4;

/** Screen padding (px) kept around the hall when fitting, for the dimension labels. */
const FIT_PAD = 56;
const MIN_SCALE = 0.02;
const MAX_SCALE = 4;
const SNAP_STEP = 0.1;

interface View {
  scale: number;
  x: number;
  y: number;
}

type Gesture =
  | { kind: 'pan'; start: Konva.Vector2d; view: View; moved: boolean; additive: boolean }
  | { kind: 'rubber'; x0: number; y0: number; x1: number; y1: number; additive: boolean }
  | null;

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export function BlueprintStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ scale: 0.3, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const hall = useEditor((s) => s.project.hall);
  const items = useEditor((s) => s.project.items);
  const selection = useEditor((s) => s.selection);
  const snapOn = useUi((s) => s.snap);
  const mode = useUi((s) => s.mode);
  const snapRef = useRef(snapOn);
  snapRef.current = snapOn;

  const [rubber, setRubber] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const gesture = useRef<Gesture>(null);
  const pinch = useRef<{ center: Konva.Vector2d; dist: number } | null>(null);

  // ----- size & fit -------------------------------------------------------
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const initial = el.getBoundingClientRect();
    setSize({ w: Math.floor(initial.width), h: Math.floor(initial.height) });
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({ w: Math.floor(entry.contentRect.width), h: Math.floor(entry.contentRect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (!size.w || !size.h) return;
    const hw = hall.width * CM;
    const hh = hall.length * CM;
    const scale = clampScale(Math.min((size.w - 2 * FIT_PAD) / hw, (size.h - 2 * FIT_PAD) / hh));
    setView({ scale, x: (size.w - hw * scale) / 2, y: (size.h - hh * scale) / 2 });
  }, [size.w, size.h, hall.width, hall.length]);

  // Refit when the stage gets its size or the hall dimensions change.
  useEffect(() => {
    fit();
  }, [fit]);

  // Publish the visible center for tap-to-add.
  useEffect(() => {
    if (!size.w) return;
    useUi.getState().set({
      viewCenter: {
        x: (size.w / 2 - view.x) / view.scale / CM,
        y: (size.h / 2 - view.y) / view.scale / CM,
      },
    });
  }, [view, size]);

  // Redraw once web fonts are ready (Konva measures text at draw time).
  useEffect(() => {
    void document.fonts?.ready.then(() => stageRef.current?.batchDraw());
  }, []);

  const zoomAt = useCallback((factor: number, at: Konva.Vector2d) => {
    setView((v) => {
      const scale = clampScale(v.scale * factor);
      const k = scale / v.scale;
      return { scale, x: at.x - (at.x - v.x) * k, y: at.y - (at.y - v.y) * k };
    });
  }, []);

  const zoomCenter = (factor: number) => zoomAt(factor, { x: size.w / 2, y: size.h / 2 });

  // ----- helpers -------------------------------------------------------------
  const toHall = (p: Konva.Vector2d) => {
    const v = viewRef.current;
    return { x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale }; // cm
  };

  const isBackground = (target: Konva.Node) =>
    target === stageRef.current || target.name() === 'background';

  // ----- stage pointer: pan, rubber-band, deselect --------------------------
  const onStagePointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    if (pinch.current || !isBackground(e.target)) return;
    const stage = stageRef.current!;
    const p = stage.getPointerPosition();
    if (!p) return;
    const additive = e.evt.shiftKey;
    if (mode === 'select' || additive) {
      const h = toHall(p);
      gesture.current = { kind: 'rubber', x0: h.x, y0: h.y, x1: h.x, y1: h.y, additive };
      setRubber({ x: h.x, y: h.y, w: 0, h: 0 });
    } else {
      gesture.current = { kind: 'pan', start: p, view: viewRef.current, moved: false, additive };
    }
  };

  const onStagePointerMove = () => {
    const g = gesture.current;
    if (!g || pinch.current) return;
    const p = stageRef.current!.getPointerPosition();
    if (!p) return;
    if (g.kind === 'pan') {
      const dx = p.x - g.start.x;
      const dy = p.y - g.start.y;
      if (!g.moved && Math.hypot(dx, dy) < 4) return;
      g.moved = true;
      setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
    } else {
      const h = toHall(p);
      g.x1 = h.x;
      g.y1 = h.y;
      setRubber({
        x: Math.min(g.x0, h.x),
        y: Math.min(g.y0, h.y),
        w: Math.abs(h.x - g.x0),
        h: Math.abs(h.y - g.y0),
      });
    }
  };

  const endGesture = useCallback(() => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    const state = useEditor.getState();
    if (g.kind === 'pan') {
      if (!g.moved && !g.additive) state.setSelection([]);
      return;
    }
    setRubber(null);
    const box = {
      minX: Math.min(g.x0, g.x1) / CM,
      minY: Math.min(g.y0, g.y1) / CM,
      maxX: Math.max(g.x0, g.x1) / CM,
      maxY: Math.max(g.y0, g.y1) / CM,
    };
    const tiny = box.maxX - box.minX < 0.05 && box.maxY - box.minY < 0.05;
    if (tiny) {
      if (!g.additive) state.setSelection([]);
      return;
    }
    const hit = state.project.items
      .filter((i) => boxesOverlap(box, itemBox(i, catalogMap.get(i.type)), 0))
      .map((i) => i.id);
    state.setSelection(g.additive ? [...new Set([...state.selection, ...hit])] : hit);
  }, []);

  useEffect(() => {
    window.addEventListener('pointerup', endGesture);
    window.addEventListener('pointercancel', endGesture);
    return () => {
      window.removeEventListener('pointerup', endGesture);
      window.removeEventListener('pointercancel', endGesture);
    };
  }, [endGesture]);

  // ----- wheel & pinch ------------------------------------------------------
  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const p = stageRef.current!.getPointerPosition();
    if (!p) return;
    const factor = Math.exp(-e.evt.deltaY * (e.evt.ctrlKey ? 0.01 : 0.0015));
    zoomAt(factor, p);
  };

  const onTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    if (touches.length !== 2) return;
    e.evt.preventDefault();
    const stage = stageRef.current!;
    stage.find('.item').forEach((n) => {
      if (n.isDragging()) n.stopDrag();
    });
    gesture.current = null;
    setRubber(null);
    const rect = stage.container().getBoundingClientRect();
    const a = touches[0]!;
    const b = touches[1]!;
    const center = {
      x: (a.clientX + b.clientX) / 2 - rect.left,
      y: (a.clientY + b.clientY) / 2 - rect.top,
    };
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const last = pinch.current;
    pinch.current = { center, dist };
    if (!last) return;
    setView((v) => {
      const scale = clampScale(v.scale * (dist / last.dist));
      const pointTo = { x: (last.center.x - v.x) / v.scale, y: (last.center.y - v.y) / v.scale };
      return { scale, x: center.x - pointTo.x * scale, y: center.y - pointTo.y * scale };
    });
  };

  const onTouchEnd = (e: Konva.KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length < 2) pinch.current = null;
  };

  // ----- items: select, drag ---------------------------------------------------
  const onItemPointerDown = useCallback((e: Konva.KonvaEventObject<PointerEvent>, id: string) => {
    e.cancelBubble = true;
    const { selection: sel, setSelection: setSel } = useEditor.getState();
    if (e.evt.shiftKey) {
      setSel(sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]);
    } else if (!sel.includes(id)) {
      setSel([id]);
    }
  }, []);

  /** A plain click/tap (no drag) on an item of a multi-selection selects only that item. */
  const onItemTap = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent | PointerEvent>, id: string) => {
      e.cancelBubble = true;
      if ('shiftKey' in e.evt && e.evt.shiftKey) return;
      useEditor.getState().setSelection([id]);
    },
    [],
  );

  /** Snap + keep inside the hall while dragging (absolute coordinates in, absolute out). */
  const dragBoundFunc = useCallback(function (this: Konva.Node, pos: Konva.Vector2d) {
    const v = viewRef.current;
    const item = useEditor.getState().project.items.find((i) => i.id === this.id());
    if (!item) return pos;
    let x = (pos.x - v.x) / v.scale / CM;
    let y = (pos.y - v.y) / v.scale / CM;
    if (snapRef.current) {
      x = snap(x, SNAP_STEP);
      y = snap(y, SNAP_STEP);
    }
    const c = clampToHall(
      { ...item, x, y },
      useEditor.getState().project.hall,
      catalogMap.get(item.type),
    );
    return { x: c.x * CM * v.scale + v.x, y: c.y * CM * v.scale + v.y };
  }, []);

  const commitNodes = useCallback((ids: readonly string[], withTransform: boolean) => {
    const stage = stageRef.current;
    if (!stage) return;
    const { project, updateItems } = useEditor.getState();
    const patches: Record<string, Partial<Item>> = {};
    for (const id of ids) {
      const node = stage.findOne(`#${id}`);
      const item = project.items.find((i) => i.id === id);
      if (!node || !item) continue;
      const cat = catalogMap.get(item.type);
      const next: Item = { ...item, x: node.x() / CM, y: node.y() / CM };
      if (withTransform) {
        next.rotation = normalizeAngle(Math.round(node.rotation() * 10) / 10);
        const sx = node.scaleX();
        const sy = node.scaleY();
        const step = snapRef.current ? SNAP_STEP : 0.01;
        if (cat?.resizable === 'width' || cat?.resizable === 'both')
          next.width = Math.max(0.1, snap(item.width * sx, step));
        if (cat?.resizable === 'both') next.depth = Math.max(0.1, snap(item.depth * sy, step));
        node.scale({ x: 1, y: 1 });
      }
      if (snapRef.current && !withTransform) {
        next.x = snap(next.x, SNAP_STEP);
        next.y = snap(next.y, SNAP_STEP);
      }
      const c = clampToHall(next, project.hall, cat);
      patches[id] = {
        x: snap(c.x, 0.01),
        y: snap(c.y, 0.01),
        ...(withTransform ? { rotation: next.rotation, width: next.width, depth: next.depth } : {}),
      };
      // Make the node match the committed model even if the store ends up unchanged.
      node.position({ x: patches[id].x! * CM, y: patches[id].y! * CM });
    }
    updateItems(patches);
  }, []);

  const onItemDragEnd = useCallback(
    (id: string) => {
      const sel = useEditor.getState().selection;
      const ids = sel.includes(id) ? sel : [id];
      commitNodes(
        ids.filter((i) => !useEditor.getState().project.items.find((it) => it.id === i)?.locked),
        false,
      );
    },
    [commitNodes],
  );

  const onTransformEnd = useCallback((ids: string[]) => commitNodes(ids, true), [commitNodes]);

  // ----- drop from the catalog (HTML5 drag) ------------------------------------
  const onDrop = (e: React.DragEvent) => {
    const type = e.dataTransfer.getData(ITEM_DRAG_MIME);
    if (!type) return;
    e.preventDefault();
    const rect = containerRef.current!.getBoundingClientRect();
    const h = toHall({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    useEditor.getState().addItem(type, { x: h.x / CM, y: h.y / CM }, true);
  };

  // ----- derived ---------------------------------------------------------------
  const sorted = useMemo(
    () => [...items].sort((a, b) => layerRank(a.type) - layerRank(b.type)),
    [items],
  );
  const labels = useMemo(() => autoLabels(items, catalogMap), [items]);
  const selectedSet = useMemo(() => new Set(selection), [selection]);
  const selectedItems = useMemo(
    () => items.filter((i) => selectedSet.has(i.id)),
    [items, selectedSet],
  );

  return (
    <div
      ref={containerRef}
      className="blueprint"
      style={{ background: BLUEPRINT.paper }}
      aria-label={sq.canvas.planLabel}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(ITEM_DRAG_MIME)) e.preventDefault();
      }}
      onDrop={onDrop}
    >
      {size.w > 0 && (
        <Stage
          ref={stageRef}
          width={size.w}
          height={size.h}
          scaleX={view.scale}
          scaleY={view.scale}
          x={view.x}
          y={view.y}
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onWheel={onWheel}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <Layer>
            <HallLayer hall={hall} scale={view.scale} />
          </Layer>
          <Layer>
            {sorted.map((item) => {
              const cat = catalogMap.get(item.type);
              return (
                <ItemNode
                  key={item.id}
                  item={item}
                  cat={cat}
                  selected={selectedSet.has(item.id)}
                  label={item.label?.trim() || labels.get(item.id)}
                  showName={
                    halfExtents(item, cat).hx * 2 >= 1.5 && halfExtents(item, cat).hy * 2 >= 0.25
                  }
                  dragBoundFunc={dragBoundFunc}
                  onPointerDown={onItemPointerDown}
                  onDragEnd={onItemDragEnd}
                  onTap={onItemTap}
                />
              );
            })}
            <SelectionTransformer
              stageRef={stageRef}
              selected={selectedItems}
              onTransformEnd={onTransformEnd}
            />
          </Layer>
          <Layer listening={false}>
            <SelectionInfo selected={selectedItems} scale={view.scale} />
            {rubber && (
              <Rect
                x={rubber.x}
                y={rubber.y}
                width={rubber.w}
                height={rubber.h}
                fill={BLUEPRINT.selectionFill}
                stroke={BLUEPRINT.selection}
                strokeWidth={1}
                strokeScaleEnabled={false}
                dash={[6, 4]}
              />
            )}
          </Layer>
        </Stage>
      )}
      <CanvasControls
        onZoomIn={() => zoomCenter(1.25)}
        onZoomOut={() => zoomCenter(0.8)}
        onFit={fit}
      />
    </div>
  );
}
