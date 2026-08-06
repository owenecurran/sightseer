import { supabase } from '@/lib/supabase';

// Resolves entirely server-side (resolve-username-signin Edge Function) —
// the client never sees the account's actual email, only the resulting
// session once the password has been verified. setSession() here is the
// same call src/app/reset-password.tsx already uses to install a
// server-minted session; AuthProvider's existing onAuthStateChange listener
// picks it up with no further wiring needed.
export async function signInWithUsername(handle: string, password: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('resolve-username-signin', {
    body: { handle, password },
  });
  if (error || data?.error) {
    throw new Error(data?.error ?? 'Incorrect username or password.');
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (sessionError) throw sessionError;
}
