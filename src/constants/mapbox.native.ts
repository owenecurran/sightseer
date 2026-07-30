import Mapbox from '@rnmapbox/maps';

// `.native.ts` (not `.ts`) deliberately — `@rnmapbox/maps` has no web build
// at all (same constraint `expo-maps` already has), so this file must only
// ever be reachable from `location-search-modal.native.tsx`'s own import
// graph. Naming it `.native.ts` makes Metro's platform resolver enforce that
// boundary at the file level rather than relying on import discipline.

// v1 style: Mapbox's built-in dark style, already close to the app's own
// dark palette and needs zero Mapbox Studio setup to start. A real custom
// Studio style (once built) is a one-line swap of this single constant —
// no other file references the style choice directly.
export const MAPBOX_STYLE_URL = Mapbox.StyleURL.Dark;

// Runs once per process on first import (an ES module's top-level body only
// executes once) — every caller of this file is guaranteed the token is set
// before any MapView mounts, without needing a separate app-startup call.
const accessToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
if (!accessToken) {
  console.warn('Missing EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN — Mapbox tiles will not load.');
}
Mapbox.setAccessToken(accessToken ?? null);
