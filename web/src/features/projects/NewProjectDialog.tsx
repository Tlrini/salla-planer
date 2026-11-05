import { useEffect, useState, type FormEvent } from 'react';
import {
  EventType,
  formatMeters,
  type Hall,
  type HallTemplate,
  type Project,
  type ProjectInput,
} from '@salla/shared';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { sq } from '../../i18n/sq';
import { navigate } from '../../model/router';
import { NumberField, SelectField, TextField } from '../editor/fields';

const EVENT_OPTIONS = EventType.options.map((e) => ({ value: e, label: sq.eventTypes[e] }));

export function NewProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [templates, setTemplates] = useState<HallTemplate[]>([]);
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [eventType, setEventType] = useState<EventType>('dasme');
  const [eventDate, setEventDate] = useState('');
  const [guestTarget, setGuestTarget] = useState<number | undefined>(undefined);
  const [source, setSource] = useState<'template' | 'custom'>('template');
  const [templateId, setTemplateId] = useState('');
  const [dims, setDims] = useState({ width: 20, length: 12, height: 4 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void api.get<HallTemplate[]>('/api/halls').then((list) => {
      setTemplates(list);
      setTemplateId((cur) => cur || list[0]?.id || '');
      if (!list.length) setSource('custom');
    });
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(sq.newProject.required);
      return;
    }
    const template = templates.find((t) => t.id === templateId);
    const hall: Hall =
      source === 'template' && template
        ? structuredClone(template.hall)
        : {
            name: sq.newProject.customHallName,
            ...dims,
            floor: 'parket',
            floorColor: '#B98A5E',
            wallColor: '#F3EBDD',
            structure: [],
          };
    const body: ProjectInput = {
      name: name.trim(),
      clientName: clientName.trim(),
      ...(clientPhone.trim() ? { clientPhone: clientPhone.trim() } : {}),
      eventType,
      ...(eventDate ? { eventDate } : {}),
      ...(guestTarget !== undefined ? { guestTarget } : {}),
      status: 'draft',
      hall,
      items: [],
    };
    setBusy(true);
    try {
      const created = await api.post<Project>('/api/projects', body);
      onClose();
      navigate({ name: 'project', id: created.id });
    } catch {
      setError(sq.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={sq.newProject.title}
      onClose={onClose}
      wide
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {sq.common.cancel}
          </button>
          <button type="submit" form="new-project" className="btn btn-primary" disabled={busy}>
            {sq.newProject.create}
          </button>
        </>
      }
    >
      <form id="new-project" className="form-grid" onSubmit={submit}>
        <TextField label={sq.project.name} value={name} onCommit={setName} live />
        <TextField label={sq.project.client} value={clientName} onCommit={setClientName} live />
        <TextField label={sq.project.phone} value={clientPhone} onCommit={setClientPhone} live />
        <SelectField
          label={sq.project.eventType}
          value={eventType}
          options={EVENT_OPTIONS}
          onChange={setEventType}
        />
        <div className="field">
          <label htmlFor="np-date">{sq.project.eventDate}</label>
          <input
            id="np-date"
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
        </div>
        <NumberField
          label={sq.project.guestTarget}
          value={guestTarget}
          decimals={0}
          min={0}
          max={5000}
          allowEmpty
          onCommit={setGuestTarget}
        />

        <fieldset className="span-2 hall-source">
          <legend>{sq.newProject.hallSource}</legend>
          <div className="segmented">
            <button
              type="button"
              aria-pressed={source === 'template'}
              onClick={() => setSource('template')}
              disabled={!templates.length}
            >
              {sq.newProject.template}
            </button>
            <button
              type="button"
              aria-pressed={source === 'custom'}
              onClick={() => setSource('custom')}
            >
              {sq.newProject.custom}
            </button>
          </div>
          {source === 'template' ? (
            <div className="radio-list">
              {templates.map((t) => (
                <label key={t.id} className="radio-item">
                  <input
                    type="radio"
                    name="np-hall"
                    checked={templateId === t.id}
                    onChange={() => setTemplateId(t.id)}
                  />
                  <span>{t.hall.name}</span>
                  <span className="mono muted">
                    {formatMeters(t.hall.width)} × {formatMeters(t.hall.length)}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <div className="field-row three">
              <NumberField
                label={sq.hall.width}
                value={dims.width}
                decimals={1}
                unit="m"
                min={3}
                max={200}
                onCommit={(v) => v && setDims({ ...dims, width: v })}
              />
              <NumberField
                label={sq.hall.length}
                value={dims.length}
                decimals={1}
                unit="m"
                min={3}
                max={200}
                onCommit={(v) => v && setDims({ ...dims, length: v })}
              />
              <NumberField
                label={sq.hall.height}
                value={dims.height}
                decimals={1}
                unit="m"
                min={2}
                max={30}
                onCommit={(v) => v && setDims({ ...dims, height: v })}
              />
            </div>
          )}
        </fieldset>
        {error && (
          <p className="form-error span-2" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
