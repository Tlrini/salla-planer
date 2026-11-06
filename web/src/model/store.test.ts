import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Project } from '@salla/shared';
import { history, newProject, useEditor } from './store';

const reset = () => {
  useEditor.getState().replaceProject(newProject());
  useEditor.temporal.getState().clear();
};

describe('new project', () => {
  it('is valid against the shared Project schema', () => {
    expect(Project.safeParse(newProject()).success).toBe(true);
  });
});

describe('editor store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reset();
  });
  afterEach(() => vi.useRealTimers());

  const settle = () => vi.advanceTimersByTime(1000);

  it('adds items at a free spot and selects them', () => {
    const s = useEditor.getState();
    const a = s.addItem('table_round_10', { x: 10, y: 8 });
    settle();
    const b = useEditor.getState().addItem('table_round_10', { x: 10, y: 8 });
    const items = useEditor.getState().project.items;
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.id === a)).toMatchObject({ x: 10, y: 8 });
    expect(items.find((i) => i.id === b)).not.toMatchObject({ x: 10, y: 8 });
    expect(useEditor.getState().selection).toEqual([b]);
  });

  it('undo/redo one step per action', () => {
    const id = useEditor.getState().addItem('stage', { x: 15, y: 3 });
    settle();
    useEditor.getState().updateItems({ [id]: { x: 12 } });
    settle();
    expect(useEditor.getState().project.items[0]!.x).toBe(12);
    history.undo();
    expect(useEditor.getState().project.items[0]!.x).toBe(15);
    history.undo();
    expect(useEditor.getState().project.items).toHaveLength(0);
    history.redo();
    history.redo();
    expect(useEditor.getState().project.items[0]!.x).toBe(12);
  });

  it('no-op updates and selection changes do not create history', () => {
    const id = useEditor.getState().addItem('stage', { x: 15, y: 3 });
    settle();
    const before = useEditor.temporal.getState().pastStates.length;
    useEditor.getState().updateItems({ [id]: { x: 15 } });
    useEditor.getState().setSelection([]);
    expect(useEditor.temporal.getState().pastStates.length).toBe(before);
  });

  it('duplicate, rotate, nudge and delete respect locks', () => {
    const id = useEditor.getState().addItem('table_rect', { x: 5, y: 5 });
    useEditor.getState().duplicateItems([id]);
    expect(useEditor.getState().project.items).toHaveLength(2);
    useEditor.getState().updateItems({ [id]: { locked: true } });
    useEditor.getState().nudgeItems([id], 1, 0);
    useEditor.getState().rotateItems([id], 15);
    expect(useEditor.getState().project.items[0]).toMatchObject({ x: 5, rotation: 0 });
    useEditor.getState().removeItems(useEditor.getState().project.items.map((i) => i.id));
    expect(useEditor.getState().project.items.map((i) => i.id)).toEqual([id]);
  });
});

describe('design options and table decor (Beta 2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reset();
  });
  afterEach(() => vi.useRealTimers());
  const s = () => useEditor.getState();
  const settle = () => vi.advanceTimersByTime(1000);

  it('puts decor on several tables in one undo step', () => {
    const a = s().addItem('table_round_10', { x: 5, y: 5 });
    const b = s().addItem('table_round_10', { x: 10, y: 5 });
    settle();
    s().setTableDecor([a, b], 'centerpiece');
    expect(s().project.items.map((i) => i.tableDecor)).toEqual(['centerpiece', 'centerpiece']);
    history.undo();
    expect(s().project.items.map((i) => i.tableDecor)).toEqual([undefined, undefined]);
  });

  it('a new option copies the current one; switching swaps the items', () => {
    const t = s().addItem('table_round_10', { x: 5, y: 5 });
    s().setTableDecor([t], 'centerpiece');
    const b = s().addOption();
    expect(s().project.option).toEqual({ id: b, name: 'Opsioni B' });
    expect(s().project.otherOptions?.map((o) => o.name)).toEqual(['Opsioni A']);
    s().setTableDecor([t], 'candle_group');
    const a = s().project.otherOptions![0]!.id;
    s().switchOption(a);
    expect(s().project.option?.name).toBe('Opsioni A');
    expect(s().project.items[0]!.tableDecor).toBe('centerpiece');
    s().switchOption(b);
    expect(s().project.items[0]!.tableDecor).toBe('candle_group');
    expect(Project.safeParse(s().project).success).toBe(true);
  });

  it('switching is one undo step and clears the selection', () => {
    s().addItem('stage', { x: 15, y: 3 });
    s().addOption();
    s().addItem('dance_floor', { x: 15, y: 10 });
    settle();
    const a = s().project.otherOptions![0]!.id;
    s().switchOption(a);
    expect(s().project.items).toHaveLength(1);
    expect(s().selection).toEqual([]);
    history.undo();
    expect(s().project.items).toHaveLength(2);
  });

  it('renames, marks final and deletes options; the last one stays', () => {
    s().addOption();
    const b = s().project.option!.id;
    s().renameOption(b, '  Peonia rozë  ');
    expect(s().project.option?.name).toBe('Peonia rozë');
    s().setFinalOption(b);
    expect(s().project.finalOptionId).toBe(b);
    s().deleteOption(b); // deleting the active option switches to another one
    expect(s().project.option?.name).toBe('Opsioni A');
    expect(s().project.finalOptionId).toBeUndefined();
    expect(s().project.otherOptions).toEqual([]);
    s().deleteOption(s().project.option!.id);
    expect(s().project.option?.name).toBe('Opsioni A');
  });
});

describe('plan annotations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reset();
  });
  afterEach(() => vi.useRealTimers());
  const s = () => useEditor.getState();

  it('adds, moves, edits and removes annotations as undoable steps', async () => {
    const { scaleUnderlay } = await import('../features/editor/UnderlaySettings');
    s().addAnnotation({ id: 'm', kind: 'measure', x1: 1, y1: 1, x2: 5, y2: 4 });
    expect(s().annotationId).toBe('m');
    s().moveAnnotation('m', 0.5, -0.25);
    expect(s().project.annotations![0]).toMatchObject({ x1: 1.5, y1: 0.75, x2: 5.5, y2: 3.75 });
    s().addAnnotation({ id: 'z', kind: 'zone', x: 2, y: 2, width: 3, height: 2, color: '#C9A44C' });
    s().updateAnnotation('z', { label: 'Zona e fotografisë' });
    s().setSelection([]);
    expect(s().annotationId).toBeNull();
    s().removeAnnotation('m');
    expect(s().project.annotations!.map((a) => a.id)).toEqual(['z']);
    history.undo();
    expect(s().project.annotations!.map((a) => a.id)).toEqual(['m', 'z']);
    expect(Project.safeParse(s().project).success).toBe(true);

    // Two-point calibration scales the floor-plan photo around the first point.
    const u = { url: '/uploads/images/a.png', x: 0, y: 0, width: 20, height: 10, opacity: 0.5 };
    expect(scaleUnderlay(u, 1.5, { x: 10, y: 0 })).toEqual({
      ...u,
      x: -5,
      y: 0,
      width: 30,
      height: 15,
    });
  });
});
