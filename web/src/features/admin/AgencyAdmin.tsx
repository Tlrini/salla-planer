import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { AgencySettings } from '@salla/shared';
import { api } from '../../api/client';
import { sq } from '../../i18n/sq';
import { TextField } from '../editor/fields';

type Field = Exclude<keyof AgencySettings, 'contractTerms'>;
const FIELDS: Field[] = ['name', 'address', 'city', 'phone', 'email', 'nipt', 'bank', 'iban'];

/** Admin: agency details for contracts and PDF headers. */
export function AgencyAdmin() {
  const [agency, setAgency] = useState<AgencySettings | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    void api
      .get<AgencySettings>('/api/settings/agency')
      .then(setAgency)
      .catch(() => setState('error'));
  }, []);

  if (!agency) return <p className="muted">{sq.errors.loading}</p>;
  const set = (patch: Partial<AgencySettings>) => {
    setAgency({ ...agency, ...patch });
    setState('idle');
  };

  const save = async () => {
    setState('saving');
    try {
      setAgency(await api.put<AgencySettings>('/api/settings/agency', agency));
      setState('saved');
    } catch {
      setState('error');
    }
  };

  return (
    <form
      className="agency-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="muted">{sq.agency.intro}</p>
      <div className="form-grid">
        {FIELDS.map((f) => (
          <TextField
            key={f}
            label={sq.agency[f]}
            value={agency[f] ?? ''}
            live
            onCommit={(v) => set({ [f]: v })}
          />
        ))}
      </div>
      <TextField
        label={sq.agency.terms}
        value={agency.contractTerms ?? ''}
        multiline
        live
        onCommit={(v) => set({ contractTerms: v })}
      />
      {state === 'error' && <p className="form-error">{sq.errors.generic}</p>}
      <div className="dialog-actions">
        <button type="submit" className="btn btn-primary" disabled={state === 'saving'}>
          {state === 'saved' && <Check size={16} />}
          <span>{state === 'saved' ? sq.agency.saved : sq.agency.save}</span>
        </button>
      </div>
    </form>
  );
}
