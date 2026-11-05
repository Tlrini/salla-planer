import { useMemo } from 'react';
import { formatEUR, summarize } from '@salla/shared';
import { sq } from '../../i18n/sq';
import { catalog, useEditor } from '../../model/store';

export function Summary() {
  const items = useEditor((s) => s.project.items);
  const guestTarget = useEditor((s) => s.project.guestTarget);
  const summary = useMemo(() => summarize(items, catalog), [items]);
  const missing = guestTarget ? guestTarget - summary.capacity : 0;

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
    </section>
  );
}
