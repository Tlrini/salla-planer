import { create, useStore } from 'zustand';
import { temporal, type TemporalState } from 'zundo';
import { nanoid } from 'nanoid';
import {
  DEFAULT_CATALOG,
  EXAMPLE_HALLS,
  catalogById,
  clampToHall,
  findFreeSpot,
  isTentPole,
  mountPatch,
  tentPoles,
  normalizeAngle,
  snap,
  type CatalogItem,
  type DesignOption,
  type Hall,
  type Item,
  type Mount,
  type Annotation,
  type OptionRef,
  type Project,
  type Viewpoint,
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
  /** Selected plan annotation (measure / text / zone); never together with an item selection. */
  annotationId: string | null;
  meta: EditorMeta | null;
  addItem: (type: string, at: { x: number; y: number }, exact?: boolean) => string;
  /**
   * Add a new item exactly at a 3D drop point: on the floor, on the wall nearest to `at`
   * (with `at.elevation` as its bottom edge) or on the ceiling. Selects it; one undo step.
   */
  addPlacedItem: (
    type: string,
    mount: Mount,
    at: { x: number; y: number; elevation?: number },
  ) => string;
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
  openHall: (id: string, hall: Hall, version?: number) => void;
  setMeta: (patch: Partial<EditorMeta>) => void;
  setSelection: (ids: string[]) => void;
  /** Put a table-top decor (catalog id) on these tables, or remove it (undefined). One undo step. */
  setTableDecor: (tableIds: readonly string[], decor: string | undefined) => void;
  /** Copy the current option into a new one and switch to it ("Opsioni B"). Returns its id. */
  addOption: () => string;
  switchOption: (id: string) => void;
  renameOption: (id: string, name: string) => void;
  deleteOption: (id: string) => void;
  setFinalOption: (id: string | undefined) => void;
  /** Save an eye-level view (walk mode) under an automatic name ("Pamja 3"). Returns it. */
  addViewpoint: (pose: Omit<Viewpoint, 'id' | 'name'>) => Viewpoint;
  addAnnotation: (a: Annotation) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  /** Move an annotation by (dx, dy) meters (one undo step per finished drag). */
  moveAnnotation: (id: string, dx: number, dy: number) => void;
  removeAnnotation: (id: string) => void;
  selectAnnotation: (id: string | null) => void;
  removeViewpoint: (id: string) => void;
}

/** The active option of a project (a single-option project has an implicit one). */
export function activeOption(p: Project): OptionRef {
  return p.option ?? { id: 'A', name: sq.options.name(0) };
}

/** All options in display order: the active one keeps its place among the others. */
export function allOptions(p: Project): OptionRef[] {
  const active = activeOption(p);
  const list = [active, ...(p.otherOptions ?? []).map(({ id, name }) => ({ id, name }))];
  return list.sort((a, b) => a.name.localeCompare(b.name, 'sq', { numeric: true }));
}

