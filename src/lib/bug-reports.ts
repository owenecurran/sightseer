import { Platform } from 'react-native';

import Constants from 'expo-constants';

import { supabase } from '@/lib/supabase';

// A person telling us something is broken, in their own words.
//
// The counterpart to src/lib/error-report.ts, not a replacement for it.
// That one fires automatically when the error boundary catches a crash and
// knows what threw but nothing about what anyone was trying to do. This one
// knows what they were trying to do and nothing about what threw. Most
// useful bugs need both halves, and neither can produce the other.
//
// Everything except the sentence is captured rather than asked for. "Which
// version are you on" and "which screen was it" are questions almost nobody
// can answer accurately and every report needs the answers to.

function appVersion(): string {
  const version = Constants.expoConfig?.version ?? '';
  // The build number is what separates two TestFlight builds of the same
  // version, which is usually the question being asked.
  const build =
    Platform.OS === 'ios'
      ? Constants.expoConfig?.ios?.buildNumber
      : Constants.expoConfig?.android?.versionCode;
  return build ? `${version} (${build})` : version;
}

export type SubmitBugResult = { ok: true } | { ok: false; message: string };

// Thrown by submit_bug_report when somebody has filed twenty inside an hour.
const TOO_MANY = 'P0003';

export async function submitBugReport(
  message: string,
  route: string | null
): Promise<SubmitBugResult> {
  const trimmed = message.trim();
  if (!trimmed) return { ok: false, message: 'Write a little about what went wrong first.' };

  const { error } = await supabase.rpc('submit_bug_report', {
    p_message: trimmed,
    p_app_version: appVersion(),
    p_platform: `${Platform.OS} ${String(Platform.Version)}`,
    p_route: route ?? undefined,
  });

  if (error) {
    if ((error as { code?: string }).code === TOO_MANY) {
      return { ok: false, message: 'That is a lot of reports at once. Try again a bit later.' };
    }
    // Deliberately not surfacing the Postgres message: it is written for
    // whoever reads the logs, and somebody already having a bad time does
    // not need a second error about their report about the first one.
    return { ok: false, message: 'Could not send that just now. Please try again.' };
  }
  return { ok: true };
}
