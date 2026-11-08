import { ApiError } from '../api/client';

/**
 * The on/off server (docs/deploy-cloud.md §2): when it is stopped, the cached app (sw.js) still
 * opens and offers the agency's start link, which is kept in this browser because the server
 * that knows it is off.
 */

const START_LINK_KEY = 'salla-start-link';

export function rememberStartLink(link: string | undefined): void {
  try {
    if (link) localStorage.setItem(START_LINK_KEY, link);
    else localStorage.removeItem(START_LINK_KEY);
  } catch {
    // Private mode: the offline page then asks the admin for the link.
  }
}

export function savedStartLink(): string | null {
  try {
    const v = localStorage.getItem(START_LINK_KEY);
    return v && /^https:\/\//.test(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * The server did not answer: no connection at all (VM stopped) or the proxy answering
 * without the app behind it (starting up). Pure.
 */
export function isServerDown(err: unknown): boolean {
  return err instanceof ApiError && [0, 502, 503, 504].includes(err.status);
}

/** Register the service worker that keeps the app shell for when the server is off. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // One cache per build: the module URL of this bundle changes with every build.
  const build = new URL(import.meta.url).pathname;
  void navigator.serviceWorker
    .register(`/sw.js?v=${encodeURIComponent(build)}`)
    .catch((err: unknown) => console.warn('service worker not registered', err));
}
