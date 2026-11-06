import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOG, EXAMPLE_HALLS, type Project } from '@salla/shared';
import { computeStats } from './stats.js';

const project = (over: Partial<Project>): Project => ({
  id: Math.random().toString(36).slice(2),
  name: 'P',
  clientName: 'K',
  eventType: 'dasme',
  status: 'konfirmuar',
  hall: EXAMPLE_HALLS[0]!.hall,
  items: [
    { id: 's', type: 'stage', x: 5, y: 2, rotation: 0, width: 6, depth: 3, color: '#FFFFFF' },
  ], // 150 €
  createdBy: 'Ana',
  updatedBy: 'Ana',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  version: 1,
  ...over,
});

describe('dashboard statistics', () => {
  it('revenue by event month, pipeline from drafts, payments by payment date', () => {
    const s = computeStats(
      [
        project({
          eventDate: '2026-06-14',
          payments: [{ id: 'a', date: '2026-02-01', amount: 100, method: 'cash' }],
        }),
        project({ eventDate: '2026-06-20', createdBy: 'Besa', pricing: { discountPercent: 10 } }),
        project({ eventDate: '2026-07-04', status: 'draft' }),
        project({ eventDate: '2025-06-14' }),
      ],
      DEFAULT_CATALOG,
      2026,
      '2026-06-15',
    );
    expect(s.months[5]).toEqual({ events: 2, booked: 2, revenue: 285, pipeline: 0, paid: 0 });
    expect(s.months[6]).toMatchObject({ events: 1, booked: 0, pipeline: 150 });
    expect(s.months[1]!.paid).toBe(100);
    expect(s.totals).toMatchObject({
      booked: 2,
      drafts: 1,
      revenue: 285,
      paid: 100,
      outstanding: 185,
      averageValue: 142.5,
    });
    expect(s.totals.conversion).toBeCloseTo(2 / 3);
    expect(s.topItems).toEqual([
      { type: 'stage', name: 'Skenë / podium', quantity: 2, revenue: 300 },
    ]);
    expect(s.agents.map((a) => a.name)).toEqual(['Ana', 'Besa']);
    expect(s.upcoming.map((u) => u.eventDate)).toEqual(['2026-06-20', '2026-07-04']);
  });
});
