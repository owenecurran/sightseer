import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

export type Profile = Database['public']['Tables']['users']['Row'];

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string) {
  const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
  if (error) {
    console.error('Failed to fetch profile', error);
    return null;
  }
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Tracks the current session outside React state, so onAuthStateChange's
  // callback (created once, inside an empty-deps effect) can tell whether a
  // new session is a *fresh* sign-in without closing over a stale `session`
  // value from mount time.
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialSession() {
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession();
      if (!isMounted) return;

      sessionRef.current = initialSession;
      setSession(initialSession);
      if (initialSession) {
        setProfile(await fetchProfile(initialSession.user.id));
      }
      setIsLoading(false);
    }

    loadInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!isMounted) return;

      // A fresh sign-in (no session -> a session) needs its profile fetched
      // before the root layout's Stack.Protected guards re-evaluate, or
      // there's a render in between where session is already set but
      // profile is still whatever it was before (null) — hasCompletedOnboarding
      // reads false during that exact gap, which briefly routes to the
      // onboarding screen instead of straight into the app. Re-using
      // isLoading (which already makes the root layout render nothing
      // until it's false) closes that gap the same way it already does for
      // the very first app load. Scoped to just this transition — token
      // refreshes and sign-outs don't have a stale-profile problem, and
      // blanking the whole app during a routine background token refresh
      // would be a worse regression than the bug this fixes.
      const isFreshSignIn = sessionRef.current === null && nextSession !== null;
      if (isFreshSignIn) setIsLoading(true);

      sessionRef.current = nextSession;
      setSession(nextSession);
      setProfile(nextSession ? await fetchProfile(nextSession.user.id) : null);

      if (isFreshSignIn) setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function refreshProfile() {
    if (!session) return;
    setProfile(await fetchProfile(session.user.id));
  }

  return (
    <AuthContext.Provider value={{ session, profile, isLoading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
