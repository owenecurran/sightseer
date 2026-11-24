import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  isAuthError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
  PostgrestError,
  StorageApiError,
} from '@supabase/supabase-js';

import { authErrorMessage } from '@/lib/auth-errors';

// Whatever went wrong, as something a person can read and act on.
//
// Every screen used to show a failure as `err.message` whenever there was
// one, and the written fallback only when there was not. Libraries always
// supply one, so what reached the screen was whatever the library said:
// "Edge Function returned a non-2xx status code" when the place picker's
// server function was missing, "TypeError: Network request failed" for a
// dropped connection, "JWT expired", "new row violates row-level security
// policy for table ...". Accurate, and addressed to entirely the wrong person:
// nobody holding the phone can do anything with any of them.
//
// Now each kind of failure gets one plain sentence that says what to do, and
// the screen's own fallback ("Could not load these reviews.") covers anything
// not recognised. Messages the app wrote itself, in its own code or in its
// database functions, still come through as written: they were meant for
// the person reading them.

export type ErrorKind =
  // No connection, or the server could not be reached.
  | 'offline'
  // The session ended; signing in again is the fix.
  | 'signed-out'
  // The account may not do this, or may not see it.
  | 'not-allowed'
  // It is gone, or never existed.
  | 'not-found'
  // Too many tries in a short time.
  | 'busy'
  // It took too long.
  | 'slow'
  // A file over the size allowed.
  | 'too-big'
  // The server failed. Nothing the person did.
  | 'server'
  // A message the app wrote for people, passed through as it is.
  | 'stated'
  // Nothing recognised: the screen's own fallback.
  | 'unknown';

const MESSAGES: Partial<Record<ErrorKind, string>> = {
  offline: 'Could not reach Sightseer. Check your connection and try again.',
  'signed-out': 'You have been signed out. Sign in again to carry on.',
  'not-allowed': 'That is not available to your account.',
  'not-found': 'That could not be found. It may have been deleted.',
  busy: 'Too many tries just now. Wait a minute and try again.',
  slow: 'That took too long. Try again in a moment.',
  'too-big': 'That file is too big to upload.',
};

const NETWORK = /network request failed|failed to fetch|load failed|network ?error|fetch failed|internet connection appears to be offline|could not connect to the server/i;
const TIMEOUT = /timed? ?out|timeout|aborted/i;
const SIGNED_OUT = /jwt expired|invalid jwt|not authenticated|refresh token|session (?:not found|missing|expired)/i;
// Signs that a message was written for whoever reads the logs.
const TECHNICAL = /[{}<>[\]]|https?:|\bnull\b|\bundefined\b|status code|\bjson\b|\bjwt\b|\bsql\b|\brpc\b|\brls\b|row-level|violates|constraint|relation "|column "|exception|errno|econn|\.tsx?\b|\w+Error\b|is not a function/i;

function messageOf(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return '';
}

// Written by the app for people: plain words, not too long, no code in it.
function readsAsWritten(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= 160 && /^[A-Z]/.test(trimmed) && !TECHNICAL.test(trimmed);
}

// A database function's own message: held to a sentence, full stop and all,
// because the same functions also raise terse notes for developers ("not
// authenticated", "too many contacts in one request").
function readsAsSentence(text: string): boolean {
  return readsAsWritten(text) && /[.!?]$/.test(text.trim());
}

function statusOf(error: unknown): number | undefined {
  if (error instanceof FunctionsHttpError) {
    const status = (error.context as { status?: unknown } | undefined)?.status;
    return typeof status === 'number' ? status : undefined;
  }
  if (error && typeof error === 'object') {
    const e = error as { status?: unknown; statusCode?: unknown };
    if (typeof e.status === 'number') return e.status;
    if (typeof e.statusCode === 'number') return e.statusCode;
    if (typeof e.statusCode === 'string' && /^\d+$/.test(e.statusCode)) return Number(e.statusCode);
  }
  return undefined;
}

