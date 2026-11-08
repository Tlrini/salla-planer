import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'projects' }
  | { name: 'project'; id: string }
  | { name: 'halls' }
  | { name: 'hall'; id: string }
  | { name: 'library' }
  | { name: 'scan' }
  | { name: 'scanHall' }
  | { name: 'calendar' }
  | { name: 'dashboard' }
  | { name: 'share'; token: string }
  | { name: 'admin' };

/** Parses "#/projects/abc" style hashes. Unknown paths go to the project list. */
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [a, b] = parts;
  if (a === 'projects' && b) return { name: 'project', id: b };
  if (a === 'halls' && b === 'scan') return { name: 'scanHall' };
  if (a === 'halls' && b) return { name: 'hall', id: b };
  if (a === 'halls') return { name: 'halls' };
  if (a === 'library' && b === 'scan') return { name: 'scan' };
  if (a === 'library') return { name: 'library' };
  if (a === 'calendar') return { name: 'calendar' };
  if (a === 'dashboard') return { name: 'dashboard' };
  if (a === 'share' && b) return { name: 'share', token: b };
  if (a === 'admin') return { name: 'admin' };
  return { name: 'projects' };
}

export function routePath(r: Route): string {
  switch (r.name) {
    case 'project':
      return `#/projects/${encodeURIComponent(r.id)}`;
    case 'hall':
      return `#/halls/${encodeURIComponent(r.id)}`;
    case 'halls':
      return '#/halls';
    case 'library':
      return '#/library';
    case 'scan':
      return '#/library/scan';
    case 'scanHall':
      return '#/halls/scan';
    case 'calendar':
      return '#/calendar';
    case 'dashboard':
      return '#/dashboard';
    case 'share':
      return `#/share/${encodeURIComponent(r.token)}`;
    case 'admin':
      return '#/admin';
    default:
      return '#/projects';
  }
}

export function navigate(r: Route): void {
  window.location.hash = routePath(r);
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash);
}
