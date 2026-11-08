import { FloorType } from '@salla/shared';
import { sq } from '../../i18n/sq';
import { useEditor } from '../../model/store';
import { ColorField, NumberField, SelectField, TextField } from './fields';
import { UnderlaySettings } from './UnderlaySettings';

const FLOOR_OPTIONS = FloorType.options.map((f) => ({ value: f, label: sq.hall.floorTypes[f] }));

export function HallSettings() {
  const hall = useEditor((s) => s.project.hall);
  const update = useEditor((s) => s.updateHall);
  const kind = hall.kind ?? 'salle';
  // "From the scan" only makes sense for a hall that has one.
  const kinds = hall.shell ? (['salle', 'tende', 'skan'] as const) : (['salle', 'tende'] as const);
  return (
    <section className="panel-section">
      <h2>{sq.hall.title}</h2>
      <TextField
        label={sq.hall.name}
        value={hall.name}
        onCommit={(v) => v.trim() && update({ name: v.trim() })}
      />
      <div className="field-row three">
        <NumberField
          label={sq.hall.width}
          value={hall.width}
          decimals={1}
          unit="m"
          min={3}
          max={200}
          onCommit={(v) => v && update({ width: v })}
        />
        <NumberField
          label={sq.hall.length}
          value={hall.length}
          decimals={1}
          unit="m"
          min={3}
          max={200}
          onCommit={(v) => v && update({ length: v })}
        />
        <NumberField
          label={sq.hall.height}
          value={hall.height}
          decimals={1}
          unit="m"
          min={2}
          max={30}
          onCommit={(v) => v && update({ height: v })}
        />
      </div>
      <div className="field">
        <span className="field-label">{sq.hall.kind}</span>
        <div className="segmented" role="group" aria-label={sq.hall.kind}>
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() =>
                kind !== k &&
                update({
                  kind: k,
                  ...(k === 'tende' ? { tent: hall.tent ?? { openSides: false } } : {}),
                })
              }
            >
              {sq.hall.kinds[k]}
            </button>
          ))}
        </div>
      </div>
      {kind === 'tende' && (
        <div className="field">
          <span className="field-label">{sq.hall.tentSides}</span>
          <div className="segmented" role="group" aria-label={sq.hall.tentSides}>
            {[false, true].map((openSides) => (
              <button
                key={String(openSides)}
                type="button"
                aria-pressed={(hall.tent?.openSides ?? false) === openSides}
                onClick={() => update({ tent: { openSides } })}
              >
                {openSides ? sq.hall.tentOpen : sq.hall.tentClosed}
              </button>
            ))}
          </div>
        </div>
      )}
      {kind === 'skan' && hall.shell && (
        <div className="actions-row">
          <button
            type="button"
            className="btn"
            aria-pressed={!!hall.shell.flip}
            onClick={() => update({ shell: { ...hall.shell!, flip: !hall.shell!.flip } })}
          >
            {sq.hall.shellFlip}
          </button>
          <button
            type="button"
            className="btn"
            aria-pressed={!!hall.shell.scanFloor}
            onClick={() => update({ shell: { ...hall.shell!, scanFloor: !hall.shell!.scanFloor } })}
          >
            {sq.hall.shellFloor}
          </button>
        </div>
      )}
      <SelectField
        label={sq.hall.floor}
        value={hall.floor}
        options={FLOOR_OPTIONS}
        onChange={(floor) => update({ floor })}
      />
      <ColorField
        label={sq.hall.floorColor}
        value={hall.floorColor}
        onChange={(floorColor) => update({ floorColor })}
      />
      <ColorField
        label={sq.hall.wallColor}
        value={hall.wallColor}
        onChange={(wallColor) => update({ wallColor })}
      />
      <UnderlaySettings />
    </section>
  );
}
