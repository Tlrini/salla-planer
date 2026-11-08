import { describe, expect, it } from 'vitest';
import { parseRoute, routePath } from './router';

describe('router', () => {
  it('parses and builds hash routes', () => {
    expect(parseRoute('')).toEqual({ name: 'projects' });
    expect(parseRoute('#/projects/a%20b')).toEqual({ name: 'project', id: 'a b' });
    expect(parseRoute('#/halls')).toEqual({ name: 'halls' });
    expect(parseRoute('#/halls/x1')).toEqual({ name: 'hall', id: 'x1' });
    expect(parseRoute('#/admin')).toEqual({ name: 'admin' });
    expect(parseRoute('#/library')).toEqual({ name: 'library' });
    expect(parseRoute(routePath({ name: 'scan' }))).toEqual({ name: 'scan' });
    expect(parseRoute(routePath({ name: 'scanHall' }))).toEqual({ name: 'scanHall' });
    expect(parseRoute('#/nonsense')).toEqual({ name: 'projects' });
    expect(routePath({ name: 'project', id: 'a b' })).toBe('#/projects/a%20b');
  });
});
