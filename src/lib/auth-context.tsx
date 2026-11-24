import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { consumePendingInvite } from '@/lib/invites';
import { setMediaCacheViewer } from '@/lib/media-url-cache';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

export type Profile = Database['public']['Tables']['users']['Row'];

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  // True when the last try at fetching the profile failed, as opposed to
  // there being no profile yet. Both leave `profile` null, and the root
  // layout used to read either one as an account that had not finished
  // signing up: open the app offline and a long-standing account was sent
  // to the Terms screen, the first step of signup, and kept there.
  profileFailed: boolean;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null | undefined> {
  const { data, error } = await supabase.rpc('get_my_profile');
  if (error) throw error;

  // PostgREST can return a composite as an object or a single-element array.
  const row = (Array.isArray(data) ? data[0] : data) as Profile | null | undefined;
  if (!row?.id) return null;
  return row.id === userId ? row : undefined;
}

type ActiveAccount = {
  userId: string;
  profileRequest: number;
  inviteToken?: string;
  pendingInvite?: Promise<boolean>;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileFailed, setProfileFailed] = useState(false);
  const activeAccount = useRef<ActiveAccount | null>(null);

  const refreshAccount = useCallback(async (account: ActiveAccount) => {
    if (activeAccount.current !== account) return;
    const request = ++account.profileRequest;
    const isCurrent = () => activeAccount.current === account && account.profileRequest === request;

    try {
      if (account.inviteToken) {
        const token = account.inviteToken;
        account.inviteToken = undefined;
        account.pendingInvite = consumePendingInvite(token, () => activeAccount.current === account);
      }
      await account.pendingInvite;
      if (!isCurrent()) return;

      const nextProfile = await fetchProfile(account.userId);
      if (isCurrent() && nextProfile !== undefined) setProfile(nextProfile);
      if (isCurrent()) setProfileFailed(false);
    } catch (error) {
      if (isCurrent()) {
        console.error('Failed to fetch profile', error);
        setProfileFailed(true);
      }
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    let receivedSession = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // INITIAL_SESSION supplies startup state. An auth change received
      // before it already has a newer session.
      if (!isMounted || (event === 'INITIAL_SESSION' && receivedSession)) return;
      receivedSession = true;

      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
      let account = activeAccount.current;
      const userId = nextSession?.user.id;
      if (!nextSession || !userId) {
        account = null;
        activeAccount.current = null;
        setProfile(null);
        setProfileFailed(false);
        setIsLoading(false);
      } else if (account?.userId !== userId) {
        account = {
          userId,
          profileRequest: 0,
          inviteToken: event === 'SIGNED_IN' ? nextSession.access_token : undefined,
        };
        activeAccount.current = account;
        setProfile(null);
        setProfileFailed(false);
        setIsLoading(true);
      }

      setMediaCacheViewer(userId);
      setSession(nextSession);
      if (nextSession && account) {
        const accountToRefresh = account;
        // Run network calls outside Supabase's auth callback.
        refreshTimer = setTimeout(() => { void refreshAccount(accountToRefresh); }, 0);
      }
    });

    return () => {
      isMounted = false;
      activeAccount.current = null;
      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
      subscription.unsubscribe();
    };
  }, [refreshAccount]);

  const refreshProfile = useCallback(async () => {
    const account = activeAccount.current;
    if (account) await refreshAccount(account);
  }, [refreshAccount]);

  return (
    <AuthContext.Provider value={{ session, profile, isLoading, profileFailed, refreshProfile }}>
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
