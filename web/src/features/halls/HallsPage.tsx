import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash } from 'lucide-react';
import { formatMeters, type Hall, type HallTemplate } from '@salla/shared';
import { api } from '../../api/client';
import { sq } from '../../i18n/sq';
import { navigate } from '../../model/router';
import { ConfirmDialog } from '../editor/ConfirmDialog';
import { AppShell } from '../shell/AppShell';

const NEW_HALL: Hall = {
  name: sq.halls.newHallName,
  width: 20,
  length: 12,
  height: 4,
  floor: 'parket',
  floorColor: '#B98A5E',
  wallColor: '#F3EBDD',
  structure: [],
};

export function HallsPage() {
  const [halls, setHalls] = useState<HallTemplate[] | null>(null);
  const [error, setError] = useState(false);
  const [toDelete, setToDelete] = useState<HallTemplate | null>(null);

  const load = useCallback(async () => {
    try {
      setHalls(await api.get<HallTemplate[]>('/api/halls'));
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    const t = await api.post<HallTemplate>('/api/halls', { hall: NEW_HALL });
    navigate({ name: 'hall', id: t.id });
  };

  const remove = async () => {
    if (!toDelete) return;
    await api.del(`/api/halls/${toDelete.id}`);
    setToDelete(null);
    await load();
  };

  return (
    <AppShell active="halls">
      <div className="page-head">
        <h1 className="title-serif">{sq.halls.title}</h1>
        <button type="button" className="btn btn-primary" onClick={() => void create()}>
          <Plus size={18} />
          <span>{sq.halls.newHall}</span>
        </button>
      </div>
      {error && <p className="form-error">{sq.errors.offline}</p>}
      {halls?.length === 0 && <p className="muted empty">{sq.halls.empty}</p>}
      <ul className="card-list">
        {halls?.map((t) => (
          <li key={t.id} className="card">
            <button
              type="button"
              className="card-main"
              onClick={() => navigate({ name: 'hall', id: t.id })}
            >
              <span className="card-title">
                {t.hall.name} {t.example && <span className="pill">{sq.halls.example}</span>}
              </span>
              <span className="card-sub mono">
                {formatMeters(t.hall.width)} × {formatMeters(t.hall.length)} ×{' '}
                {formatMeters(t.hall.height)}
              </span>
              <span className="card-meta muted small">
                {sq.hall.floorTypes[t.hall.floor]} ·{' '}
                {sq.halls.structureCount(t.hall.structure.length)}
              </span>
            </button>
            <div className="card-side">
              <div className="card-actions">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => navigate({ name: 'hall', id: t.id })}
                  title={sq.halls.edit}
                  aria-label={sq.halls.edit}
                >
                  <Pencil size={18} />
                </button>
                <button
                  type="button"
                  className="icon-btn btn-danger"
                  onClick={() => setToDelete(t)}
                  title={sq.halls.delete}
                  aria-label={sq.halls.delete}
                >
                  <Trash size={18} />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!toDelete}
        title={sq.halls.deleteTitle}
        onClose={() => setToDelete(null)}
        onConfirm={() => void remove()}
        confirmLabel={sq.halls.delete}
        danger
      >
        <p>{toDelete ? sq.halls.deleteBody(toDelete.hall.name) : ''}</p>
      </ConfirmDialog>
    </AppShell>
  );
}
