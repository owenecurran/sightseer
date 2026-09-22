import { supabase } from '@/lib/supabase';

// Phone numbers, proved by SMS.
//
// Backed by Twilio Verify rather than plain Twilio Programmable Messaging,
// and that choice is load-bearing rather than a preference. Since February
// 2025 the US carriers block unregistered application-to-person traffic from
// 10-digit numbers outright, and registering needs a business tax ID plus
// about a week of carrier review. Twilio's own docs name Verify as the way
// round that for one-time-password traffic specifically: no brand, no
// campaign, no sender provisioning. It costs roughly $0.05 a verification
// against roughly $0.013 a message, which is the premium for not needing an
// EIN to send anything at all.
//
// Nothing here works until Twilio Verify is enabled on the hosted Supabase
// project — Authentication → Providers → Phone. config.toml's [auth.sms]
// block is local-dev only, the same way the Google and Apple blocks are.
//
// TWO FLOWS, and they are not interchangeable:
//
//   startPhoneSignIn / confirmPhoneSignIn — no session yet. Creates the
//     account, or signs into the one that already owns the number.
//   startPhoneLink / confirmPhoneLink — already signed in. Attaches a number
//     to the existing account, so somebody who joined with email or Apple can
//     become findable without starting again.
//
// Using the wrong pair fails in a confusing way: verifyOtp's `type` has to
// match how the code was requested, and a 'sms' token will not confirm a
// phone change.

export type OtpResult = { ok: true } | { ok: false; message: string };

// Supabase wants E.164. The device-contacts side normalises identically —
// see normalizePhone in src/lib/contacts.ts — and the two have to agree or a
// verified number hashes differently from the same number in somebody's
// address book, and matching silently never happens.
export function toE164(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

function failure(error: unknown, fallback: string): OtpResult {
  const message = error instanceof Error ? error.message : fallback;
  return { ok: false, message };
}

// ---------------------------------------------------------------------
// No session yet: sign up or sign in with a number
// ---------------------------------------------------------------------

// CAPTCHA IS REQUIRED HERE, and its absence is not a weakness but a hard
// failure: with Turnstile enabled on the project, GoTrue rejects the request
// outright with `captcha_failed`. Every auth GRANT is protected, not just
// /signup — the same thing that once locked every existing account out of
// signing in, recorded at the top of src/components/auth/auth-forms.tsx.
//
// Verified against the live project rather than assumed: a request without a
// token comes back 400 captcha_failed.
//
// The pair below needs none. startPhoneLink goes through updateUser, which is
// an authenticated call rather than a grant — supabase-js does not even offer
// a captchaToken on it — and verifyOtp's own captchaToken is marked
// deprecated, because only the REQUEST for a code is challenged, not the
// redemption of one.
export async function startPhoneSignIn(
  rawPhone: string,
  captchaToken: string | null
): Promise<OtpResult> {
  const { error } = await supabase.auth.signInWithOtp({
    phone: toE164(rawPhone),
    options: captchaToken ? { captchaToken } : undefined,
  });
  if (error) return failure(error, 'Could not send that code.');
  return { ok: true };
}

export async function confirmPhoneSignIn(rawPhone: string, code: string): Promise<OtpResult> {
  const { error } = await supabase.auth.verifyOtp({
    phone: toE164(rawPhone),
    token: code.trim(),
    type: 'sms',
  });
  if (error) return failure(error, 'That code did not work.');
  return { ok: true };
}

// ---------------------------------------------------------------------
// Already signed in: attach a number to this account
// ---------------------------------------------------------------------

export async function startPhoneLink(rawPhone: string): Promise<OtpResult> {
  const { error } = await supabase.auth.updateUser({ phone: toE164(rawPhone) });
  if (error) return failure(error, 'Could not send that code.');
  return { ok: true };
}

export async function confirmPhoneLink(rawPhone: string, code: string): Promise<OtpResult> {
  const { error } = await supabase.auth.verifyOtp({
    phone: toE164(rawPhone),
    token: code.trim(),
    // 'phone_change', not 'sms'. The code was issued by updateUser, and
    // GoTrue tracks the two separately — asking it to confirm a sign-in with
    // a change token is rejected as an invalid token, which reads on screen
    // as "you typed it wrong".
    type: 'phone_change',
  });
  if (error) return failure(error, 'That code did not work.');
  return { ok: true };
}

// ---------------------------------------------------------------------
// Turning a verified number into a matchable one
// ---------------------------------------------------------------------

// Derives hashed_phone and hashed_email from what auth has CONFIRMED, server
// side. Takes no arguments on purpose — there is no parameter for a caller
// to put somebody else's number in.
//
// Safe to call whenever; it only ever writes hashes for identities that are
// already confirmed, and leaves the others alone.
export async function syncVerifiedContactKeys(): Promise<{
  hasPhone: boolean;
  hasEmail: boolean;
}> {
  const { data, error } = await supabase.rpc('sync_verified_contact_keys');
  if (error) throw error;
  const row = (data as { has_phone: boolean; has_email: boolean }[] | null)?.[0];
  return { hasPhone: row?.has_phone ?? false, hasEmail: row?.has_email ?? false };
}
