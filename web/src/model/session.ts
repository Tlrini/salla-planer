import { create } from 'zustand';
import type { SessionUser } from '@salla/shared';

interface SessionState {
  user: SessionUser | null;
  status: 'loading' | 'anon' | 'auth';
  set: (patch: Partial<Omit<SessionState, 'set'>>) => void;
}

export const useSession = create<SessionState>()((set) => ({
  user: null,
  status: 'loading',
  set: (patch) => set(patch),
}));
