import { Platform } from 'react-native';

import Constants from 'expo-constants';

import { supabase } from '@/lib/supabase';

// Send a significant error somewhere it can be read later.
//
// The problem this solves: a render crash on a tester's phone currently
// reaches console.error and nothing else, and nobody is attached to that
// console. See supabase/migrations/20260922170000_client_errors.sql for why
// this rather than Sentry for now.
//
// WHAT BELONGS HERE
//
// Errors nobody expected and nobody can act on from inside the app — the
// error boundary catching a render crash is the case it was built for.
//
// What does NOT belong here: anything already handled. A failed sign-in, a
// rejected code, a network blip a screen already shows a message for. Those
// are the app working. And SMS failures least of all, since Twilio's own
// console logs every attempt with the provider's own reason, first-hand.
//
// NEVER THROWS, and never blocks. Reporting is the least important thing
// happening at the moment something has already gone wrong: a failure to
// report must not become a second error on top of the first, and the caller
// is usually mid-crash. It is deliberately not awaited anywhere.

function appVersion(): string {
  const version = Constants.expoConfig?.version ?? '';
  // The build number moves independently of the version on stores, and it
  // is what tells two TestFlight builds of "1.1.0" apart — which is exactly
  // the question being asked when reading these.
  const build =
    Platform.OS === 'ios'
      ? Constants.expoConfig?.ios?.buildNumber
      : Constants.expoConfig?.android?.versionCode;
  return build ? `${version} (${build})` : version;
}

export function reportError(
  context: string,
  error: unknown,
  extra?: { componentStack?: string | null }
): void {
  // Always to the console as well. In development that is the fast path, and
  // it means the local experience does not change just because reporting was
  // added underneath it.
  console.error(`[${context}]`, error, extra?.componentStack ?? '');

  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  void supabase
    .rpc('report_client_error', {
      p_context: context,
      p_message: message,
      p_stack: stack ?? undefined,
      p_component_stack: extra?.componentStack ?? undefined,
      p_platform: `${Platform.OS} ${String(Platform.Version)}`,
      p_app_version: appVersion(),
    })
    .then(
      () => {},
      () => {
        // Swallowed on purpose. No session, no network, the table gone — all
        // of them end the same way, and none of them is worth surfacing to
        // somebody already looking at a crash screen.
      }
    );
}
