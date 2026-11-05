import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, TriangleExclamationPoint } from 'lucide-react';
import { autoLabels, formatMeters, layoutWarnings, type LayoutWarning } from '@salla/shared';
import { sq } from '../../i18n/sq';
import { catalogMap, useEditor } from '../../model/store';
import { useDebounced } from '../../model/useDebounced';

/** Small non-blocking badge: overlaps, narrow aisles, too few seats. Click a warning to select the items. */
export function WarningsBadge() {
  const items = useDebounced(
    useEditor((s) => s.project.items),
    300,
  );
  const guestTarget = useEditor((s) => s.project.guestTarget);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const warnings = useMemo(
    () => layoutWarnings(items, catalogMap, guestTarget),
    [items, guestTarget],
  );
  const labels = useMemo(() => autoLabels(items, catalogMap), [items]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  const name = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return '';
    return item.label?.trim() || labels.get(id) || catalogMap.get(item.type)?.name || item.type;
  };

  const text = (w: LayoutWarning) =>
    w.kind === 'overlap'
      ? sq.warnings.overlap(name(w.ids[0]), name(w.ids[1]))
      : w.kind === 'aisle'
        ? sq.warnings.aisle(name(w.ids[0]), name(w.ids[1]), formatMeters(w.gap, 2))
        : sq.warnings.seats(w.missing);

  const n = warnings.length;
  return (
    <div className="warnings" ref={wrap}>
      <button
        type="button"
        className={`warn-badge ${n ? 'has' : ''}`}
        aria-expanded={open}
        aria-label={`${sq.warnings.title}: ${n}`}
        title={sq.warnings.title}
        onClick={() => setOpen((o) => !o)}
      >
        {n ? <TriangleExclamationPoint size={16} /> : <Check size={16} />}
        <span className="mono">{n}</span>
      </button>
      {open && (
        <div className="menu warnings-list" role="dialog" aria-label={sq.warnings.title}>
          <strong>{sq.warnings.title}</strong>
          {n === 0 && <p className="muted small">{sq.warnings.none}</p>}
          {warnings.slice(0, 30).map((w, i) => (
            <button
              key={i}
              type="button"
              className="menu-item"
              onClick={() => {
                if (w.kind !== 'seats') useEditor.getState().setSelection([...w.ids]);
                setOpen(false);
              }}
            >
              {text(w)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
