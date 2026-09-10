import { Platform } from 'react-native';

// Where the web landing sends someone who is on a phone.
//
// ⚠️ PLACEHOLDERS — set these when the listings are live.
//
// Empty on purpose, exactly as PRIVACY_POLICY_URL is in src/lib/legal.ts and
// for the same reason: a store button that opens a 404 is worse than no
// button. `hasStoreLinks` guards every render below, so until these are
// filled the mobile landing offers to continue in the browser instead of
// pointing at a listing that does not exist. Filling them in is a one-line
// change each and needs no other edit.
export const APP_STORE_URL = '';
export const PLAY_STORE_URL = '';

export const hasAppStoreLink = APP_STORE_URL.length > 0;
export const hasPlayStoreLink = PLAY_STORE_URL.length > 0;
export const hasStoreLinks = hasAppStoreLink || hasPlayStoreLink;

export type DevicePlatform = 'ios' | 'android' | 'desktop';

// Which store, if any, to offer this visitor.
//
// User-agent sniffing, which is unreliable in general and is the right tool
// here anyway: the question is not "what engine is this" but "which of two
// shops can this person install from", and that genuinely is a property of
// the device. The cost of getting it wrong is one wrong button, and both
// buttons are shown when detection is inconclusive.
//
// iPadOS is the awkward case: since iOS 13 it reports itself as Macintosh,
// so the platform check has to fall back to "a Mac that reports touch
// points", which no real Mac does.
export function detectDevicePlatform(): DevicePlatform {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS !== 'web') return 'desktop';
  if (typeof navigator === 'undefined') return 'desktop';

  const ua = navigator.userAgent ?? '';

  if (/android/i.test(ua)) return 'android';
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  // iPadOS masquerading as a Mac.
  if (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1) return 'ios';

  return 'desktop';
}

// The store URL for a device, or null when there is nothing to point at —
// either because the device is a desktop or because that listing does not
// exist yet.
export function storeUrlFor(platform: DevicePlatform): string | null {
  if (platform === 'ios') return hasAppStoreLink ? APP_STORE_URL : null;
  if (platform === 'android') return hasPlayStoreLink ? PLAY_STORE_URL : null;
  return null;
}
