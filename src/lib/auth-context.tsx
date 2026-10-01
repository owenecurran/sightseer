import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { consumePendingInvite } from '@/lib/invites';
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

async function fetchProfile(userId: string): Promise<Profile | null> {
  // Through get_my_profile rather than a table read, because this row needs
  // the columns the public grant no longer covers — the signup gates, the
  // notify preferences, hashed_phone. A column grant cannot say "these
  // columns, but only for your own row"; a definer function can.
  // See 20260930130000_restrict_users_columns.sql.
  const { data, error } = await supabase.rpc('get_my_profile');

  if (error) {
    // This is the single worst thing that can fail in the app: a null profile
    // reads as "has not finished signing up", so every gate in _layout.tsx
    // opens and the person is walked back through onboarding. Loud on
    // purpose.
    console.error('Failed to fetch profile', error);
    return null;
  }

  // Deliberately tolerant of BOTH shapes, rather than calling .single().
  //
  // get_my_profile returns `public.users`, a composite rather than a set, and
  // PostgREST returns a composite unwrapped — so the result is an object, not
  // a one-element array. .single() asks for the object representation and is
  // very likely fine, but "very likely" is not a good enough bet on the one
  // call that decides whether anybody is signed in. Accepting either costs
  // two lines and cannot be wrong.
  const row = Array.isArray(data) ? (data[0] ?? null) : data;
  if (!row) {
    console.error('Failed to fetch profile', `get_my_profile returned nothing for ${userId}`);
    return null;
  }
  return row as Profile;
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

      // Attribution, at the first moment there is an account to attach it
      // to. Before fetchProfile rather than after, so the profile the guards
      // then read already carries invited_by instead of needing a second
      // round trip to notice it.
      //
      // Only on a fresh sign-in: redeem_invite is write-once server-side, so
      // running it on every token refresh would be harmless but pointless.
      // It is awaited inside the isLoading window the comment above opens,
      // which is what keeps it off the critical path of a routine refresh.
      if (isFreshSignIn) await consumePendingInvite();

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