function kindFromStatus(status: number | undefined): ErrorKind | null {
  if (status == null) return null;
  if (status === 401) return 'signed-out';
  if (status === 403) return 'not-allowed';
  if (status === 404) return 'not-found';
  if (status === 408) return 'slow';
  if (status === 413) return 'too-big';
  if (status === 429) return 'busy';
  if (status >= 500) return 'server';
  return null;
}

// Which kind of failure this is.
export function errorKind(error: unknown): ErrorKind {
  const text = messageOf(error);

  // The connection, whichever library noticed it. postgrest-js reports a
  // failed fetch as an ordinary error whose message is the TypeError's, so
  // the words are checked whatever the class.
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) return 'offline';
  if (isAuthRetryableFetchError(error)) return 'offline';
  if (NETWORK.test(text)) return 'offline';
  if (error && typeof error === 'object' && (error as { name?: unknown }).name === 'AbortError') return 'slow';

  if (isAuthSessionMissingError(error)) return 'signed-out';

  if (error instanceof FunctionsHttpError) {
    // A server function's own message is read from its body by the caller
    // where it matters (see places-cache.ts); here only its status is known.
    // A missing function is a 404 too, which is not the person's doing.
    const status = statusOf(error);
    if (status === 404) return 'server';
    return kindFromStatus(status) ?? 'unknown';
  }

  if (error instanceof PostgrestError || (error && typeof error === 'object' && 'code' in error && 'details' in error)) {
    const code = String((error as { code?: unknown }).code ?? '');
    if (code === 'PGRST301' || code === 'PGRST303' || SIGNED_OUT.test(text)) return 'signed-out';
    if (code === 'PGRST116') return 'not-found';
    if (code === '57014') return 'slow';
    if (code === 'P0003' || code === 'P0004') return 'busy';
    // The app's own database functions raise sentences for people ("You can
    // have at most 5 home locations."). Checked before the permission code,
    // which some of them raise with ("This account cannot publish reviews.").
    if (readsAsSentence(text)) return 'stated';
    if (code === '42501') return 'not-allowed';
    return kindFromStatus(statusOf(error)) ?? 'unknown';
  }

  if (error instanceof StorageApiError) {
    return kindFromStatus(statusOf(error)) ?? 'unknown';
  }

  if (isAuthError(error)) {
    if (SIGNED_OUT.test(text)) return 'signed-out';
    // Sign-in and sign-up failures have their own wording (auth-errors.ts),
    // handled in userErrorMessage below.
    return 'stated';
  }

  if (SIGNED_OUT.test(text)) return 'signed-out';
  if (TIMEOUT.test(text) && !readsAsWritten(text)) return 'slow';

  // Thrown by the app's own code with its own words: a plain Error, or a bare
  // string. A TypeError or the like is a bug, and its message is code.
  const isPlain = typeof error === 'string' || (error instanceof Error && error.constructor === Error);
  if (isPlain && readsAsWritten(text)) return 'stated';
  return 'unknown';
}

// The most recent failures, by the sentence shown for each, so a "tell us
// about it" pressed later can attach what actually went wrong. A few are
// enough: the one on screen is almost always the newest.
const recent = new Map<string, unknown>();
const RECENT_LIMIT = 12;

function remember(shown: string, error: unknown) {
  recent.delete(shown);
  recent.set(shown, error);
  if (recent.size > RECENT_LIMIT) recent.delete(recent.keys().next().value as string);
}

// The error behind a sentence shown on screen, while it is still recent.
export function errorBehind(shown: string): unknown {
  return recent.get(shown);
}

// The sentence to show for `error`. `fallback` is what the screen was trying
// to do, put as a failure ("Could not load these reviews."): it is shown for
// anything not recognised, and for a server failure.
export function userErrorMessage(error: unknown, fallback: string): string {
  const kind = errorKind(error);
  let shown: string;
  if (kind === 'stated') {
    shown = isAuthError(error) ? authErrorMessage(error, fallback) : messageOf(error).trim();
  } else {
    shown = MESSAGES[kind] ?? fallback;
  }
  remember(shown, error);
  return shown;
}
