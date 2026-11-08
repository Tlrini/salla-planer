import { useState } from 'react';
import type { CatalogItem } from '@salla/shared';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { sq } from '../../i18n/sq';
import { loadCatalog } from '../../model/bootstrap';
import { catalog } from '../../model/store';

interface Props {
  /** The scanned library item, or null when the dialog is closed. */
  scan: CatalogItem | null;
  onClose: () => void;
  onAssigned: (target: CatalogItem) => void;
}

/** Admin: make a scanned chair or table the 3D model of a built-in catalog item. */
export function AssignModelDialog({ scan, onClose, onAssigned }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const targets = catalog.filter((c) => c.category === 'tables' && c.source !== 'library');

  const assign = async (target: CatalogItem) => {
    if (!scan) return;
    setBusy(target.id);
    setFailed(false);
    try {
      await api.post(`/api/catalog/${target.id}/model-from-library`, { libraryId: scan.id });
      await loadCatalog();
      onAssigned(target);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open={!!scan}
      title={scan ? sq.library.assignTitle(scan.name) : ''}
      onClose={onClose}
      actions={
        <button type="button" className="btn" onClick={onClose}>
          {sq.common.cancel}
        </button>
      }
    >
      <p>{sq.library.assignBody}</p>
      {failed && (
        <p className="form-error" role="alert">
          {sq.library.assignError}
        </p>
      )}
      <ul className="assign-list">
        {targets.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className="btn"
              disabled={busy !== null}
              onClick={() => void assign(t)}
            >
              <span>{busy === t.id ? sq.library.assigning : t.name}</span>
              {t.modelFile && <span className="muted small">{sq.library.hasModel}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
