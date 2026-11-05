import type { ReactNode } from 'react';
import { Modal } from '../../components/Modal';
import { sq } from '../../i18n/sq';

interface Props {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  onConfirm?: () => void;
  onClose: () => void;
  danger?: boolean;
}

/** In-page confirm dialog (never window.confirm). */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
  danger,
}: Props) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {sq.common.cancel}
          </button>
          {onConfirm && (
            <button
              type="button"
              className={danger ? 'btn btn-danger-solid' : 'btn btn-primary'}
              onClick={onConfirm}
            >
              {confirmLabel ?? sq.common.confirm}
            </button>
          )}
        </>
      }
    >
      {children}
    </Modal>
  );
}
