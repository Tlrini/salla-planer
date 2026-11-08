import { useState } from 'react';
import { FileSignature } from 'lucide-react';
import { chosenItems, formatEUR, projectTotal } from '@salla/shared';
import { Modal } from '../../components/Modal';
import { sq } from '../../i18n/sq';
import { catalog, useEditor } from '../../model/store';

/** "Kontrata": the contract PDF for the option the client chose. Payments are not handled here. */
export function ContractDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title={sq.contractDialog.title} onClose={onClose}>
      {open && <ContractBody onClose={onClose} />}
    </Modal>
  );
}

function ContractBody({ onClose }: { onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const total = projectTotal(chosenItems(project), project.pricing, catalog);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const download = async () => {
    setBusy(true);
    setError(false);
    try {
      const ex = await import('../export/exporter');
      await ex.exportContractPdf(useEditor.getState().project);
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="contract-dialog">
      <div className="stat">
        <span className="stat-label">{sq.contractDialog.total}</span>
        <span className="stat-value mono">{formatEUR(total)}</span>
      </div>
      <p className="muted small">{sq.contractDialog.hint}</p>
      {error && (
        <p className="form-error" role="alert">
          {sq.export.failed}
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>
          {sq.common.close}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void download()}
        >
          <FileSignature size={18} />
          <span>{busy ? sq.export.preparing : sq.contractDialog.download}</span>
        </button>
      </div>
    </div>
  );
}
