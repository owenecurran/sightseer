import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'sightseer.tutorial-seen.v1';

// Whether this device has already been shown how the app works.
//
// On the DEVICE rather than on the account, deliberately. An account-level
// flag would only ever fire for someone signing up, and the people who most
// need this are the ones who already have an account — every existing tester
// has a feed full of postcards and no idea they turn over. A device flag
// shows it once per install to everyone, which is also what "on download"
// actually means.
//
// The consequence, accepted: a reinstall shows it again. For a tutorial that
// is the right way round — someone starting over on a new phone is exactly
// who might want the reminder — and it is three screens they can leave at
// any point.
//
// Versioned in the key. When the app teaches something new, bumping to v2
// shows the new tutorial once to everybody rather than only to people who
// have never installed it.
export async function hasSeenTutorial(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) === 'true';
  } catch {
    // Storage that cannot be read is treated as "already seen". Failing
    // toward NOT showing it matters: the opposite would put a tutorial in
    // front of the app on every single launch for anyone whose storage is
    // unavailable, with no way past it.
    return true;
  }
}

export async function markTutorialSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // Worst case it is shown again next launch. Not worth failing over.
  }
}

// Three states, and the third is the important one.
//
// `null` means "not read yet". The guard in _layout.tsx must not treat that
// as "not seen", or the tutorial flashes up for a frame on every launch
// before storage answers and then vanishes — which looks like a bug and, on
// a slow read, is one.
//
// The value lives in a MODULE-LEVEL store rather than in each hook's own
// state, and that is load-bearing rather than tidiness. Two places call this:
// the root layout, which owns the gate, and the tutorial screen, which is
// what closes it. With per-hook state, the screen calling markSeen updated
// only the screen's own copy — the layout's still said "not seen", so the
// gate stayed shut and the tutorial sat there until the app was restarted.
// The flag did reach storage, which made it look fixed on the next launch
// and hid the bug entirely. One store, every reader notified.
let cached: boolean | null = null;
let hasRead = false;
const listeners = new Set<(value: boolean | null) => void>();

// Whether this app run began with the tutorial unseen — i.e. whether this is
// a first launch.
//
// Captured at the moment storage first answers, and never updated after,
// which is the entire point. `cached` flips to true the instant someone
// finishes or skips the tutorial, so by the time the home screen mounts it
// can no longer tell a brand-new install from a returning one. This can.
//
// Read by the home screen to open on Discover rather than on the following
// feed: a person who has been in the app for ninety seconds follows nobody,
// so their feed is empty, and an empty feed is the worst possible first
// impression of a place that is meant to be full of postcards.
let launchedFresh = false;

export function isFirstLaunch(): boolean {
  return launchedFresh;
}

function publish(value: boolean | null) {
  cached = value;
  for (const listener of listeners) listener(value);
}

export function useTutorialSeen(): {
  seen: boolean | null;
  markSeen: () => void;
} {
  const [seen, setSeen] = useState<boolean | null>(cached);

  useEffect(() => {
    listeners.add(setSeen);
    // Read once per app run, however many hooks are mounted.
    if (!hasRead) {
      hasRead = true;
      void hasSeenTutorial().then((value) => {
        // Only here, on the one read per app run, and before publish lets
        // anything flip it. A storage failure reports "seen", so it lands on
        // false and the home screen opens on the feed as it always did.
        launchedFresh = value === false;
        publish(value);
      });
    }
    return () => {
      listeners.delete(setSeen);
    };
  }, []);

  const markSeen = useCallback(() => {
    // Published first so the gate closes on this frame; the write catches up.
    // Waiting on storage would leave the tutorial on screen after the person
    // has already said they are done with it.
    publish(true);
    void markTutorialSeen();
  }, []);

  return { seen, markSeen };
}
