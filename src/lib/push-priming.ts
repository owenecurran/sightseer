import AsyncStorage from '@react-native-async-storage/async-storage';

import { getPushPermissionState } from '@/lib/push';

const DISMISSED_AT_KEY = 'push-priming-dismissed-at';

// How long "Not now" holds. Long enough not to nag, short enough that
// someone who has since started following people gets asked again — the
// whole reason priming is worth building is that our own screen costs
// nothing to show twice, where the OS alert can only be spent once.
const SNOOZE_DAYS = 30;

// Mirrors supabase.ts: this module can be imported during web SSR, where
// `window` does not exist and AsyncStorage throws on touch.
const canUseStorage = typeof window !== 'undefined';

// Whether to show our own explaining screen before the system alert.
//
// Deliberately not shown when the OS has already decided: 'granted' needs
// nothing, and 'blocked' cannot be undone from inside the app, so priming
// there would be a dead end that only Settings can resolve.
export async function shouldShowPushPriming(): Promise<boolean> {
  const state = await getPushPermissionState();
  if (state !== 'undetermined') return false;
  if (!canUseStorage) return false;

  try {
    const dismissedAt = await AsyncStorage.getItem(DISMISSED_AT_KEY);
    if (!dismissedAt) return true;
    const elapsedDays = (Date.now() - Number(dismissedAt)) / (1000 * 60 * 60 * 24);
    return elapsedDays >= SNOOZE_DAYS;
  } catch {
    // A storage failure should not cost someone the prompt entirely; showing
    // it is the recoverable direction.
    return true;
  }
}

// Records a "Not now". Stored on the device rather than the account because
// notification permission is per-device: the same person on a phone and a
// tablet is two separate decisions.
export async function snoozePushPriming(): Promise<void> {
  if (!canUseStorage) return;
  try {
    await AsyncStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
  } catch {
    // Worst case they see the card again next launch.
  }
}
