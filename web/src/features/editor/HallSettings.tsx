import {
  groundOptions,
  hallKindPatch,
  isNaturalGround,
  isOpenAir,
  type FloorType,
  type HallKind,
} from '@salla/shared';
import { sq } from '../../i18n/sq';
import { useEditor } from '../../model/store';
import { ColorField, NumberField, SelectField, TextField } from './fields';
import { UnderlaySettings } from './UnderlaySettings';

export function HallSettings() {
  const hall = useEditor((s) => s.project.hall);
  const update = useEditor((s) => s.updateHall);
  const kind = hall.kind ?? 'salle';
  // "From the scan" only makes sense for a hall that has one.
  const kinds: HallKind[] = [
    'salle',
    'xham',
    'tende',
    'jashte',
    ...(hall.shell ? ['skan' as const] : []),
  ];
  const open = isOpenAir(hall);
  const floorOptions = groundOptions(hall).map((f: FloorType) => ({
    value: f,
    label: sq.hall.floorTypes[f],
  }));
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
          label={open ? sq.hall.lightsHeight : sq.hall.height}
          value={hall.height}
          decimals={1}
          unit="m"
          min={2}
          max={30}
          onCommit={(v) => v && update({ height: v })}
        />
      </div>
      <SelectField
        label={sq.hall.kind}
        value={kind}
        options={kinds.map((k) => ({ value: k, label: sq.hall.kinds[k] }))}
        onChange={(k) => k !== kind && update(hallKindPatch(hall, k))}
      />
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
          <button
            type="button"
            className="btn"
            aria-pressed={!!hall.outdoor}
            onClick={() => update({ outdoor: !hall.outdoor })}
          >
            {sq.hall.shellOutdoor}
          </button>
        </div>
      )}
      <SelectField
        label={open ? sq.hall.ground : sq.hall.floor}
        value={hall.floor}
        options={floorOptions}
        onChange={(floor) => update({ floor })}
      />
      {!isNaturalGround(hall.floor) && (
        <ColorField
          label={sq.hall.floorColor}
          value={hall.floorColor}
          onChange={(floorColor) => update({ floorColor })}
        />
      )}
      {!open && (
        <ColorField
          label={kind === 'xham' ? sq.hall.roofColor : sq.hall.wallColor}
          value={hall.wallColor}
          onChange={(wallColor) => update({ wallColor })}
        />
      )}
      <UnderlaySettings />
    </section>
  );
}
