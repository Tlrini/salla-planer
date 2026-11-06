import { Trash, X } from 'lucide-react';
import { formatMeters, type Annotation } from '@salla/shared';
import { sq } from '../../i18n/sq';
import { useEditor } from '../../model/store';
import { ColorField, NumberField, TextField } from './fields';

/** Right panel for a selected plan annotation (measure, text or zone). */
export function AnnotationProperties({ annotation: a }: { annotation: Annotation }) {
  const s = useEditor.getState;
  const update = (patch: Partial<Annotation>) => s().updateAnnotation(a.id, patch);
  return (
    <div className="panel-section">
      <div className="panel-heading">
        <h2>{sq.annotate.title}</h2>
        <button
          type="button"
          className="icon-btn"
          onClick={() => s().selectAnnotation(null)}
          aria-label={sq.props.deselect}
          title={sq.props.deselect}
        >
          <X size={18} />
        </button>
      </div>
      {a.kind === 'measure' && (
        <div className="field">
          <span className="field-label">{sq.annotate.length}</span>
          <span className="readonly mono">
            {formatMeters(Math.hypot(a.x2 - a.x1, a.y2 - a.y1), 2)}
          </span>
        </div>
      )}
      {a.kind === 'text' && (
        <>
          <TextField
            label={sq.annotate.textLabel}
            value={a.text}
            onCommit={(v) => v.trim() && update({ text: v.trim().slice(0, 200) })}
          />
          <NumberField
            label={sq.annotate.size}
            value={a.size}
            unit="m"
            min={0.1}
            max={3}
            onCommit={(v) => v && update({ size: v })}
          />
        </>
      )}
      {a.kind === 'zone' && (
        <>
          <TextField
            label={sq.annotate.label}
            value={a.label ?? ''}
            onCommit={(v) => update({ label: v.trim().slice(0, 80) || undefined })}
          />
          <div className="field-row">
            <NumberField
              label={sq.props.width}
              value={a.width}
              unit="m"
              min={0.1}
              max={500}
              onCommit={(v) => v && update({ width: v })}
            />
            <NumberField
              label={sq.props.depth}
              value={a.height}
              unit="m"
              min={0.1}
              max={500}
              onCommit={(v) => v && update({ height: v })}
            />
          </div>
          <ColorField
            label={sq.annotate.color}
            value={a.color}
            onChange={(color) => update({ color })}
          />
        </>
      )}
      <button type="button" className="btn btn-danger" onClick={() => s().removeAnnotation(a.id)}>
        <Trash size={18} />
        <span>{sq.annotate.delete}</span>
      </button>
    </div>
  );
}
