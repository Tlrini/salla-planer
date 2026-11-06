import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, TriangleExclamationPoint } from 'lucide-react';
import type { Shortage } from '@salla/shared';
import { api } from '../../api/client';
import { sq } from '../../i18n/sq';
import { navigate } from '../../model/router';
import { AppShell } from '../shell/AppShell';
import { addMonths, isoDate, monthGrid } from './dates';

interface CalendarEvent {
  id: string;
  name: string;
  clientName: string;
  status: 'draft' | 'konfirmuar' | 'instaluar';
  eventType: string;
  eventDate: string;
}

interface CalendarData {
  events: CalendarEvent[];
  conflicts: Array<{ date: string; shortages: Shortage[] }>;
}

/**
 * "Kalendari": all events by date. Days where confirmed events together need more pieces than
 * the agency owns are flagged, with the missing items listed below the month.
 */
export function CalendarPage() {
  const now = new Date();
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const days = useMemo(() => monthGrid(ym.year, ym.month), [ym]);
  const [data, setData] = useState<CalendarData | null>(null);
  const [error, setError] = useState(false);
  const today = isoDate(now);

  useEffect(() => {
    let alive = true;
    setError(false);
    api
      .get<CalendarData>(`/api/calendar?from=${days[0]}&to=${days[41]}`)
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [days]);

  const byDate = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of data?.events ?? []) m.set(e.eventDate, [...(m.get(e.eventDate) ?? []), e]);
    return m;
  }, [data]);
  const conflicts = new Map((data?.conflicts ?? []).map((c) => [c.date, c.shortages]));
  const monthPrefix = `${ym.year}-${String(ym.month + 1).padStart(2, '0')}`;
  const monthConflicts = (data?.conflicts ?? []).filter((c) => c.date.startsWith(monthPrefix));
  const monthEvents = (data?.events ?? []).filter((e) => e.eventDate.startsWith(monthPrefix));

  return (
    <AppShell active="calendar">
      <div className="page-head">
        <h1 className="title-serif">{sq.calendar.title}</h1>
        <div className="calendar-nav">
          <button
            type="button"
            className="icon-btn"
            aria-label={sq.calendar.prev}
            title={sq.calendar.prev}
            onClick={() => setYm((v) => addMonths(v, -1))}
          >
            <ChevronLeft size={20} />
          </button>
          <strong className="calendar-month" aria-live="polite">
            {sq.calendar.months[ym.month]} {ym.year}
          </strong>
          <button
            type="button"
            className="icon-btn"
            aria-label={sq.calendar.next}
            title={sq.calendar.next}
            onClick={() => setYm((v) => addMonths(v, 1))}
          >
            <ChevronRight size={20} />
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setYm({ year: now.getFullYear(), month: now.getMonth() })}
          >
            {sq.calendar.today}
          </button>
        </div>
      </div>
      <p className="muted small">
        {sq.calendar.summary(monthEvents.length, monthConflicts.length)}
      </p>
      {error && <p className="form-error">{sq.errors.offline}</p>}

      <div className="calendar-grid" role="grid" aria-label={sq.calendar.title}>
        {sq.calendar.weekdays.map((d) => (
          <div key={d} className="calendar-weekday" role="columnheader">
            {d}
          </div>
        ))}
        {days.map((date) => {
          const events = byDate.get(date) ?? [];
          const short = conflicts.get(date);
          const outside = !date.startsWith(monthPrefix);
          return (
            <div
              key={date}
              role="gridcell"
              className={`calendar-day${outside ? ' outside' : ''}${date === today ? ' today' : ''}${short ? ' conflict' : ''}`}
            >
              <div className="calendar-day-head">
                <span className="mono">{Number(date.slice(8))}</span>
                {short && (
                  <span
                    className="conflict-dot"
                    title={short.map((s) => sq.calendar.missing(s.missing, s.name)).join('\n')}
                    aria-label={sq.calendar.conflictDay}
                  >
                    <TriangleExclamationPoint size={14} />
                  </span>
                )}
              </div>
              {events.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={`calendar-event status-${e.status}`}
                  title={`${e.name} – ${e.clientName} (${sq.statuses[e.status]})`}
                  onClick={() => navigate({ name: 'project', id: e.id })}
                >
                  {e.clientName || e.name}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {monthConflicts.length > 0 && (
        <section className="calendar-conflicts">
          <h2>{sq.calendar.conflictsTitle}</h2>
          <ul>
            {monthConflicts.map((c) => (
              <li key={c.date}>
                <strong className="mono">
                  {c.date.slice(8)}.{c.date.slice(5, 7)}.{c.date.slice(0, 4)}
                </strong>
                {': '}
                {c.shortages
                  .map((s) => sq.calendar.missingFull(s.missing, s.name, s.stock, s.need))
                  .join(' · ')}
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}
