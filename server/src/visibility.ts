import type { CatalogItem, Project, SessionUser } from '@salla/shared';

/** Only admins see what things cost the agency (CatalogItem.cost, Project.costs). */
export const seesCosts = (user: SessionUser | undefined): boolean => user?.role === 'admin';

/** A project as this user may see it: without the agency's costs for agents. */
export function projectFor<T extends Pick<Project, 'costs'>>(
  p: T,
  user: SessionUser | undefined,
): T {
  if (seesCosts(user) || p.costs === undefined) return p;
  const { costs: _hidden, ...rest } = p;
  return rest as unknown as T;
}

/** A catalog item as this user may see it: without the agency's cost for agents. */
export function catalogItemFor(c: CatalogItem, user: SessionUser | undefined): CatalogItem {
  if (seesCosts(user) || c.cost === undefined) return c;
  const { cost: _hidden, ...rest } = c;
  return rest;
}
