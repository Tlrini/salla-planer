import { projectFinance, summarize, type CatalogItem, type Project } from '@salla/shared';

export interface MonthStats {
  /** Events in the month (by event date). */
  events: number;
  booked: number;
  /** Quote totals of confirmed/installed events, by event month. */
  revenue: number;
  /** Quote totals of drafts (offers not confirmed yet), by event month. */
  pipeline: number;
  /** Payments received, by payment date. */
  paid: number;
}

export interface Stats {
  year: number;
  months: MonthStats[];
  totals: {
    booked: number;
    drafts: number;
    revenue: number;
    pipeline: number;
    paid: number;
    outstanding: number;
    /** Booked / (booked + drafts), 0–1. */
    conversion: number;
    averageValue: number;
  };
  topItems: Array<{ type: string; name: string; quantity: number; revenue: number }>;
  agents: Array<{ name: string; booked: number; revenue: number }>;
  upcoming: Array<{
    id: string;
    name: string;
    clientName: string;
    eventDate: string;
    status: Project['status'];
    total: number;
    paid: number;
  }>;
}

const BOOKED = new Set<Project['status']>(['konfirmuar', 'instaluar']);
const cents = (v: number) => Math.round(v * 100) / 100;

/** Business numbers for one year ("Paneli"). Pure: projects and catalog in, numbers out. */
export function computeStats(
  projects: readonly Project[],
  catalog: readonly CatalogItem[],
  year: number,
  today: string,
): Stats {
  const months: MonthStats[] = Array.from({ length: 12 }, () => ({
    events: 0,
    booked: 0,
    revenue: 0,
    pipeline: 0,
    paid: 0,
  }));
  const prefix = `${year}-`;
  const items = new Map<string, { name: string; quantity: number; revenue: number }>();
  const agents = new Map<string, { booked: number; revenue: number }>();
  let booked = 0;
  let drafts = 0;
  let paidBooked = 0;
  let outstanding = 0;

  for (const p of projects) {
    for (const pay of p.payments ?? [])
      if (pay.date.startsWith(prefix)) months[Number(pay.date.slice(5, 7)) - 1]!.paid += pay.amount;
    if (!p.eventDate?.startsWith(prefix)) continue;
    const m = months[Number(p.eventDate.slice(5, 7)) - 1]!;
    const f = projectFinance(p.items, p.pricing, p.payments, catalog);
    m.events++;
    if (BOOKED.has(p.status)) {
      booked++;
      m.booked++;
      m.revenue += f.total;
      paidBooked += f.paid;
      outstanding += f.balance;
      const a = agents.get(p.createdBy) ?? { booked: 0, revenue: 0 };
      a.booked++;
      a.revenue += f.total;
      agents.set(p.createdBy, a);
      for (const l of summarize(p.items, catalog).lines) {
        const it = items.get(l.type) ?? { name: l.name, quantity: 0, revenue: 0 };
        it.quantity += l.quantity;
        it.revenue += l.total;
        items.set(l.type, it);
      }
    } else {
      drafts++;
      m.pipeline += f.total;
    }
  }
  for (const m of months) {
    m.revenue = cents(m.revenue);
    m.pipeline = cents(m.pipeline);
    m.paid = cents(m.paid);
  }
  const revenue = cents(months.reduce((s, m) => s + m.revenue, 0));

  return {
    year,
    months,
    totals: {
      booked,
      drafts,
      revenue,
      pipeline: cents(months.reduce((s, m) => s + m.pipeline, 0)),
      paid: cents(paidBooked),
      outstanding: cents(outstanding),
      conversion: booked + drafts ? booked / (booked + drafts) : 0,
      averageValue: booked ? cents(revenue / booked) : 0,
    },
    topItems: [...items.entries()]
      .map(([type, v]) => ({ type, ...v, revenue: cents(v.revenue) }))
      .filter((i) => i.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8),
    agents: [...agents.entries()]
      .map(([name, v]) => ({ name, booked: v.booked, revenue: cents(v.revenue) }))
      .sort((a, b) => b.revenue - a.revenue),
    upcoming: projects
      .filter((p) => p.eventDate && p.eventDate >= today)
      .sort((a, b) => a.eventDate!.localeCompare(b.eventDate!))
      .slice(0, 6)
      .map((p) => {
        const f = projectFinance(p.items, p.pricing, p.payments, catalog);
        return {
          id: p.id,
          name: p.name,
          clientName: p.clientName,
          eventDate: p.eventDate!,
          status: p.status,
          total: f.total,
          paid: f.paid,
        };
      }),
  };
}
