import { Platform } from 'react-native';

// Where the web landing sends someone who is on a phone.
//
// SET THESE IN .env.local, NOT HERE. All four come from EXPO_PUBLIC_* so a
// listing can be pointed at the day it goes live without anybody editing
// source — see .env.example. Unset means empty, which every render below
// already guards, so the landing offers to continue in the browser rather
// than pointing at a listing that does not exist.
//
// The honest limit: EXPO_PUBLIC_* is inlined at BUILD time, not read at run
// time, so a new value still needs the web export redeployed. What it buys is
// that the value is configuration rather than code — no diff, no review, and
// it can differ between environments.
//
// Trimmed because a .env file is edited by hand and a trailing space is
// invisible: ' https://…' would sail past `.length > 0` and open a broken
// link, which is the one outcome this whole arrangement exists to prevent.
function storeEnv(value: string | undefined): string {
  return (value ?? '').trim();
}

// Written out one per line rather than looked up dynamically: Expo's babel
// plugin replaces the literal `process.env.EXPO_PUBLIC_…` expression at build
// time, so a computed key would inline as undefined and silently disable the
// link.
export const APP_STORE_URL = storeEnv(process.env.EXPO_PUBLIC_APP_STORE_URL);
export const PLAY_STORE_URL = storeEnv(process.env.EXPO_PUBLIC_PLAY_STORE_URL);

export const hasAppStoreLink = APP_STORE_URL.length > 0;
export const hasPlayStoreLink = PLAY_STORE_URL.length > 0;
export const hasStoreLinks = hasAppStoreLink || hasPlayStoreLink;

// ---------------------------------------------------------------------
// TestFlight — the interim iOS route, until there is a listing
// ---------------------------------------------------------------------
//
// Same contract as the two above: set in .env.local, guarded everywhere, and
// leaving them unset degrades to "continue in the browser" rather than to a
// broken button.
//
// Both exist because they fail in different places. The public join link is
// the one-tap path, but it only works on a device that already has
// TestFlight installed — on anything else it opens a web page that asks the
// visitor to go and get TestFlight first, and people bounce off that. The
// redeem code is the manual fallback for exactly that case, and is also the
// only thing that works if Apple ever caps the public link's tester slots.
//
// EXPO_PUBLIC_TESTFLIGHT_URL is the full https://testflight.apple.com/join/
// XXXXXXXX URL. EXPO_PUBLIC_TESTFLIGHT_CODE is the bare code — the XXXXXXXX
// part — shown as text to be typed into TestFlight's "Redeem" box by hand.
export const TESTFLIGHT_URL = storeEnv(process.env.EXPO_PUBLIC_TESTFLIGHT_URL);
export const TESTFLIGHT_CODE = storeEnv(process.env.EXPO_PUBLIC_TESTFLIGHT_CODE);

export const hasTestFlightLink = TESTFLIGHT_URL.length > 0;
export const hasTestFlightCode = TESTFLIGHT_CODE.length > 0;
export const hasTestFlight = hasTestFlightLink || hasTestFlightCode;

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

// What a phone can actually install from right now, as one value rather than
// as three booleans every caller has to recombine.
//
// Ordered by preference, not by platform: a real listing beats TestFlight,
// TestFlight beats nothing, and "nothing" is a first-class answer rather
// than a null that each screen has to invent copy for. Android has no
// interim path at all — there is no Play equivalent of a public TestFlight
// link that works without a Console opt-in URL — so it goes straight from
// `store` to `none`, and the browser is what it is offered instead.
export type InstallTarget =
  | { kind: 'store'; url: string }
  | { kind: 'testflight'; url: string | null; code: string | null }
  | { kind: 'none' };

export function installTargetFor(platform: DevicePlatform): InstallTarget {
  if (platform === 'ios') {
    if (hasAppStoreLink) return { kind: 'store', url: APP_STORE_URL };
    if (hasTestFlight) {
      return {
        kind: 'testflight',
        url: hasTestFlightLink ? TESTFLIGHT_URL : null,
        code: hasTestFlightCode ? TESTFLIGHT_CODE : null,
      };
    }
    return { kind: 'none' };
  }
  if (platform === 'android') {
    return hasPlayStoreLink ? { kind: 'store', url: PLAY_STORE_URL } : { kind: 'none' };
  }
  return { kind: 'none' };
}
