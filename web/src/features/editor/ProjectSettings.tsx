import { EventType, ProjectStatus } from '@salla/shared';
import { sq } from '../../i18n/sq';
import { useEditor } from '../../model/store';
import { NumberField, SelectField, TextField } from './fields';

const EVENT_OPTIONS = EventType.options.map((e) => ({ value: e, label: sq.eventTypes[e] }));
const STATUS_OPTIONS = ProjectStatus.options.map((s) => ({ value: s, label: sq.statuses[s] }));

export function ProjectSettings() {
  const project = useEditor((s) => s.project);
  const update = useEditor((s) => s.updateProject);

  return (
    <section className="panel-section">
      <h2>{sq.project.title}</h2>
      <TextField
        label={sq.project.name}
        value={project.name}
        onCommit={(name) => update({ name: name.trim() || sq.project.defaultName })}
      />
      <TextField
        label={sq.project.client}
        value={project.clientName}
        onCommit={(clientName) => update({ clientName })}
      />
      <TextField
        label={sq.project.phone}
        type="tel"
        value={project.clientPhone ?? ''}
        onCommit={(v) => update({ clientPhone: v.trim() || undefined })}
      />
      <div className="field-row">
        <SelectField
          label={sq.project.eventType}
          value={project.eventType}
          options={EVENT_OPTIONS}
          onChange={(eventType) => update({ eventType })}
        />
        <SelectField
          label={sq.project.status}
          value={project.status}
          options={STATUS_OPTIONS}
          onChange={(status) => update({ status })}
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="ps-date">{sq.project.eventDate}</label>
          <input
            id="ps-date"
            type="date"
            value={project.eventDate ?? ''}
            onChange={(e) => update({ eventDate: e.target.value || undefined })}
          />
        </div>
        <NumberField
          label={sq.project.guestTarget}
          value={project.guestTarget}
          decimals={0}
          min={0}
          max={5000}
          allowEmpty
          onCommit={(guestTarget) => update({ guestTarget })}
        />
      </div>
      <TextField
        label={sq.project.notes}
        multiline
        value={project.notes ?? ''}
        onCommit={(v) => update({ notes: v.trim() || undefined })}
      />
    </section>
  );
}
