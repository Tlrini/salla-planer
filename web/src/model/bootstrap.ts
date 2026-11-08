import type { AgencySettings, CatalogItem, SessionUser } from '@salla/shared';
import { api, ApiError } from '../api/client';
import { isServerDown, rememberStartLink } from './offline';
import { useSession } from './session';
import { setCatalog } from './store';

export async function loadCatalog(): Promise<void> {
  setCatalog(await api.get<CatalogItem[]>('/api/catalog'));
}

/** On app start: restore the session from the cookie and load the catalog. */
export async function bootstrap(): Promise<void> {
  try {
    const user = await api.get<SessionUser>('/api/auth/me');
    await loadCatalog();
    useSession.getState().set({ user, status: 'auth' });
    // Keep the start link on this device for when the server is off (see model/offline.ts).
    void api
      .get<AgencySettings>('/api/settings/agency')
      .then((a) => rememberStartLink(a.startLink))
      .catch(() => undefined);
  } catch (err) {
    if (isServerDown(err)) {
      useSession.getState().set({ user: null, status: 'offline' });
      return;
    }
    if (!(err instanceof ApiError) || err.status !== 401) console.error(err);
    useSession.getState().set({ user: null, status: 'anon' });
  }
}

export async function logout(): Promise<void> {
  try {
    await api.post('/api/auth/logout');
  } finally {
    useSession.getState().set({ user: null, status: 'anon' });
    window.location.hash = '';
  }
}
