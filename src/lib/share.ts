import { Platform, Share } from 'react-native';

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'unsupported' | 'error';

// Cross-platform text sharing. Most desktop browsers don't implement
// navigator.share at all (it's just absent, not an error), so falling back
// to a clipboard copy is the only way this ever completes there — without
// it a "Share" button on web silently does nothing, which is a real bug
// this was built to fix (first hit on the invite-gate screen).
export async function shareText(message: string): Promise<ShareResult> {
  if (Platform.OS === 'web') {
    const nav = typeof navigator === 'undefined' ? undefined : navigator;
    if (nav?.share) {
      try {
        await nav.share({ text: message });
        return 'shared';
      } catch {
        return 'cancelled';
      }
    }
    if (nav?.clipboard?.writeText) {
      try {
        await nav.clipboard.writeText(message);
        return 'copied';
      } catch {
        return 'error';
      }
    }
    return 'unsupported';
  }

  try {
    const result = await Share.share({ message });
    // dismissedAction (iOS cancel) means the share sheet never completed.
    if (result.action === Share.dismissedAction) return 'cancelled';
    return 'shared';
  } catch {
    return 'cancelled';
  }
}
