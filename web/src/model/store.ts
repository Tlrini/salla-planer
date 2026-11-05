import { create, useStore } from 'zustand';
import { temporal, type TemporalState } from 'zundo';
import { nanoid } from 'nanoid';
import {
  DEFAULT_CATALOG,
  EXAMPLE_HALLS,
  catalogById,
  clampToHall,
  findFreeSpot,
  normalizeAngle,
  snap,
  type CatalogItem,
  type Hall,
  type Item,
  type Project,
} from '@salla/shared';
import { sq } from '../i18n/sq';

const DUPLICATE_OFFSET = 0.5;

/**
 * The catalog in use. Starts with the defaults and is replaced by the server catalog after
 * login (setCatalog). Mutated in place so non-React code can read it without subscribing.
 */
export const catalog: CatalogItem[] = [...DEFAULT_CATALOG];
export const catalogMap: Map<string, CatalogItem> = catalogById(DEFAULT_CATALOG);

const useCatalogStore = create<{ version: number }>()(() => ({ version: 0 }));

export function setCatalog(list: readonly CatalogItem[]): void {
  catalog.splice(0, catalog.length, ...list);
  catalogMap.clear();
  for (const c of list) catalogMap.set(c.id, c);
  useCatalogStore.setState((s) => ({ version: s.version + 1 }));
}

/** Re-render when the catalog changes (admin edits, first load). */
export function useCatalogVersion(): number {
  return useCatalogStore((s) => s.version);
}

/** What the open editor saves to. Kept outside undo history. */
export interface EditorMeta {
  kind: 'project' | 'hall';
  id: string;
  /** Server version for optimistic locking (projects only). */
  version: number;
}

export function newProject(
  hallTemplateId = EXAMPLE_HALLS[0]!.id,
  name: string = sq.project.defaultName,
): Project {
  const template = EXAMPLE_HALLS.find((h) => h.id === hallTemplateId) ?? EXAMPLE_HALLS[0]!;
  const now = new Date().toISOString();
  return {
    id: nanoid(),
    name,
    clientName: '',
    eventType: 'dasme',
    status: 'draft',
    hall: structuredClone(template.hall),
    items: [],
    createdBy: 'local',
    updatedBy: 'local',
    createdAt: now,
    updatedAt: now,
    version: 0,
  };
}

export function createItem(type: string, at: { x: number; y: number }): Item {
  const cat = catalogMap.get(type);
  if (!cat) throw new Error(`Unknown catalog type ${type}`);
  return {
    id: nanoid(10),
    type,
    x: at.x,
    y: at.y,
    rotation: 0,
    width: cat.width,
    depth: cat.depth,
    color: cat.defaultColor,
    ...(cat.defaultColor2 ? { color2: cat.defaultColor2 } : {}),
  };
}

export interface EditorState {
  project: Project;
  selection: string[];
  meta: EditorMeta | null;
  addItem: (type: string, at: { x: number; y: number }, exact?: boolean) => string;
  /** Add several new items of one type at exact positions, as one undo step. */
  addItemsAt: (type: string, positions: ReadonlyArray<{ x: number; y: number }>) => string[];
  /** Apply patches to several items in one history step. Unchanged patches are ignored. */
  updateItems: (patches: Record<string, Partial<Item>>) => void;
  removeItems: (ids: readonly string[]) => void;
  duplicateItems: (ids: readonly string[]) => void;
  rotateItems: (ids: readonly string[], delta: number) => void;
  nudgeItems: (ids: readonly string[], dx: number, dy: number) => void;
  updateHall: (patch: Partial<Hall>) => void;
  updateProject: (patch: Partial<Omit<Project, 'id' | 'items' | 'hall' | 'version'>>) => void;
  replaceProject: (project: Project) => void;
  /** Open a server project (clears undo history). */
  openProject: (project: Project) => void;
  /** Open a hall template: its structure items become the editable items. */
  openHall: (id: string, hall: Hall) => void;
  setMeta: (patch: Partial<EditorMeta>) => void;
  setSelection: (ids: string[]) => void;
}

function patchChanges(item: Item, patch: Partial<Item>): boolean {
  return (Object.keys(patch) as Array<keyof Item>).some((k) => item[k] !== patch[k]);
}

function touch(p: Project, items: Item[]): Project {
  return { ...p, items, updatedAt: new Date().toISOString() };
}

