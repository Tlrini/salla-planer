import { FloorType } from '@salla/shared';
import { sq } from '../../i18n/sq';
import { useEditor } from '../../model/store';
import { ColorField, NumberField, SelectField, TextField } from './fields';

const FLOOR_OPTIONS = FloorType.options.map((f) => ({ value: f, label: sq.hall.floorTypes[f] }));

export function HallSettings() {
  const hall = useEditor((s) => s.project.hall);
  const update = useEditor((s) => s.updateHall);
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
    </section>
  );
}
