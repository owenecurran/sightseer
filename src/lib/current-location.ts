import * as Location from 'expo-location';

export type Coordinate = { lat: number; lng: number };

// Best-effort: any failure (permission denied, location services off,
// timeout) just means the caller falls back to its own default view rather
// than blocking or crashing the location picker over a nice-to-have.
// expo-location has a real web implementation (backed by the browser's
// Geolocation API), so this one function works unmodified on every platform
// this app ships to — no native/web split needed here.
export async function getCurrentLocation(): Promise<Coordinate | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const position = await Location.getCurrentPositionAsync({});
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    return null;
  }
}

// How long the cached fix is allowed to take before the caller gives up on
// knowing where the viewer is. It should return more or less at once — this
// is only here so that a wedged location provider cannot hold a screen.
const LAST_KNOWN_TIMEOUT_MS = 2000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    work,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

// Where the viewer is, but only if that can be answered cheaply and without
// asking them for anything.
//
// Three deliberate differences from getCurrentLocation above, all for the
// same reason — this is for a BROWSE screen that works fine without it:
//
//  - it does not request permission, only checks it. A permission dialog
//    thrown up over a list of places reads as the app grabbing at something
//    rather than as a feature;
//  - it reads the LAST KNOWN fix rather than taking a new one.
//    getCurrentPositionAsync waits for the radio to produce a fresh fix, and
//    with no options it has no deadline at all. Observed on the emulator,
//    which has permission but no fix: Discover sat on its spinner forever.
//    A real device indoors, or with a cold GPS, does the same thing;
//  - and it gives even that a deadline, because "we could not tell" has to be
//    an answer this returns rather than a state it hangs in.
//
// Null is the expected result, not a failure. The caller falls back to the
// coarse location the account already carries, and the ranking works without
// either.
export async function getCurrentLocationIfPermitted(): Promise<Coordinate | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const position = await withTimeout(
      Location.getLastKnownPositionAsync(),
      LAST_KNOWN_TIMEOUT_MS,
    );
    if (!position) return null;
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    return null;
  }
}
