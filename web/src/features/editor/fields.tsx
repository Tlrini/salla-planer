import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { COLOR_PRESETS, formatDecimal } from '@salla/shared';
import { sq } from '../../i18n/sq';

function Field({ label, children, id }: { label: string; children: ReactNode; id: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

/** Parses "12,5" or "12.5". Returns null for invalid input. */
function parseDecimal(raw: string): number | null {
  const v = Number(raw.trim().replace(/\s/g, '').replace(',', '.'));
  return raw.trim() !== '' && Number.isFinite(v) ? v : null;
}

interface NumberFieldProps {
  label: string;
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
  decimals?: number;
  unit?: string;
  min?: number;
  max?: number;
  allowEmpty?: boolean;
  placeholder?: string;
}

/** Number input that commits on blur / Enter (one undo step per edit). Accepts comma decimals. */
export function NumberField({
  label,
  value,
  onCommit,
  decimals = 2,
  unit,
  min,
  max,
  allowEmpty,
  placeholder,
}: NumberFieldProps) {
  const id = useId();
  const show = (v: number | undefined) =>
    v === undefined ? '' : decimals === 0 ? String(v) : formatDecimal(v, decimals);
  const [draft, setDraft] = useState(show(value));
  useEffect(() => setDraft(show(value)), [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    if (allowEmpty && draft.trim() === '') {
      onCommit(undefined);
      return;
    }
    const v = parseDecimal(draft);
    if (v === null) {
      setDraft(show(value));
      return;
    }
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
    const rounded = decimals === 0 ? Math.round(clamped) : Number(clamped.toFixed(decimals));
    setDraft(show(rounded));
    if (rounded !== value) onCommit(rounded);
  };

  return (
    <Field label={label} id={id}>
      <div className="input-unit">
        <input
          id={id}
          inputMode="decimal"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setDraft(show(value));
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="mono"
        />
        {unit && <span className="unit">{unit}</span>}
      </div>
    </Field>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  /** Commit on every keystroke (plain forms) instead of on blur (editor, one undo step per edit). */
  live?: boolean;
  multiline?: boolean;
  type?: 'text' | 'tel' | 'password';
}

export function TextField({
  label,
  value,
  onCommit,
  placeholder,
  live,
  multiline,
  type = 'text',
}: TextFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const common = {
    id,
    value: draft,
    placeholder,
    onChange: (e: { target: { value: string } }) => {
      setDraft(e.target.value);
      if (live) onCommit(e.target.value);
    },
    onBlur: commit,
  };
  return (
    <Field label={label} id={id}>
      {multiline ? (
        <textarea {...common} rows={4} />
      ) : (
        <input
          {...common}
          type={type}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !live) (e.target as HTMLInputElement).blur();
          }}
        />
      )}
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <Field label={label} id={id}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const id = useId();
  const current = value.toUpperCase();
  return (
    <div className="field">
      <span className="field-label" id={id}>
        {label}
      </span>
      <div className="swatches" role="group" aria-labelledby={id}>
        {COLOR_PRESETS.map((c) => (
          <button
            key={c.hex}
            type="button"
            className="swatch"
            style={{ background: c.hex }}
            title={c.name}
            aria-label={c.name}
            aria-pressed={current === c.hex}
            onClick={() => onChange(c.hex)}
          />
        ))}
        <CustomColor value={value} onCommit={onChange} />
      </div>
    </div>
  );
}

/**
 * Native color picker. React's onChange fires continuously while dragging inside the picker,
 * so we listen to the native `change` event (picker closed) to make one undo step per pick.
 */
function CustomColor({ value, onCommit }: { value: string; onCommit: (hex: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onChange = () => commitRef.current(el.value.toUpperCase());
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, []);
  useEffect(() => {
    if (ref.current) ref.current.value = value.toLowerCase();
  }, [value]);
  return (
    <label className="swatch swatch-custom" title={sq.props.customColor}>
      <input
        ref={ref}
        type="color"
        defaultValue={value.toLowerCase()}
        aria-label={sq.props.customColor}
      />
    </label>
  );
}
