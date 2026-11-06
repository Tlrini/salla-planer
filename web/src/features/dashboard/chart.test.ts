import { describe, expect, it } from 'vitest';
import { niceMax } from './BarChart';

describe('chart axis', () => {
  it('rounds the maximum up to a nice value', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(1149)).toBe(2000);
    expect(niceMax(2300)).toBe(2500);
    expect(niceMax(4100)).toBe(5000);
  });
});
