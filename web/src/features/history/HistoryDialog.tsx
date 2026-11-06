import { useEffect, useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import { formatDateTime, formatEUR, type Project } from '@salla/shared';
import { api, ApiError } from '../../api/client';
import { Modal } from '../../components/Modal';
import { sq } from '../../i18n/sq';
import { flushSave, resetAutosave } from '../../model/autosave';
import { useEditor } from '../../model/store';
import { ConfirmDialog } from '../editor/ConfirmDialog';

interface VersionRow {
  id: string;
  version: number;
  updatedBy: string;
  savedAt: string;
  name: string;
  itemCount: number;
  optionCount: number;
  guestCount: number;
  total: number;
}

/** "Historiku": earlier versions of the project (automatic snapshots) and restoring one. */
export function HistoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title={sq.history.title} onClose={onClose} wide>
      {open && <HistoryBody onClose={onClose} />}
    </Modal>
  );
}

function HistoryBody({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<VersionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<VersionRow | null>(null);
  const [busy, setBusy] = useState(false);
  const meta = useEditor((s) => s.meta);

  useEffect(() => {
    if (!meta) return;
    let alive = true;
    // Save pending edits first so the list and the restore start from the latest state.
    void flushSave()
      .then(() => api.get<VersionRow[]>(`/api/projects/${meta.id}/versions`))
      .then((r) => alive && setRows(r))
      .catch(() => alive && setError(sq.errors.offline));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per opening
  }, [meta?.id]);

  const restore = async (v: VersionRow) => {
    const m = useEditor.getState().meta;
    if (!m) return;
    setBusy(true);
    setError(null);
    try {
      await flushSave();
      const restored = await api.post<Project>(`/api/projects/${m.id}/versions/${v.id}/restore`, {
        version: useEditor.getState().meta!.version,
      });
      useEditor.getState().openProject(restored);
      resetAutosave(useEditor.getState().project);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409 ? sq.history.conflict : sq.errors.generic,
      );
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <div className="history">
      <p className="muted small">{sq.history.intro}</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {rows === null && !error && <p className="muted">{sq.errors.loading}</p>}
      {rows?.length === 0 && <p className="muted">{sq.history.empty}</p>}
      <ul className="history-list">
        {rows?.map((v) => (
          <li key={v.id} className="history-row">
            <History size={18} aria-hidden className="muted" />
            <div className="history-main">
              <strong>{formatDateTime(v.savedAt)}</strong>
              <span className="muted small">
                {sq.history.by(v.updatedBy)} · v{v.version} · {v.name}
              </span>
              <span className="small mono">
                {sq.projects.items(v.itemCount)}
                {v.optionCount > 1 ? ` · ${sq.history.options(v.optionCount)}` : ''}
                {v.guestCount ? ` · ${sq.guests.count(v.guestCount)}` : ''} · {formatEUR(v.total)}
              </span>
            </div>
            <button type="button" className="btn" disabled={busy} onClick={() => setConfirm(v)}>
              <RotateCcw size={16} />
              <span>{sq.history.restore}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="dialog-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>
          {sq.common.close}
        </button>
      </div>
      <ConfirmDialog
        open={!!confirm}
        title={sq.history.confirmTitle}
        confirmLabel={sq.history.restore}
        onConfirm={() => confirm && void restore(confirm)}
        onClose={() => setConfirm(null)}
      >
        <p>{confirm ? sq.history.confirmBody(formatDateTime(confirm.savedAt)) : ''}</p>
      </ConfirmDialog>
    </div>
  );
}
