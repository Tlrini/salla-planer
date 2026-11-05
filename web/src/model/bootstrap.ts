import type { CatalogItem, SessionUser } from '@salla/shared';
import { api, ApiError } from '../api/client';
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
  } catch (err) {
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
