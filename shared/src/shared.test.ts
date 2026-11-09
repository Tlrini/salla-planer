import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOG, EXAMPLE_HALLS } from './catalog-defaults.js';
import { formatDecimal, formatEUR, formatMeters } from './format.js';
import { CatalogItem, HallTemplate } from './schemas.js';

describe('catalog defaults', () => {
  it('all 30 items are valid and unique', () => {
    expect(DEFAULT_CATALOG).toHaveLength(30);
    for (const c of DEFAULT_CATALOG) CatalogItem.parse(c);
    expect(new Set(DEFAULT_CATALOG.map((c) => c.id)).size).toBe(30);
  });
  it('example halls are valid', () => {
    expect(EXAMPLE_HALLS).toHaveLength(3);
    for (const h of EXAMPLE_HALLS) HallTemplate.parse(h);
  });
});

describe('format', () => {
  it('formats EUR the Albanian way', () => {
    expect(formatEUR(1250)).toBe('1.250,00 €');
    expect(formatEUR(0)).toBe('0,00 €');
    expect(formatEUR(1234567.5)).toBe('1.234.567,50 €');
    expect(formatEUR(-3)).toBe('-3,00 €');
  });
  it('formats meters', () => {
    expect(formatMeters(12.5)).toBe('12,5 m');
    expect(formatMeters(24)).toBe('24,0 m');
    expect(formatDecimal(0.45)).toBe('0,45');
  });
});

describe('dates', () => {
  it('formats dates the Albanian way', async () => {
    const { formatDate, formatDateTime } = await import('./format.js');
    expect(formatDate('2026-06-14')).toBe('14.06.2026');
    expect(formatDateTime(new Date(2026, 5, 14, 21, 4).toISOString())).toBe('14.06.2026 21:04');
  });
});
