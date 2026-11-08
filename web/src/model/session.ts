import { create } from 'zustand';
import type { SessionUser } from '@salla/shared';

interface SessionState {
  user: SessionUser | null;
  /** 'offline': the server did not answer at start (the on/off server is stopped). */
  status: 'loading' | 'anon' | 'auth' | 'offline';
  set: (patch: Partial<Omit<SessionState, 'set'>>) => void;
}

export const useSession = create<SessionState>()((set) => ({
  user: null,
  status: 'loading',
  set: (patch) => set(patch),
}));
