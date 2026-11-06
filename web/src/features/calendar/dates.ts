/** Local-date helpers for the month calendar (ISO "YYYY-MM-DD", weeks start on Monday). */

const pad = (n: number) => String(n).padStart(2, '0');

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The 42 days (6 weeks, Monday first) shown for a month; month is 0-based. */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, i) =>
    isoDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)),
  );
}

/** Move a {year, month} by `delta` months. */
export function addMonths(ym: { year: number; month: number }, delta: number) {
  const d = new Date(ym.year, ym.month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}
