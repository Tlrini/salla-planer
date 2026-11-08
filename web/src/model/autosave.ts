import { useEffect } from 'react';
import { ProjectInput, type HallTemplate, type Project } from '@salla/shared';
import { api, ApiError } from '../api/client';
import { useEditor } from './store';
import { useUi } from './ui';

const AUTOSAVE_DELAY_MS = 1500;
/** Wait before retrying a save that failed because of the network or the server. */
const RETRY_DELAY_MS = 5000;

let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight: Promise<void> | null = null;
/**
 * The project object last sent to (or loaded from) the server. The store is immutable, so
 * anything that is not this exact object still needs saving.
 */
let lastSent: Project | null = null;

const setStatus = (save: ReturnType<typeof useUi.getState>['save']) =>
  useUi.getState().set({ save });

// ---- edits kept across an expired login ----------------------------------------------------
// When a save is refused with 401 (the session expired or someone logged this user out), the
// app shows the login screen and the editor closes. The unsaved project is kept here (and in
// sessionStorage, so a page reload does not lose it either) and put back when the same
// project/hall is opened again after logging in.

const STASH_KEY = 'salla-unsaved-edits';
/** Older stashes are dropped: by then the user has moved on. */
const STASH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Stash {
  kind: 'project' | 'hall';
  id: string;
  /** Server version the edits were based on. */
  version: number;
  project: Project;
  at: number;
}

let stashed: Stash | null = null;
/** Set by restoreUnsaved before the editor mounts; useAutosave then saves instead of resetting. */
let restoredPending = false;

function writeStash(s: Stash): void {
  stashed = s;
  try {
    sessionStorage.setItem(STASH_KEY, JSON.stringify(s));
  } catch {
    // Private mode or a full storage: the in-memory copy still covers a re-login.
  }
}

function takeStash(kind: Stash['kind'], id: string): Stash | null {
  let s = stashed;
  if (!s) {
    try {
      const raw = sessionStorage.getItem(STASH_KEY);
      s = raw ? (JSON.parse(raw) as Stash) : null;
    } catch {
      s = null;
    }
  }
  if (!s || s.kind !== kind || s.id !== id) return null;
  stashed = null;
  try {
    sessionStorage.removeItem(STASH_KEY);
  } catch {
    // ignore
  }
  return Date.now() - s.at <= STASH_MAX_AGE_MS ? s : null;
}

/**
 * After opening a project/hall from the server: put back edits that could not be saved because
 * the login had expired. Same server version → they are saved normally; someone else saved in
 * between → the conflict dialog offers "reload theirs" or "save mine as a copy".
 */
export function restoreUnsaved(
  kind: Stash['kind'],
  id: string,
  serverVersion: number,
  updatedBy: string | undefined,
): boolean {
  const s = takeStash(kind, id);
  if (!s) return false;
  if (!ProjectInput.safeParse(s.project).success) return false;
  if (s.version !== serverVersion) setStatus({ kind: 'conflict', by: updatedBy ?? '' });
  useEditor.getState().replaceProject(s.project);
  restoredPending = true;
  return true;
}

/** True when the open project / hall template has edits the server does not have yet. */
export function hasUnsavedChanges(): boolean {
  const { project, meta } = useEditor.getState();
  return !!meta && project !== lastSent;
}

/** Network failures and server errors are worth retrying; a rejected body (400) is not. */
const retryable = (err: unknown) =>
  err instanceof ApiError && (err.status === 0 || err.status >= 500);

/**
 * Save the open project / hall template now, if it has unsaved edits. One request at a time;
 * edits made while a request runs get their own save afterwards.
 */
