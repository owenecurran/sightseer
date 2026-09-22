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

// The mapping itself. Exported through authErrorMessage below, which keeps
// the original where a developer can still read it.
function mapMessage(error: unknown, fallback: string): string {
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
  // GoTrue's own throttle says neither "rate limit" nor "too many" — its
  // wording is "For security purposes, you can only request this after 47
  // seconds", which sailed straight through the two checks above and reached
  // the screen verbatim. Matched on what it actually says.
  if (
    lower.includes('rate limit') ||
    lower.includes('too many') ||
    lower.includes('for security purposes') ||
    lower.includes('you can only request this after')
  ) {
    return 'Too many attempts just now. Wait a minute and try again.';
  }

  // ---------------- SMS, and the provider behind it ----------------
  //
  // These arrive from Twilio by way of GoTrue and are written for whoever
  // administers the account, not for whoever is holding the phone. The one
  // that prompted this reached a screen verbatim as:
  //
  //   Error sending phone_change OTP to provider: Primary compliance profile
  //   is not approved. Please refer to documentation and complete the KYC
  //   process in Trust Hub to gain access.
  //
  // Accurate, actionable, and addressed to entirely the wrong person.
  if (
    lower.includes('compliance profile') ||
    lower.includes('trust hub') ||
    lower.includes('otp to provider') ||
    lower.includes('sms provider') ||
    lower.includes('unsupported phone provider')
  ) {
    return 'Text messages are not available right now. Please try another way to sign in.';
  }
  if (lower.includes('invalid phone') || lower.includes('not a valid phone')) {
    return 'That does not look like a phone number. Include the country code, like +1.';
  }
  if (lower.includes('token has expired') || lower.includes('expired or is invalid')) {
    return 'That code has expired. Ask for a new one.';
  }
  if (lower.includes('invalid token') || lower.includes('token is invalid')) {
    return 'That code is not right. Check it and try again.';
  }
  if (lower.includes('signups not allowed')) {
    return 'New accounts cannot be created with a phone number just now.';
  }
  if (lower.includes('phone_exists') || lower.includes('phone number already')) {
    return 'That number is already on another account.';
  }

  return text;
}

// What a person sees, with what actually happened kept for whoever has to
// fix it.
//
// Every rewrite above throws information away on purpose — a Twilio
// compliance notice or a GoTrue status code is written for an operator, and
// showing it to somebody holding a phone helps nobody. But it is exactly
// what IS wanted while building, and losing it is how a one-line provider
// misconfiguration turns into an afternoon.
//
// Dev only, and deliberately: in a release build this would put raw provider
// text into whatever collects console output, which is the same disclosure
// the rewrite exists to prevent. Quiet when nothing was changed, so the log
// only ever shows the cases where detail was actually suppressed.
export function authErrorMessage(error: unknown, fallback: string): string {
  const shown = mapMessage(error, fallback);
  if (__DEV__) {
    const { text } = rawMessage(error);
    if (shown !== text) {
      console.warn('[auth] shown to user:', shown);
      console.warn('[auth] original:', text || error);
    }
  }
  return shown;
}
