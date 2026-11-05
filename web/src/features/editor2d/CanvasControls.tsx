import { Hand, Magnet, Maximize2, Minus, Plus, SquareDashedMousePointer } from 'lucide-react';
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
    </div>
  );
}
