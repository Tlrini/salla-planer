import { useState } from 'react';
import { ProjectInput, type Project } from '@salla/shared';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { sq } from '../../i18n/sq';
import { resetAutosave } from '../../model/autosave';
import { navigate } from '../../model/router';
import { useEditor } from '../../model/store';
import { useUi } from '../../model/ui';

/**
 * Shown when the server rejects a save because someone else saved a newer version (409).
 * Never overwrites silently: reload theirs, or keep ours as a new copy.
 */
export function ConflictDialog() {
  const save = useUi((s) => s.save);
  const [busy, setBusy] = useState(false);
  const open = save.kind === 'conflict';

  const reload = async () => {
    const meta = useEditor.getState().meta;
    if (!meta) return;
    setBusy(true);
    try {
      const fresh = await api.get<Project>(`/api/projects/${meta.id}`);
      useEditor.getState().openProject(fresh);
      resetAutosave(useEditor.getState().project);
    } finally {
      setBusy(false);
    }
  };

  const saveCopy = async () => {
    const { project } = useEditor.getState();
    setBusy(true);
    try {
      const body = ProjectInput.parse({
        ...project,
        name: `${project.name}${sq.project.copySuffix}`,
        status: 'draft',
      });
      const created = await api.post<Project>('/api/projects', body);
      useUi.getState().set({ save: { kind: 'saved', at: new Date() } });
      navigate({ name: 'project', id: created.id });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={sq.conflict.title}
      onClose={() => void reload()}
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
      <p>{open ? sq.conflict.body(save.by) : ''}</p>
    </Modal>
  );
}