export async function flushSave(): Promise<void> {
  clearTimeout(timer);
  timer = undefined;
  if (inFlight) {
    await inFlight;
    return flushSave();
  }
  const { project, meta } = useEditor.getState();
  if (!meta) return;
  const status = useUi.getState().save;
  if (status.kind === 'conflict') return;
  if (project === lastSent) {
    // E.g. undo back to the saved state while a save was pending.
    if (status.kind === 'saving') setStatus({ kind: 'saved', at: new Date() });
    return;
  }

  // The response may arrive after another project was opened; never apply it to that one.
  const stillOpen = () => useEditor.getState().meta?.id === meta.id;
  lastSent = project;
  setStatus({ kind: 'saving' });
  inFlight = (async () => {
    try {
      if (meta.kind === 'project') {
        const body = ProjectInput.safeParse(project);
        if (!body.success) {
          console.error('Project failed validation, not saved', body.error.issues);
          throw new Error('invalid_project');
        }
        const saved = await api.put<Project>(
          `/api/projects/${meta.id}`,
          { ...body.data, version: meta.version },
          { keepalive: true },
        );
        if (stillOpen()) useEditor.getState().setMeta({ version: saved.version });
      } else {
        const saved = await api.put<HallTemplate>(
          `/api/halls/${meta.id}`,
          {
            hall: { ...project.hall, structure: project.items },
            ...(meta.version ? { version: meta.version } : {}),
          },
          { keepalive: true },
        );
        if (stillOpen() && saved.version) useEditor.getState().setMeta({ version: saved.version });
      }
      if (!stillOpen()) return;
      if (useEditor.getState().project === lastSent) setStatus({ kind: 'saved', at: new Date() });
      else schedule(); // edits arrived meanwhile; the status stays "saving"
    } catch (err) {
      if (!stillOpen()) return;
      if (err instanceof ApiError && err.status === 409) {
        setStatus({ kind: 'conflict', by: String(err.body?.updatedBy ?? '') });
      } else if (err instanceof ApiError && err.status === 401) {
        // Logged out: keep the edits for after the next login (see restoreUnsaved).
        writeStash({
          kind: meta.kind,
          id: meta.id,
          version: meta.version,
          project,
          at: Date.now(),
        });
        lastSent = null;
        setStatus({ kind: 'error' });
      } else {
        lastSent = null;
        setStatus({ kind: 'error' });
        if (retryable(err)) schedule(RETRY_DELAY_MS);
      }
    } finally {
      inFlight = null;
    }
  })();
  await inFlight;
}

function schedule(delay = AUTOSAVE_DELAY_MS) {
  clearTimeout(timer);
  timer = setTimeout(() => void flushSave(), delay);
}

/** Autosave 1.5 s after the last change (one request per pause, never per drag event). */
export function useAutosave(): void {
  useEffect(() => {
    if (restoredPending) {
      // Edits from before an expired login were just put back: save them (unless the
      // conflict dialog is waiting for a decision). lastSent still is the server version.
      restoredPending = false;
      if (useUi.getState().save.kind !== 'conflict') {
        setStatus({ kind: 'saving' });
        schedule();
      }
    } else {
      lastSent = useEditor.getState().project;
    }
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.project === prev.project || !s.meta) return;
      // A different project/hall was just opened: nothing to save.
      if (s.meta.id !== prev.meta?.id) return;
      if (useUi.getState().save.kind === 'conflict') return;
      if (s.project !== lastSent) setStatus({ kind: 'saving' });
      schedule();
    });
    // Closing the tab: send pending edits right away (keepalive lets the request outlive the
    // page) and ask the browser to warn while anything is still unsaved.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges()) return;
      void flushSave();
      e.preventDefault();
    };
    const onHide = () => {
      if (hasUnsavedChanges()) void flushSave();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onHide);
    return () => {
      unsub();
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onHide);
      void flushSave();
    };
  }, []);
}

/**
 * Treat `project` as saved: used after loading it from the server, and when local edits are
 * deliberately dropped (conflict dialog).
 */
export function resetAutosave(project: Project): void {
  clearTimeout(timer);
  timer = undefined;
  lastSent = project;
  setStatus({ kind: 'saved', at: new Date() });
}
