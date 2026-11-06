import { describe, expect, it } from 'vitest';
import { addMonths, monthGrid } from './dates';

describe('month grid', () => {
  it('starts on the Monday before the 1st and spans 6 weeks', () => {
    const g = monthGrid(2026, 5); // June 2026: the 1st is a Monday
    expect(g[0]).toBe('2026-06-01');
    expect(g).toHaveLength(42);
    const nov = monthGrid(2026, 10); // November 2026: the 1st is a Sunday
    expect(nov[0]).toBe('2026-10-26');
    expect(nov[6]).toBe('2026-11-01');
  });
  it('moves across years', () => {
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });
});
