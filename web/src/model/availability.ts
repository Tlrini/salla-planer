import { useEffect } from 'react';
import { create } from 'zustand';
import { api } from '../api/client';
import { useEditor } from './store';

export interface Availability {
  date: string;
  /** Pieces taken by confirmed/installed events on the same date (other projects). */
  taken: Record<string, number>;
  /** Pieces used by draft events on the same date (not reserved yet). */
  tentative: Record<string, number>;
  events: Array<{ id: string; name: string; status: string }>;
}

export const useAvailability = create<{ data: Availability | null }>()(() => ({ data: null }));

/** Keep the availability of the open project's event date loaded (for stock warnings). */
export function useAvailabilitySync(): void {
  const date = useEditor((s) => s.project.eventDate);
  const id = useEditor((s) => (s.meta?.kind === 'project' ? s.meta.id : null));
  useEffect(() => {
    useAvailability.setState({ data: null });
    if (!date || !id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    let alive = true;
    const load = () =>
      api
        .get<Availability>(`/api/availability?date=${date}&exclude=${encodeURIComponent(id)}`)
        .then((data) => alive && useAvailability.setState({ data }))
        .catch(() => undefined);
    void load();
    // Other agents book the same day while this one plans: refresh now and then.
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [date, id]);
}