function nextOptionName(p: Project): string {
  const used = new Set([activeOption(p).name, ...(p.otherOptions ?? []).map((o) => o.name)]);
  for (let i = 0; ; i++) if (!used.has(sq.options.name(i))) return sq.options.name(i);
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
      annotationId: null,
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

      addPlacedItem: (type, mount, at) => {
        const { project } = get();
        const draft = createItem(type, at);
        const placed = { ...draft, ...mountPatch(draft, mount, project.hall, catalogMap, at) };
        const item = { ...placed, x: snap(placed.x, 0.01), y: snap(placed.y, 0.01) };
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
          // Wall items always face the room: turning them would push them into the wall.
          if (ids.includes(it.id) && !it.locked && it.mount !== 'wall')
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
        const { project, meta } = get();
        const hall = { ...project.hall, ...patch };
        const isTent = hall.kind === 'tende';
        const wasTent = project.hall.kind === 'tende';
        const resized = patch.width || patch.length || patch.height;
        let items = project.items;
        if (isTent !== wasTent || (isTent && resized)) {
          // The tent's poles follow its size. In the hall editor the items are the structure.
          const inTemplate = meta?.kind === 'hall';
          const base = inTemplate ? project.items : hall.structure;
          const next = [...base.filter((i) => !isTentPole(i)), ...(isTent ? tentPoles(hall) : [])];
          if (inTemplate) items = next;
          else hall.structure = next;
        }
        set({ project: { ...project, hall, items, updatedAt: new Date().toISOString() } });
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

      openHall: (id, hall, version = 0) => {
        const project = {
          ...newProject(),
          id,
          name: hall.name,
          hall: { ...hall, structure: [] },
          items: hall.structure,
        };
        set({ project, selection: [], meta: { kind: 'hall', id, version } });
        useEditor.temporal.getState().clear();
      },

      setMeta: (patch) => {
        const meta = get().meta;
        if (meta) set({ meta: { ...meta, ...patch } });
      },

      setSelection: (ids) => set({ selection: ids, annotationId: null }),

      addAnnotation: (a) => {
        const { project } = get();
        set({
          project: {
            ...project,
            annotations: [...(project.annotations ?? []), a],
            updatedAt: new Date().toISOString(),
          },
          annotationId: a.id,
          selection: [],
        });
      },

      updateAnnotation: (id, patch) => {
        const { project } = get();
        set({
          project: {
            ...project,
            annotations: (project.annotations ?? []).map((a) =>
              a.id === id ? ({ ...a, ...patch } as Annotation) : a,
            ),
            updatedAt: new Date().toISOString(),
          },
        });
      },

      moveAnnotation: (id, dx, dy) => {
        if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return;
        const a = get().project.annotations?.find((x) => x.id === id);
        if (!a) return;
        const r = (v: number) => snap(v, 0.01);
        get().updateAnnotation(
          id,
          a.kind === 'measure'
            ? { x1: r(a.x1 + dx), y1: r(a.y1 + dy), x2: r(a.x2 + dx), y2: r(a.y2 + dy) }
            : { x: r(a.x + dx), y: r(a.y + dy) },
        );
      },

      removeAnnotation: (id) => {
        const { project } = get();
        set({
          project: {
            ...project,
            annotations: (project.annotations ?? []).filter((a) => a.id !== id),
            updatedAt: new Date().toISOString(),
          },
          annotationId: null,
        });
      },

      selectAnnotation: (id) => set({ annotationId: id, selection: [] }),

      setTableDecor: (tableIds, decor) => {
        const patches: Record<string, Partial<Item>> = {};
        for (const id of tableIds) patches[id] = { tableDecor: decor };
        get().updateItems(patches);
      },

      addOption: () => {
        const { project } = get();
        const current: DesignOption = { ...activeOption(project), items: project.items };
        const created: OptionRef = { id: nanoid(8), name: nextOptionName(project) };
        set({
          project: {
            ...project,
            option: created,
            otherOptions: [...(project.otherOptions ?? []), current],
            items: project.items.map((i) => ({ ...i })),
            updatedAt: new Date().toISOString(),
          },
          selection: [],
        });
        return created.id;
      },

      switchOption: (id) => {
        const { project } = get();
        const others = project.otherOptions ?? [];
        const target = others.find((o) => o.id === id);
        if (!target) return;
        const current: DesignOption = { ...activeOption(project), items: project.items };
        set({
          project: {
            ...project,
            option: { id: target.id, name: target.name },
            otherOptions: others.map((o) => (o.id === id ? current : o)),
            items: target.items,
            updatedAt: new Date().toISOString(),
          },
          selection: [],
        });
      },

      renameOption: (id, name) => {
        const { project } = get();
        const clean = name.trim().slice(0, 40);
        if (!clean) return;
        const active = activeOption(project);
        set({
          project: {
            ...project,
            option: active.id === id ? { ...active, name: clean } : project.option,
            otherOptions: (project.otherOptions ?? []).map((o) =>
              o.id === id ? { ...o, name: clean } : o,
            ),
            updatedAt: new Date().toISOString(),
          },
        });
      },

      deleteOption: (id) => {
        const { project } = get();
        const others = project.otherOptions ?? [];
        if (!others.length) return; // the last option cannot be deleted
        const finalOptionId = project.finalOptionId === id ? undefined : project.finalOptionId;
        if (activeOption(project).id === id) {
          const [next, ...rest] = others;
          set({
            project: {
              ...project,
              option: { id: next!.id, name: next!.name },
              otherOptions: rest,
              items: next!.items,
              finalOptionId,
              updatedAt: new Date().toISOString(),
            },
            selection: [],
          });
        } else {
          set({
            project: {
              ...project,
              otherOptions: others.filter((o) => o.id !== id),
              finalOptionId,
              updatedAt: new Date().toISOString(),
            },
          });
        }
      },

      addViewpoint: (pose) => {
        const { project } = get();
        const list = project.viewpoints ?? [];
        const used = new Set(list.map((v) => v.name));
        let n = list.length + 1;
        while (used.has(sq.walk.viewName(n))) n++;
        const vp: Viewpoint = {
          id: nanoid(8),
          name: sq.walk.viewName(n),
          x: snap(pose.x, 0.01),
          y: snap(pose.y, 0.01),
          yaw: Math.round(pose.yaw * 10) / 10,
          pitch: Math.max(-89, Math.min(89, Math.round(pose.pitch * 10) / 10)),
        };
        set({
          project: { ...project, viewpoints: [...list, vp], updatedAt: new Date().toISOString() },
        });
        return vp;
      },

      removeViewpoint: (id) => {
        const { project } = get();
        set({
          project: {
            ...project,
            viewpoints: (project.viewpoints ?? []).filter((v) => v.id !== id),
            updatedAt: new Date().toISOString(),
          },
        });
      },

      setFinalOption: (id) => {
        const { project } = get();
        set({ project: { ...project, finalOptionId: id, updatedAt: new Date().toISOString() } });
      },
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
