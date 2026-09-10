// Auth failures, phrased for the person reading them.
//
// supabase-js does not always hand back a sentence. When a response body
// is not the shape it expects — a 500 from GoTrue, a proxy error page — it
// surfaces the serialised Response instead, which is how a failed signup
// reached the UI as:
//
//   {"status":500,"statusText":"","redirected":false,"url":".../signup"}
//
// That is diagnostic output wearing an error message's clothes. Anything
// unrecognised becomes a plain fallback here, so raw JSON can never reach
// a text field again.

function rawMessage(error: unknown): { text: string; status?: number } {
  if (typeof error === 'string') return { text: error };
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; status?: unknown };
    return {
      text: typeof e.message === 'string' ? e.message : '',
      status: typeof e.status === 'number' ? e.status : undefined,
    };
  }
  return { text: '' };
}

// Whether a sign-in failed only because the address was never confirmed.
//
// Singled out from every other credential failure because it is the one a
// person can actually fix from the sign-in screen — by asking for another
// link. The rest stay deliberately indistinguishable from each other.
export function isEmailNotConfirmed(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { message?: unknown; code?: unknown };
  if (e.code === 'email_not_confirmed') return true;
  return typeof e.message === 'string' && e.message.toLowerCase().includes('email not confirmed');
}

export function authErrorMessage(error: unknown, fallback: string): string {
  const { text, status } = rawMessage(error);

  // A server-side fault is never the user's to act on, and its message is
  // written for an operator. Note this also catches the SMTP case: when a
  // confirmation email cannot be sent, GoTrue answers the signup with a
  // 500 rather than a validation error.
  if (status !== undefined && status >= 500) return fallback;

  // A serialised Response rather than a sentence.
  if (!text || text.trimStart().startsWith('{')) return fallback;

  const lower = text.toLowerCase();

  if (lower.includes('captcha')) {
    return 'The security check did not go through. Please try it again.';
  }
  if (lower.includes('already registered') || lower.includes('already been registered')) {
    return 'An account already exists for that email. Try signing in instead.';
  }
  if (lower.includes('invalid login credentials')) {
    return 'That email, username or password is not right.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Confirm your email address first — check your inbox for the link.';
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many attempts just now. Wait a minute and try again.';
  }
  return text;
}