export const useEditor = create<EditorState>()(
  temporal(
    (set, get) => ({
      project: newProject(),
      selection: [],
      meta: null,

      addItem: (type, at, exact = false) => {
        const { project } = get();
        const draft = createItem(type, at);
        const pos = exact
          ? clampToHall(draft, project.hall, catalogMap.get(type))
          : findFreeSpot(draft, at, project.items, project.hall, catalogMap);
        const item = { ...draft, x: snap(pos.x, 0.01), y: snap(pos.y, 0.01) };
        set({ project: touch(project, [...project.items, item]), selection: [item.id] });
        return item.id;
      },

      addItemsAt: (type, positions) => {
        const { project } = get();
        const added = positions.map((p) => createItem(type, p));
        if (!added.length) return [];
        set({
          project: touch(project, [...project.items, ...added]),
          selection: added.map((i) => i.id),
        });
        return added.map((i) => i.id);
      },

      updateItems: (patches) => {
        const { project } = get();
        let changed = false;
        const items = project.items.map((it) => {
          const patch = patches[it.id];
          if (!patch || !patchChanges(it, patch)) return it;
          changed = true;
          return { ...it, ...patch };
        });
        if (changed) set({ project: touch(project, items) });
      },

      removeItems: (ids) => {
        const { project } = get();
        const remove = new Set(ids);
        const items = project.items.filter((i) => !remove.has(i.id) || i.locked);
        if (items.length === project.items.length) return;
        set({
          project: touch(project, items),
          selection: get().selection.filter((id) => !remove.has(id)),
        });
      },

      duplicateItems: (ids) => {
        const { project } = get();
        const source = project.items.filter((i) => ids.includes(i.id));
        if (source.length === 0) return;
        const copies = source.map((i) => {
          const moved = {
            ...i,
            id: nanoid(10),
            x: i.x + DUPLICATE_OFFSET,
            y: i.y + DUPLICATE_OFFSET,
            locked: false,
          };
          return { ...moved, ...clampToHall(moved, project.hall, catalogMap.get(i.type)) };
        });
        set({
          project: touch(project, [...project.items, ...copies]),
          selection: copies.map((c) => c.id),
        });
      },

      rotateItems: (ids, delta) => {
        const patches: Record<string, Partial<Item>> = {};
        for (const it of get().project.items) {
          if (ids.includes(it.id) && !it.locked)
            patches[it.id] = { rotation: normalizeAngle(it.rotation + delta) };
        }
        get().updateItems(patches);
      },

      nudgeItems: (ids, dx, dy) => {
        const { project } = get();
        const patches: Record<string, Partial<Item>> = {};
        for (const it of project.items) {
          if (!ids.includes(it.id) || it.locked) continue;
          const moved = { ...it, x: snap(it.x + dx, 0.01), y: snap(it.y + dy, 0.01) };
          patches[it.id] = clampToHall(moved, project.hall, catalogMap.get(it.type));
        }
        get().updateItems(patches);
      },

      updateHall: (patch) => {
        const { project } = get();
        set({
          project: {
            ...project,
            hall: { ...project.hall, ...patch },
            updatedAt: new Date().toISOString(),
          },
        });
      },

      updateProject: (patch) => {
        const { project } = get();
        set({ project: { ...project, ...patch, updatedAt: new Date().toISOString() } });
      },

      replaceProject: (project) => set({ project, selection: [] }),

      openProject: (project) => {
        set({
          project,
          selection: [],
          meta: { kind: 'project', id: project.id, version: project.version },
        });
        useEditor.temporal.getState().clear();
      },

      openHall: (id, hall) => {
        const project = {
          ...newProject(),
          id,
          name: hall.name,
          hall: { ...hall, structure: [] },
          items: hall.structure,
        };
        set({ project, selection: [], meta: { kind: 'hall', id, version: 0 } });
        useEditor.temporal.getState().clear();
      },

      setMeta: (patch) => {
        const meta = get().meta;
        if (meta) set({ meta: { ...meta, ...patch } });
      },

      setSelection: (ids) => set({ selection: ids }),
    }),
    {
      limit: 100,
      partialize: (s) => ({ project: s.project }),
      // Every store action is one finished user action (drags and transforms commit only on
      // end, fields commit on blur), so each project change is exactly one undo step.
      equality: (a, b) => a.project === b.project,
    },
  ),
);

type HistoryState = TemporalState<Pick<EditorState, 'project'>>;

export function useHistory<T>(selector: (s: HistoryState) => T): T {
  return useStore(useEditor.temporal, selector);
}

export const history = {
  undo: () => useEditor.temporal.getState().undo(),
  redo: () => useEditor.temporal.getState().redo(),
};
