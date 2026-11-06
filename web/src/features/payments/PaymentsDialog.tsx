import { useState } from 'react';
import { nanoid } from 'nanoid';
import { FileSignature, Plus, Trash } from 'lucide-react';
import {
  formatDate,
  formatEUR,
  projectFinance,
  type Payment,
  type PaymentMethod,
} from '@salla/shared';
import { Modal } from '../../components/Modal';
import { sq } from '../../i18n/sq';
import { catalog, useEditor } from '../../model/store';
import { isoDate } from '../calendar/dates';
import { NumberField } from '../editor/fields';

const METHODS: PaymentMethod[] = ['cash', 'bank', 'card'];

/** "Pagesat dhe kontrata": deposit, payments received, balance, and the contract PDF. */
export function PaymentsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title={sq.payments.title} onClose={onClose} wide>
      {open && <PaymentsBody onClose={onClose} />}
    </Modal>
  );
}

function PaymentsBody({ onClose }: { onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const payments = project.payments ?? [];
  const f = projectFinance(project.items, project.pricing, payments, catalog);
  const [date, setDate] = useState(isoDate(new Date()));
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const save = (next: Payment[]) => useEditor.getState().updateProject({ payments: next });
  const add = () => {
    if (!amount || amount <= 0) return;
    save(
      [
        ...payments,
        {
          id: nanoid(8),
          date,
          amount,
          method,
          ...(note.trim() ? { note: note.trim().slice(0, 200) } : {}),
        },
      ].sort((a, b) => a.date.localeCompare(b.date)),
    );
    setAmount(undefined);
    setNote('');
  };

  const contract = async () => {
    setBusy(true);
    setError(false);
    try {
      const ex = await import('../export/exporter');
      await ex.exportContractPdf(useEditor.getState().project);
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="payments">
      <div className="stat-row payments-stats">
        <div className="stat">
          <span className="stat-label">{sq.payments.total}</span>
          <span className="stat-value mono">{formatEUR(f.total)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">{sq.payments.paid}</span>
          <span className="stat-value mono">{formatEUR(f.paid)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">{sq.payments.balance}</span>
          <span className={`stat-value mono${f.balance > 0 ? '' : ' ok'}`}>
            {formatEUR(f.balance)}
          </span>
        </div>
      </div>
      <div
        className="progress-bar"
        aria-label={sq.payments.paidShare(Math.round(f.paidShare * 100))}
      >
        <span style={{ width: `${f.paidShare * 100}%` }} />
      </div>

      <div className="form-grid">
        <NumberField
          label={sq.payments.depositPercent}
          value={project.pricing?.depositPercent}
          unit="%"
          min={0}
          max={100}
          decimals={0}
          allowEmpty
          placeholder="0"
          onCommit={(v) =>
            useEditor
              .getState()
              .updateProject({ pricing: { ...project.pricing, depositPercent: v || undefined } })
          }
        />
        <div className="field">
          <span className="field-label">{sq.payments.deposit}</span>
          <span className="readonly mono">
            {formatEUR(f.deposit)}
            {f.deposit > 0 && f.paid >= f.deposit ? ` · ${sq.payments.depositPaid}` : ''}
          </span>
        </div>
      </div>

      <h3>{sq.payments.list}</h3>
      {payments.length === 0 && <p className="muted small">{sq.payments.none}</p>}
      <table className="summary-table payments-table">
        <tbody>
          {payments.map((p) => (
            <tr key={p.id}>
              <td className="mono">{formatDate(p.date)}</td>
              <td>
                {sq.payments.methods[p.method]}
                {p.note && <span className="muted small"> · {p.note}</span>}
              </td>
              <td className="mono num">{formatEUR(p.amount)}</td>
              <td className="num">
                <button
                  type="button"
                  className="icon-btn btn-danger"
                  aria-label={sq.payments.remove(formatEUR(p.amount))}
                  onClick={() => save(payments.filter((x) => x.id !== p.id))}
                >
                  <Trash size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form
        className="payment-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          type="date"
          value={date}
          aria-label={sq.payments.date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
        <NumberField
          label={sq.payments.amount}
          value={amount}
          unit="€"
          min={0}
          max={10_000_000}
          allowEmpty
          onCommit={setAmount}
        />
        <select
          value={method}
          aria-label={sq.payments.method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {sq.payments.methods[m]}
            </option>
          ))}
        </select>
        <input
          value={note}
          placeholder={sq.payments.note}
          aria-label={sq.payments.note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="submit" className="btn" disabled={!amount}>
          <Plus size={18} />
          <span>{sq.payments.add}</span>
        </button>
      </form>

      {error && (
        <p className="form-error" role="alert">
          {sq.export.failed}
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => void contract()}>
          <FileSignature size={18} />
          <span>{busy ? sq.export.preparing : sq.payments.contract}</span>
        </button>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          {sq.common.close}
        </button>
      </div>
    </div>
  );
}
