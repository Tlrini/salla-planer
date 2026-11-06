import { useRef, useState } from 'react';
import { ImageUp, Ruler, Trash } from 'lucide-react';
import type { Underlay } from '@salla/shared';
import { api } from '../../api/client';
import { sq } from '../../i18n/sq';
import { useEditor } from '../../model/store';
import { useUi } from '../../model/ui';
import { loadImage } from '../editor2d/images';
import { NumberField } from './fields';

/** Scale an underlay around a fixed plan point (used by the two-point calibration). */
export function scaleUnderlay(
  u: Underlay,
  factor: number,
  about: { x: number; y: number },
): Underlay {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return {
    ...u,
    x: r(about.x + (u.x - about.x) * factor),
    y: r(about.y + (u.y - about.y) * factor),
    width: r(u.width * factor),
    height: r(u.height * factor),
  };
}

/**
 * "Plani i sallës (foto)": a photo or scan of the real floor plan under the blueprint, to draw
 * the hall exactly. Calibrate its scale by clicking two points and typing their real distance.
 */
export function UnderlaySettings() {
  const hall = useEditor((s) => s.project.hall);
  const u = hall.underlay;
  const update = (underlay: Underlay | undefined) => useEditor.getState().updateHall({ underlay });
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'idle' | 'uploading' | 'error'>('idle');
  const calibrating = useUi((s) => s.calibrating);

  const upload = async (file: File) => {
    setState('uploading');
    try {
      const form = new FormData();
      form.append('file', file);
      const { url } = await api.upload<{ url: string }>('/api/images', form);
      const img = await loadImage(url);
      // Start by fitting the photo to the hall width; calibration fixes the real scale.
      const width = hall.width;
      update({
        url,
        x: 0,
        y: 0,
        width,
        height: Math.round(((width * img.naturalHeight) / img.naturalWidth) * 1000) / 1000,
        opacity: 0.5,
      });
      setState('idle');
    } catch {
      setState('error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <section className="panel-section underlay">
      <h2>{sq.underlay.title}</h2>
      <p className="muted small">{sq.underlay.hint}</p>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        data-testid="underlay-file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <div className="actions-row">
        <button
          type="button"
          className="btn"
          disabled={state === 'uploading'}
          onClick={() => fileRef.current?.click()}
        >
          <ImageUp size={18} />
          <span>
            {state === 'uploading'
              ? sq.library.uploading
              : u
                ? sq.underlay.replace
                : sq.underlay.upload}
          </span>
        </button>
        {u && (
          <>
            <button
              type="button"
              className="btn"
              aria-pressed={calibrating}
              onClick={() =>
                useUi.getState().set({
                  calibrating: !calibrating,
                  // Calibration happens on the 2D plan.
                  ...(useUi.getState().view === '3d' ? { view: '2d' as const } : {}),
                })
              }
            >
              <Ruler size={18} />
              <span>{calibrating ? sq.underlay.calibrating : sq.underlay.calibrate}</span>
            </button>
            <button
              type="button"
              className="icon-btn btn-danger"
              aria-label={sq.underlay.remove}
              title={sq.underlay.remove}
              onClick={() => update(undefined)}
            >
              <Trash size={18} />
            </button>
          </>
        )}
      </div>
      {state === 'error' && <p className="form-error small">{sq.underlay.error}</p>}
      {u && (
        <>
          <label className="field">
            <span className="field-label">
              {sq.underlay.opacity} · {Math.round(u.opacity * 100)}%
            </span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={u.opacity}
              onChange={(e) => update({ ...u, opacity: Number(e.target.value) })}
            />
          </label>
          <div className="field-row three">
            <NumberField
              label={sq.underlay.width}
              value={u.width}
              unit="m"
              min={0.5}
              max={1000}
              onCommit={(v) => v && update(scaleUnderlay(u, v / u.width, { x: u.x, y: u.y }))}
            />
            <NumberField
              label={sq.underlay.x}
              value={u.x}
              unit="m"
              min={-500}
              max={500}
              onCommit={(v) => v !== undefined && update({ ...u, x: v })}
            />
            <NumberField
              label={sq.underlay.y}
              value={u.y}
              unit="m"
              min={-500}
              max={500}
              onCommit={(v) => v !== undefined && update({ ...u, y: v })}
            />
          </div>
        </>
      )}
    </section>
  );
}
