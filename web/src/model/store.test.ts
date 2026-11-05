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
