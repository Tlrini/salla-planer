import { useState } from 'react';
import { ProjectInput, type HallTemplate, type Project } from '@salla/shared';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { sq } from '../../i18n/sq';
import { resetAutosave } from '../../model/autosave';
import { navigate } from '../../model/router';
import { useEditor } from '../../model/store';
import { useUi } from '../../model/ui';

/**
 * Shown when the server rejects a save because someone else saved a newer version (409).
 * Never overwrites silently: reload theirs, or keep ours as a new copy. The dialog can only be
 * left through one of those two choices, so Esc never throws away local edits.
 */
export function ConflictDialog({ kind }: { kind: 'project' | 'hall' }) {
  const save = useUi((s) => s.save);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const open = save.kind === 'conflict';

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setFailed(false);
    try {
      await action();
    } catch (err) {
      console.error(err);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const reload = () =>
    run(async () => {
      const meta = useEditor.getState().meta;
      if (!meta) return;
      if (meta.kind === 'hall') {
        const t = await api.get<HallTemplate>(`/api/halls/${meta.id}`);
        useEditor.getState().openHall(t.id, t.hall, t.version);
      } else {
        const fresh = await api.get<Project>(`/api/projects/${meta.id}`);
        useEditor.getState().openProject(fresh);
      }
      resetAutosave(useEditor.getState().project);
    });

  const saveCopy = () =>
    run(async () => {
      const { project } = useEditor.getState();
      if (kind === 'hall') {
        // Hall template: our version becomes a new template.
        const name = `${project.hall.name}${sq.project.copySuffix}`;
        const created = await api.post<HallTemplate>('/api/halls', {
          hall: { ...project.hall, name, structure: project.items },
        });
        resetAutosave(project);
        navigate({ name: 'hall', id: created.id });
        return;
      }
      const body = ProjectInput.parse({
        ...project,
        name: `${project.name}${sq.project.copySuffix}`,
        status: 'draft',
      });
      const created = await api.post<Project>('/api/projects', body);
      // Our edits now live in the copy; the original must not be saved over theirs on the way out.
      resetAutosave(project);
      navigate({ name: 'project', id: created.id });
    });

  return (
    <Modal
      open={open}
      title={sq.conflict.title}
      onClose={() => {}}
      actions={
        <>
          <button type="button" className="btn" disabled={busy} onClick={() => void saveCopy()}>
            {sq.conflict.saveCopy}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void reload()}
          >
            {sq.conflict.reload}
          </button>
        </>
      }
    >
      <p>
        {open ? (kind === 'hall' ? sq.conflict.hallBody(save.by) : sq.conflict.body(save.by)) : ''}
      </p>
      {failed && (
        <p className="form-error" role="alert">
          {sq.errors.generic}
        </p>
      )}
    </Modal>
  );
}
