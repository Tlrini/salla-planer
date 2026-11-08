import { useMemo } from 'react';
import { nanoid } from 'nanoid';
import { Plus, Trash } from 'lucide-react';
import { chosenItems, formatEUR, projectProfit, type ProjectCost } from '@salla/shared';
import { sq } from '../../i18n/sq';
import { useSession } from '../../model/session';
import { catalog, useCatalogVersion, useEditor } from '../../model/store';
import { NumberField, TextField } from './fields';

/**
 * "Shpenzimet e agjencisë" (admins only): the event's own costs and the resulting profit of the
 * option the client chose. Decor costs come from CatalogItem.cost (Administrimi → Katalogu).
 */
export function ProfitEditor() {
  const isAdmin = useSession((s) => s.user?.role === 'admin');
  const project = useEditor((s) => s.project);
  const catalogVersion = useCatalogVersion();
  const costs = project.costs ?? [];
  const profit = useMemo(
    () => projectProfit(chosenItems(project), project.pricing, project.costs, catalog),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- catalog is mutated in place
    [project, catalogVersion],
  );
  if (!isAdmin) return null;

  const set = (next: ProjectCost[]) =>
    useEditor.getState().updateProject({ costs: next.length ? next : undefined });
  const update = (id: string, patch: Partial<ProjectCost>) =>
    set(costs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  return (
    <details className="quote" open={costs.length > 0}>
      <summary>{sq.quote.costsTitle}</summary>
      <p className="muted small">{sq.quote.costsHint}</p>
      <div className="quote-extras">
        {costs.map((c) => (
          <div key={c.id} className="quote-extra">
            <TextField
              label={sq.quote.costLabel}
              value={c.label}
              placeholder={sq.quote.costPlaceholder}
              onCommit={(label) => update(c.id, { label })}
            />
            <NumberField
              label={sq.quote.extraAmount}
              value={c.amount}
              unit="€"
              min={0}
              max={1_000_000}
              onCommit={(amount) => update(c.id, { amount: amount ?? 0 })}
            />
            <button
              type="button"
              className="icon-btn btn-danger"
              aria-label={sq.quote.removeCost(c.label || sq.quote.costLabel)}
              title={sq.quote.removeCost(c.label || sq.quote.costLabel)}
              onClick={() => set(costs.filter((x) => x.id !== c.id))}
            >
              <Trash size={18} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn"
          onClick={() => set([...costs, { id: nanoid(8), label: '', amount: 0 }])}
        >
          <Plus size={18} />
          <span>{sq.quote.addCost}</span>
        </button>
      </div>
      <table className="summary-table quote-totals" data-testid="profit">
        <tbody>
          <tr>
            <td>{sq.quote.total}</td>
            <td className="mono num">{formatEUR(profit.revenue)}</td>
          </tr>
          <tr>
            <td>{sq.quote.decorCost}</td>
            <td className="mono num">−{formatEUR(profit.decorCost)}</td>
          </tr>
          <tr>
            <td>{sq.quote.otherCost}</td>
            <td className="mono num">−{formatEUR(profit.otherCost)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th>
              {sq.quote.profit}{' '}
              <span className="muted small">
                {sq.quote.margin(Math.round(profit.margin * 100))}
              </span>
            </th>
            <th className="mono num">{formatEUR(profit.profit)}</th>
          </tr>
        </tfoot>
      </table>
    </details>
  );
}
