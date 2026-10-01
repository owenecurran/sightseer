import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

export type DeleteAccountArgs = {
  // Required of accounts that actually have a password. OAuth-only accounts
  // (Google or Apple and nothing else) have none to confirm, and the
  // function decides which case this is — the client only offers the field.
  password?: string;
  // Forwarded for the same reason username sign-in forwards one: verifying
  // the password server-side is a real sign-in grant, so the project's
  // captcha protection applies to it exactly as it would to the client's own
  // call. See resolve-username-signin.
  captchaToken?: string | null;
};

// What the edge function actually said.
//
// functions-js reports ANY non-2xx as the same opaque
// "Edge Function returned a non-2xx status code" and leaves the response
// untouched on `error.context`. The function's own `{ error: "..." }` body
// was therefore never read, and every server-side failure reached the user
// as that one sentence — which is how a broken delete looked identical to a
// wrong password.
async function messageFor(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body && typeof body.error === 'string' && body.error) return body.error;
    } catch {
      // Not JSON — a platform-level failure (boot error, timeout) rather
      // than one of ours. Fall through to the generic message.
    }
  }
  return error instanceof Error ? error.message : 'Could not delete your account.';
}

// Permanently deletes the signed-in account.
//
// An edge function rather than a client-side delete, because removing the
// auth user requires the service role — a client can only ever delete its
// own PROFILE row, which would leave a sign-in-able account behind pointing
// at nothing. The function takes no user id: it acts on the caller's own
// verified token, so this cannot be pointed at anyone else.
export async function deleteAccount(args: DeleteAccountArgs = {}): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account', {
    body: {
      password: args.password ?? null,
      captchaToken: args.captchaToken ?? null,
    },
  });
  if (error) throw new Error(await messageFor(error));
  if (data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }

  // The session is dead server-side; clearing it locally is what actually
  // returns the app to the signed-out state. Ignoring the result on purpose —
  // the account is already gone, so a failure here must not surface as
  // "deletion failed".
  await supabase.auth.signOut().catch(() => {});
}

// Whether this account has a password to confirm.
//
// Read from the session rather than asked of the server: an account created
// with Google or Apple and never given a password has no 'email' identity,
// and demanding one would make deletion impossible for them. The function
// makes the same determination independently and enforces it — this only
// decides whether the field is worth showing.
export async function accountHasPassword(): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  const identities = data.user?.identities ?? [];
  return identities.some((identity) => identity.provider === 'email');
}
