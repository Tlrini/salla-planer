import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ReactNode;
  /** Buttons in the footer. */
  actions?: ReactNode;
  wide?: boolean;
}

/** In-page modal dialog built on <dialog> (never window.confirm/alert/prompt). */
export function Modal({ open, title, onClose, children, actions, wide }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={wide ? 'dialog dialog-wide' : 'dialog'}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open && (
        <>
          <h2>{title}</h2>
          <div className="dialog-body">{children}</div>
          {actions && <div className="dialog-actions">{actions}</div>}
        </>
      )}
    </dialog>
  );
}
