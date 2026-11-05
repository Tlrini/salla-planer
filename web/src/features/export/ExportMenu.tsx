import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileDown, Image } from 'lucide-react';
import { sq } from '../../i18n/sq';
import { useEditor } from '../../model/store';
import { useUi } from '../../model/ui';

type Job = 'pdf' | 'plan' | '3d';

/** "Eksporto PDF" plus PNG downloads for the plan and the 3D view. Export code loads on demand. */
export function ExportMenu() {
  const [busy, setBusy] = useState<Job | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  const run = async (job: Job) => {
    setOpen(false);
    setBusy(job);
    setError(false);
    try {
      const ex = await import('./exporter');
      const project = useEditor.getState().project;
      const { evening, camera } = useUi.getState();
      if (job === 'pdf') await ex.exportPdf(project, evening);
      else if (job === 'plan') await ex.exportPlanPng(project);
      else await ex.export3dPng(project, camera, evening);
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="export-menu" ref={wrap}>
      <button
        type="button"
        className="btn btn-primary hide-narrow"
        disabled={!!busy}
        onClick={() => void run('pdf')}
        data-testid="export-pdf"
      >
        <FileDown size={18} />
        <span>{busy ? sq.export.preparing : sq.export.pdf}</span>
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={sq.export.more}
        title={sq.export.more}
        disabled={!!busy}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronDown size={18} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="menu-item show-narrow"
            onClick={() => void run('pdf')}
          >
            <FileDown size={18} />
            <span>{sq.export.pdf}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => void run('plan')}
          >
            <Image size={18} />
            <span>{sq.export.pngPlan}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => void run('3d')}
          >
            <Image size={18} />
            <span>{sq.export.png3d}</span>
          </button>
        </div>
      )}
      {error && (
        <p className="menu-error" role="alert">
          {sq.export.failed}
        </p>
      )}
    </div>
  );
}
