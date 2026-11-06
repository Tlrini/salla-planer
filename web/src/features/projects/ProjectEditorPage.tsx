import { useEffect, useState } from 'react';
import type { HallTemplate, Project } from '@salla/shared';
import { api, ApiError } from '../../api/client';
import { sq } from '../../i18n/sq';
import { flushSave, resetAutosave } from '../../model/autosave';
import { loadCatalog } from '../../model/bootstrap';
import { navigate } from '../../model/router';
import { useEditor } from '../../model/store';
import { useUi } from '../../model/ui';
import { Editor } from '../editor/Editor';

type Load = 'loading' | 'ready' | 'missing' | 'error';

/** Loads a project (or a hall template) from the server into the editor store. */
function useOpen(kind: 'project' | 'hall', id: string): Load {
  const [state, setState] = useState<Load>('loading');
  useEffect(() => {
    let cancelled = false;
    setState('loading');
    useUi.getState().set({ view: '2d', drawer: 'none' });
    void (async () => {
      try {
        // Refresh the catalog too: other agents may have added library decor since login.
        const catalogReady = loadCatalog().catch(() => undefined);
        if (kind === 'project') {
          const [p] = await Promise.all([api.get<Project>(`/api/projects/${id}`), catalogReady]);
          if (cancelled) return;
          useEditor.getState().openProject(p);
          resetAutosave(useEditor.getState().project);
        } else {
          const [t] = await Promise.all([api.get<HallTemplate>(`/api/halls/${id}`), catalogReady]);
          if (cancelled) return;
          useEditor.getState().openHall(t.id, t.hall, t.version);
          resetAutosave(useEditor.getState().project);
        }
        setState('ready');
      } catch (err) {
        if (!cancelled)
          setState(err instanceof ApiError && err.status === 404 ? 'missing' : 'error');
      }
    })();
    return () => {
      cancelled = true;
      void flushSave();
    };
  }, [kind, id]);
  return state;
}

function Status({ state, back }: { state: Load; back: () => void }) {
  return (
    <main className="center-message">
      <p>
        {state === 'loading'
          ? sq.errors.loading
          : state === 'missing'
            ? sq.errors.notFound
            : sq.errors.offline}
      </p>
      {state !== 'loading' && (
        <button type="button" className="btn" onClick={back}>
          {sq.nav.back}
        </button>
      )}
    </main>
  );
}

export function ProjectEditorPage({ id }: { id: string }) {
  const state = useOpen('project', id);
  if (state !== 'ready')
    return <Status state={state} back={() => navigate({ name: 'projects' })} />;
  return <Editor kind="project" key={id} />;
}

export function HallEditorPage({ id }: { id: string }) {
  const state = useOpen('hall', id);
  if (state !== 'ready') return <Status state={state} back={() => navigate({ name: 'halls' })} />;
  return <Editor kind="hall" key={id} />;
}
