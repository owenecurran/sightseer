import { supabase } from '@/lib/supabase';

// Resolves entirely server-side (resolve-username-signin Edge Function) —
// the client never sees the account's actual email, only the resulting
// session once the password has been verified. setSession() here is the
// same call src/app/reset-password.tsx already uses to install a
// server-minted session; AuthProvider's existing onAuthStateChange listener
// picks it up with no further wiring needed.
// The captcha token is forwarded rather than used here: the function
// performs the actual signInWithPassword server-side, and Supabase enforces
// captcha on that endpoint too. Without passing it through, signing in by
// username fails with a captcha error the caller cannot do anything about.
export async function signInWithUsername(
  handle: string,
  password: string,
  captchaToken?: string | null,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('resolve-username-signin', {
    body: { handle, password, captchaToken },
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
