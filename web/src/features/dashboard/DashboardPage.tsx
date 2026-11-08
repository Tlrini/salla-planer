import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Table2 } from 'lucide-react';
import { formatDate, formatEUR } from '@salla/shared';
import { api } from '../../api/client';
import { sq } from '../../i18n/sq';
import { navigate } from '../../model/router';
import { useSession } from '../../model/session';
import { AppShell } from '../shell/AppShell';
import { BarChart } from './BarChart';

interface MonthStats {
  events: number;
  booked: number;
  revenue: number;
  pipeline: number;
  profit: number;
}

interface Stats {
  year: number;
  months: MonthStats[];
  totals: {
    booked: number;
    drafts: number;
    revenue: number;
    pipeline: number;
    conversion: number;
    averageValue: number;
    profit: number;
    margin: number;
  };
  topItems: Array<{ type: string; name: string; quantity: number; revenue: number }>;
  agents: Array<{ name: string; booked: number; revenue: number }>;
  upcoming: Array<{
    id: string;
    name: string;
    clientName: string;
    eventDate: string;
    status: 'draft' | 'konfirmuar' | 'instaluar';
    total: number;
  }>;
}

/** Whole euros for axis ticks: "12.500 €". */
const euroShort = (v: number) => `${Math.round(v).toLocaleString('de-DE')} €`;

/** "Paneli": the agency's year in numbers (admins). */
export function DashboardPage() {
  const isAdmin = useSession((s) => s.user?.role === 'admin');
  const [year, setYear] = useState(new Date().getFullYear());
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    setError(false);
    api
      .get<Stats>(`/api/stats?year=${year}`)
      .then((s) => alive && setStats(s))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [year, isAdmin]);

  if (!isAdmin)
    return (
      <AppShell active="dashboard">
        <p className="muted">{sq.errors.notFound}</p>
      </AppShell>
    );

  const t = stats?.totals;
  const months = sq.dashboard.monthsShort;

  return (
    <AppShell active="dashboard">
      <div className="page-head">
        <h1 className="title-serif">{sq.dashboard.title}</h1>
        <div className="calendar-nav">
          <button
            type="button"
            className="icon-btn"
            aria-label={sq.dashboard.prevYear}
            onClick={() => setYear((y) => y - 1)}
          >
            <ChevronLeft size={20} />
          </button>
          <strong className="calendar-month">{year}</strong>
          <button
            type="button"
            className="icon-btn"
            aria-label={sq.dashboard.nextYear}
            onClick={() => setYear((y) => y + 1)}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
      {error && <p className="form-error">{sq.errors.offline}</p>}
      {!stats && !error && <p className="muted">{sq.errors.loading}</p>}
      {stats && t && (
        <div className="dashboard">
          <div className="kpi-row">
            <Kpi
              label={sq.dashboard.revenue}
              value={formatEUR(t.revenue)}
              sub={sq.dashboard.bookedEvents(t.booked)}
            />
            <Kpi
              label={sq.dashboard.pipeline}
              value={formatEUR(t.pipeline)}
              sub={sq.dashboard.drafts(t.drafts)}
            />
            <Kpi label={sq.dashboard.conversion} value={`${Math.round(t.conversion * 100)}%`} />
            <Kpi label={sq.dashboard.average} value={formatEUR(t.averageValue)} />
            <Kpi
              label={sq.dashboard.profit}
              value={formatEUR(t.profit)}
              sub={sq.dashboard.margin(Math.round(t.margin * 100))}
            />
          </div>

          <section className="dashboard-card">
            <BarChart
              title={sq.dashboard.moneyChart}
              categories={months}
              series={[
                {
                  key: 'revenue',
                  label: sq.dashboard.revenue,
                  color: 'var(--series-1)',
                  values: stats.months.map((m) => m.revenue),
                },
                {
                  key: 'profit',
                  label: sq.dashboard.profit,
                  color: 'var(--series-2)',
                  values: stats.months.map((m) => m.profit),
                },
              ]}
              format={euroShort}
              formatValue={formatEUR}
              details={(i) =>
                stats.months[i]!.pipeline
                  ? [`${sq.dashboard.pipeline}: ${formatEUR(stats.months[i]!.pipeline)}`]
                  : []
              }
            />
            <button
              type="button"
              className="btn chart-table-toggle"
              aria-pressed={showTable}
              onClick={() => setShowTable((v) => !v)}
            >
              <Table2 size={16} />
              <span>{showTable ? sq.dashboard.hideTable : sq.dashboard.showTable}</span>
            </button>
            {showTable && (
              <div className="table-wrap">
                <table className="summary-table">
                  <thead>
                    <tr>
                      <th>{sq.dashboard.month}</th>
                      <th className="num">{sq.dashboard.events}</th>
                      <th className="num">{sq.dashboard.revenue}</th>
                      <th className="num">{sq.dashboard.profit}</th>
                      <th className="num">{sq.dashboard.pipeline}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.months.map((m, i) => (
                      <tr key={i}>
                        <td>{sq.calendar.months[i]}</td>
                        <td className="mono num">{m.events}</td>
                        <td className="mono num">{formatEUR(m.revenue)}</td>
                        <td className="mono num">{formatEUR(m.profit)}</td>
                        <td className="mono num">{formatEUR(m.pipeline)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="dashboard-card">
            <BarChart
              title={sq.dashboard.eventsChart}
              categories={months}
              series={[
                {
                  key: 'events',
                  label: sq.dashboard.events,
                  color: 'var(--series-1)',
                  values: stats.months.map((m) => m.events),
                },
              ]}
              format={(v) => String(Math.round(v * 10) / 10)}
              details={(i) => [sq.dashboard.bookedOf(stats.months[i]!.booked)]}
              height={180}
            />
          </section>

          <div className="dashboard-grid">
            <section className="dashboard-card">
              <h2>{sq.dashboard.topItems}</h2>
              {stats.topItems.length === 0 ? (
                <p className="muted small">{sq.dashboard.none}</p>
              ) : (
                <table className="summary-table">
                  <tbody>
                    {stats.topItems.map((it) => (
                      <tr key={it.type}>
                        <td>{it.name}</td>
                        <td className="mono num">{it.quantity}×</td>
                        <td className="mono num">{formatEUR(it.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section className="dashboard-card">
              <h2>{sq.dashboard.agents}</h2>
              {stats.agents.length === 0 ? (
                <p className="muted small">{sq.dashboard.none}</p>
              ) : (
                <table className="summary-table">
                  <tbody>
                    {stats.agents.map((a) => (
                      <tr key={a.name}>
                        <td>{a.name}</td>
                        <td className="mono num">{sq.dashboard.bookedEvents(a.booked)}</td>
                        <td className="mono num">{formatEUR(a.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section className="dashboard-card">
              <h2>{sq.dashboard.upcoming}</h2>
              {stats.upcoming.length === 0 ? (
                <p className="muted small">{sq.dashboard.none}</p>
              ) : (
                <ul className="upcoming">
                  {stats.upcoming.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        className="upcoming-item"
                        onClick={() => navigate({ name: 'project', id: u.id })}
                      >
                        <span className="mono">{formatDate(u.eventDate)}</span>
                        <span className="upcoming-name">
                          {u.clientName || u.name}
                          <span className={`status status-${u.status}`}>
                            {sq.statuses[u.status]}
                          </span>
                        </span>
                        <span className="mono small">{formatEUR(u.total)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat kpi">
      <span className="stat-label">{label}</span>
      <span className="stat-value mono">{value}</span>
      {sub && <span className="muted small">{sub}</span>}
    </div>
  );
}
