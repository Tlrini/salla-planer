import { useMemo } from 'react';
import { Star } from 'lucide-react';
import { formatEUR, quoteTotals, summarize, type Project } from '@salla/shared';
import { sq } from '../../i18n/sq';
import { activeOption, allOptions, catalog, useCatalogVersion, useEditor } from '../../model/store';
import { QuoteEditor } from './QuoteEditor';

/** Totals of every design option side by side; tap one to switch to it. */
function OptionsComparison({ project, version }: { project: Project; version: number }) {
  const rows = useMemo(() => {
    const active = activeOption(project);
    const itemsOf = (id: string) =>
      id === active.id ? project.items : project.otherOptions!.find((o) => o.id === id)!.items;
    return allOptions(project).map((o) => {
      const s = summarize(itemsOf(o.id), catalog);
      // Compare final quote totals (discount and services apply to every option).
      const total = quoteTotals(s.total, project.pricing).total;
      return { ...o, total, capacity: s.capacity, active: o.id === active.id };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- catalog is mutated in place
  }, [project.items, project.otherOptions, project.option, project.pricing, version]);

  return (
    <div className="options-compare">
      <h3>{sq.options.compareTitle}</h3>
      <table className="summary-table">
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={r.active ? 'is-active' : 'clickable'}
              onClick={() => !r.active && useEditor.getState().switchOption(r.id)}
            >
              <td>
                {project.finalOptionId === r.id && (
                  <Star size={14} className="final-star" aria-label={sq.options.final} />
                )}
                {r.name}
                {r.active && <span className="pill">{sq.options.active}</span>}
              </td>
              <td className="mono num">{sq.summary.guests(r.capacity)}</td>
              <td className="mono num">{formatEUR(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Summary() {
  const items = useEditor((s) => s.project.items);
  const guestTarget = useEditor((s) => s.project.guestTarget);
  const catalogVersion = useCatalogVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- catalog is mutated in place
  const summary = useMemo(() => summarize(items, catalog), [items, catalogVersion]);
  const missing = guestTarget ? guestTarget - summary.capacity : 0;
  const project = useEditor((s) => s.project);

  return (
    <section className="panel-section">
      <h2>{sq.summary.title}</h2>
      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">{sq.summary.capacity}</span>
          <span className="stat-value mono">{sq.summary.guests(summary.capacity)}</span>
          {guestTarget ? (
            <span className="muted small">{sq.summary.target(guestTarget)}</span>
          ) : null}
        </div>
        <div className="stat">
          <span className="stat-label">{sq.summary.chairs}</span>
          <span className="stat-value mono">{summary.totalChairs}</span>
        </div>
      </div>
      {missing > 0 && <p className="badge-warn">{sq.summary.missing(missing)}</p>}

      {summary.lines.length === 0 ? (
        <p className="muted">{sq.summary.empty}</p>
      ) : (
        <table className="summary-table">
          <tbody>
            {summary.lines.map((l) => (
              <tr key={l.type}>
                <td>{l.name}</td>
                <td className="mono num">{l.quantity}×</td>
                <td className="mono num">{l.total > 0 ? formatEUR(l.total) : ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={2}>{sq.summary.total}</th>
              <th className="mono num">{formatEUR(summary.total)}</th>
            </tr>
          </tfoot>
        </table>
      )}
      {summary.lines.length > 0 && <QuoteEditor subtotal={summary.total} />}
      {(project.otherOptions?.length ?? 0) > 0 && (
        <OptionsComparison project={project} version={catalogVersion} />
      )}
    </section>
  );
}
