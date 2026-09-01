import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// expo-notifications is a NATIVE module, and importing it normally throws at
// module-evaluation time on any build that doesn't contain it — which took
// the entire app down with "Cannot find native module 'ExpoPushTokenManager'"
// at _layout.tsx line 1, before a single screen rendered.
//
// That matters beyond the one rebuild: a dev build lags the JS it runs, so
// any teammate or CI checkout on an older binary would hit the same wall.
// Resolving it defensively means push simply does nothing until the binary
// catches up, instead of being a hard gate on the app starting at all.
type NotificationsModule = typeof import('expo-notifications');

const Notifications: NotificationsModule | null = (() => {
  // Web has no push here at all, and the module's web shim isn't worth
  // loading just to no-op.
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null;
  }
})();

// True once the app is running on a build that actually contains the module.
export const isPushAvailable = Notifications != null;

// Foreground behaviour. Without this, a push arriving while the app is open
// is handed to the handler and never shown — which reads as dropped
// notifications during exactly the testing you do most.
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

// Registers this device for push and stores the token against the signed-in
// user. Safe to call on every launch: push_tokens is keyed on the token, so
// re-registering the same device updates in place.
//
// Returns null rather than throwing for every "push isn't available" case —
// no module, a simulator, web, declined permission — because none of those
// are things the caller can act on, and a rejection here would surface as a
// crash on a screen that has nothing to do with notifications.
export async function registerForPush(userId: string): Promise<string | null> {
  if (!Notifications) return null;
  // iOS simulators genuinely cannot receive push — there is no APNs client
  // in them, so registering is guaranteed to fail. Android emulators are a
  // different case: one with Google Play services (as the default AVD has)
  // registers with FCM and receives pushes exactly like hardware. Blocking
  // both is the usual advice, and it costs you the ability to test any of
  // this without a physical device.
  if (!Device.isDevice && Platform.OS === 'ios') return null;

  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    // Only ask if we have never asked. Re-prompting someone who declined
    // does nothing on iOS anyway — the OS returns denied without a dialog.
    if (status !== 'granted' && existing.canAskAgain) {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return null;

    // Android posts silently with no heads-up display unless a channel exists.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    // Read from the app config rather than requiring a separate env var to
    // be kept in sync with app.json's extra.eas.projectId — one source, and
    // one less thing to forget when setting the project up somewhere new.
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
        ?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    if (!token) return null;

    await supabase.from('push_tokens').upsert(
      {
        token,
        user_id: userId,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    );

    return token;
  } catch {
    // Push is an enhancement; nothing above is worth interrupting the app for.
    return null;
  }
}

// Called on sign-out. Without it the next person to sign in on this device
// keeps receiving the previous account's notifications, since the token
// belongs to the device and the row still points at the old user.
export async function unregisterPush(): Promise<void> {
  // Must match registerForPush's guard exactly: anything that can register a
  // token has to be able to clear it, or that device keeps receiving the
  // previous account's notifications after a sign-out.
  if (!Notifications || (!Device.isDevice && Platform.OS === 'ios')) return;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync();
    if (token) await supabase.from('push_tokens').delete().eq('token', token);
  } catch {
    // A device that cannot produce a token has nothing registered to remove.
  }
}

// Where a tapped notification should land. Mirrors the in-app notifications
// screen's own routing, so the two cannot drift into sending you to
// different places for the same event.
export function routeForPushData(data: Record<string, unknown>): string | null {
  const type = typeof data.type === 'string' ? data.type : null;
  const visitId = typeof data.visitId === 'string' ? data.visitId : null;
  const boardId = typeof data.boardId === 'string' ? data.boardId : null;
  const travelBookId = typeof data.travelBookId === 'string' ? data.travelBookId : null;

  switch (type) {
    case 'like':
    case 'comment':
    case 'tagged':
    case 'friend_visit':
      return visitId ? `/visit/${visitId}` : null;
    case 'board_saved':
    case 'board_item_added':
      return boardId ? `/board/${boardId}` : null;
    case 'travel_book_saved':
    case 'travel_book_item_added':
      return travelBookId ? `/travel-book/${travelBookId}` : null;
    // Follows and digests have no single target worth deep-linking to, so
    // they open the list that shows all of them.
    default:
      return '/notifications';
  }
}

// Subscribes to notification taps. Wrapped here rather than imported
// directly at the call site so no screen has to import the native module —
// see the guarded resolve above. Returns a no-op unsubscribe when push is
// unavailable, so callers need no branch of their own.
export function addPushTapListener(onRoute: (route: string) => void): () => void {
  if (!Notifications) return () => {};
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const route = routeForPushData(response.notification.request.content.data ?? {});
    if (route) onRoute(route);
  });
  return () => subscription.remove();
}
