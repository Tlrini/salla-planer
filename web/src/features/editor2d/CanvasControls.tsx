import {
  Hand,
  Magnet,
  Maximize2,
  Minus,
  Plus,
  Ruler,
  SquareDashed,
  SquareDashedMousePointer,
  Type,
} from 'lucide-react';
import { sq } from '../../i18n/sq';
import { useUi } from '../../model/ui';

interface Props {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

export function CanvasControls({ onZoomIn, onZoomOut, onFit }: Props) {
  const snap = useUi((s) => s.snap);
  const mode = useUi((s) => s.mode);
  const set = useUi((s) => s.set);
  const tool = useUi((s) => s.annotateTool);
  const tools = [
    { id: 'measure' as const, label: sq.annotate.measure, icon: Ruler },
    { id: 'text' as const, label: sq.annotate.text, icon: Type },
    { id: 'zone' as const, label: sq.annotate.zone, icon: SquareDashed },
  ];
  return (
    <div className="canvas-controls" role="toolbar">
      <div className="control-group">
        <button
          type="button"
          className="icon-btn"
          onClick={onZoomIn}
          title={sq.canvas.zoomIn}
          aria-label={sq.canvas.zoomIn}
        >
          <Plus size={20} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={onZoomOut}
          title={sq.canvas.zoomOut}
          aria-label={sq.canvas.zoomOut}
        >
          <Minus size={20} />
        </button>
        <button type="button" className="text-btn" onClick={onFit} title={sq.canvas.fit}>
          <Maximize2 size={18} />
          <span>{sq.canvas.fit}</span>
        </button>
      </div>
      <div className="control-group">
        <button
          type="button"
          className="icon-btn"
          aria-pressed={mode === 'pan'}
          onClick={() => set({ mode: 'pan' })}
          title={sq.canvas.modePan}
          aria-label={sq.canvas.modePan}
        >
          <Hand size={20} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-pressed={mode === 'select'}
          onClick={() => set({ mode: 'select' })}
          title={sq.canvas.modeSelect}
          aria-label={sq.canvas.modeSelect}
        >
          <SquareDashedMousePointer size={20} />
        </button>
        <button
          type="button"
          className="text-btn"
          aria-pressed={snap}
          onClick={() => set({ snap: !snap })}
          title={sq.canvas.snap}
        >
          <Magnet size={18} />
          <span>{sq.canvas.snap}</span>
        </button>
      </div>
      <div className="control-group" aria-label={sq.annotate.tools}>
        {tools.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className="icon-btn"
            aria-pressed={tool === id}
            onClick={() => set({ annotateTool: tool === id ? null : id, calibrating: false })}
            title={label}
            aria-label={label}
          >
            <Icon size={20} />
          </button>
        ))}
      </div>
    </div>
  );
}
