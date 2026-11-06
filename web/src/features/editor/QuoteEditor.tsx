import { nanoid } from 'nanoid';
import { Plus, Trash } from 'lucide-react';
import { formatEUR, quoteTotals, type Pricing } from '@salla/shared';
import { sq } from '../../i18n/sq';
import { useEditor } from '../../model/store';
import { NumberField, TextField } from './fields';

/**
 * "Oferta": discount and extra services (transport, installation…) on top of the decor total.
 * The final quote total shows here and in the PDF.
 */
export function QuoteEditor({ subtotal }: { subtotal: number }) {
  const pricing = useEditor((s) => s.project.pricing);
  const set = (next: Pricing) => useEditor.getState().updateProject({ pricing: next });
  const extras = pricing?.extras ?? [];
  const q = quoteTotals(subtotal, pricing);
  const adjusted = q.discount > 0 || q.extras.length > 0;

  const updateExtra = (id: string, patch: { label?: string; amount?: number }) =>
    set({ ...pricing, extras: extras.map((e) => (e.id === id ? { ...e, ...patch } : e)) });

  return (
    <details className="quote" open={adjusted}>
      <summary>{sq.quote.title}</summary>
      <NumberField
        label={sq.quote.discount}
        value={pricing?.discountPercent}
        unit="%"
        min={0}
        max={100}
        decimals={1}
        allowEmpty
        placeholder="0"
        onCommit={(v) => set({ ...pricing, discountPercent: v || undefined })}
      />
      <div className="quote-extras">
        <span className="field-label">{sq.quote.extras}</span>
        {extras.map((e) => (
          <div key={e.id} className="quote-extra">
            <TextField
              label={sq.quote.extraLabel}
              value={e.label}
              placeholder={sq.quote.extraPlaceholder}
              onCommit={(label) => updateExtra(e.id, { label })}
            />
            <NumberField
              label={sq.quote.extraAmount}
              value={e.amount}
              unit="€"
              min={-1_000_000}
              max={1_000_000}
              onCommit={(amount) => updateExtra(e.id, { amount: amount ?? 0 })}
            />
            <button
              type="button"
              className="icon-btn btn-danger"
              aria-label={sq.quote.removeExtra(e.label || sq.quote.extraPlaceholder)}
              title={sq.quote.removeExtra(e.label || sq.quote.extraPlaceholder)}
              onClick={() => set({ ...pricing, extras: extras.filter((x) => x.id !== e.id) })}
            >
              <Trash size={18} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn"
          onClick={() =>
            set({
              ...pricing,
              extras: [...extras, { id: nanoid(8), label: sq.quote.extraPlaceholder, amount: 0 }],
            })
          }
        >
          <Plus size={18} />
          <span>{sq.quote.addExtra}</span>
        </button>
      </div>
      {adjusted && (
        <table className="summary-table quote-totals" data-testid="quote-totals">
          <tbody>
            <tr>
              <td>{sq.quote.subtotal}</td>
              <td className="mono num">{formatEUR(q.subtotal)}</td>
            </tr>
            {q.discount > 0 && (
              <tr>
                <td>{sq.quote.discountLine(q.discountPercent)}</td>
                <td className="mono num">−{formatEUR(q.discount)}</td>
              </tr>
            )}
            {q.extras.map((e, i) => (
              <tr key={i}>
                <td>{e.label || sq.quote.extraPlaceholder}</td>
                <td className="mono num">{formatEUR(e.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>{sq.quote.total}</th>
              <th className="mono num">{formatEUR(q.total)}</th>
            </tr>
          </tfoot>
        </table>
      )}
    </details>
  );
}
