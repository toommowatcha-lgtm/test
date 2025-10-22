
import { create } from 'zustand';
import { AppState } from '../types';
import { Session } from '@supabase/supabase-js';

export const useStore = create<AppState>((set) => ({
  session: null,
  user: null,
  setSession: (session: Session | null) => set({ session, user: session?.user ?? null }),
  isLoading: false,
  setLoading: (isLoading: boolean) => set({ isLoading }),
}));
