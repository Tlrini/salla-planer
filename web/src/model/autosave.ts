import { useEffect } from 'react';
import { ProjectInput, type HallTemplate, type Project } from '@salla/shared';
import { api, ApiError } from '../api/client';
import { useEditor } from './store';
import { useUi } from './ui';

const AUTOSAVE_DELAY_MS = 1500;

let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight: Promise<void> | null = null;
/** The project object last sent to the server; anything newer still needs saving. */
let lastSent: Project | null = null;

const setStatus = (save: ReturnType<typeof useUi.getState>['save']) =>
  useUi.getState().set({ save });

/** Save the open project / hall template now. One request at a time; reschedules if edits arrive meanwhile. */
export async function flushSave(): Promise<void> {
  clearTimeout(timer);
  timer = undefined;
  if (inFlight) {
    await inFlight;
    if (useEditor.getState().project !== lastSent) return flushSave();
    return;
  }
  const { project, meta } = useEditor.getState();
  if (!meta || useUi.getState().save.kind === 'conflict') return;
  lastSent = project;
  setStatus({ kind: 'saving' });
  inFlight = (async () => {
    try {
      if (meta.kind === 'project') {
        const saved = await api.put<Project>(`/api/projects/${meta.id}`, {
          ...ProjectInput.parse(project),
          version: meta.version,
        });
        useEditor.getState().setMeta({ version: saved.version });
      } else {
        await api.put<HallTemplate>(`/api/halls/${meta.id}`, {
          hall: { ...project.hall, structure: project.items },
        });
      }
      setStatus({ kind: 'saved', at: new Date() });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setStatus({ kind: 'conflict', by: String(err.body?.updatedBy ?? '') });
      } else {
        setStatus({ kind: 'error' });
        lastSent = null;
      }
    } finally {
      inFlight = null;
    }
  })();
  await inFlight;
  // Edits made while the request was running get their own save.
  if (useEditor.getState().project !== lastSent && useUi.getState().save.kind === 'saved')
    schedule();
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => void flushSave(), AUTOSAVE_DELAY_MS);
}

/** Autosave 1.5 s after the last change (one request per pause, never per drag event). */
export function useAutosave(): void {
  useEffect(() => {
    lastSent = useEditor.getState().project;
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.project === prev.project || !s.meta) return;
      // A different project/hall was just opened: nothing to save.
      if (s.meta.id !== prev.meta?.id) return;
      if (s.project === lastSent) return;
      if (useUi.getState().save.kind === 'conflict') return;
      setStatus({ kind: 'saving' });
      schedule();
    });
    const onHide = () => {
      if (timer) void flushSave();
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      unsub();
      window.removeEventListener('pagehide', onHide);
      if (timer) void flushSave();
    };
  }, []);
}

/** Forget pending state when switching to another project. */
export function resetAutosave(project: Project): void {
  clearTimeout(timer);
  timer = undefined;
  lastSent = project;
  setStatus({ kind: 'saved', at: new Date() });
}
