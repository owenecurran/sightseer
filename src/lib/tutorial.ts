import { useCallback, useState } from 'react';

import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

// Whether this PERSON has already been shown how the app works.
//
// On the ACCOUNT (users.tutorial_seen_at), not on the device. It used to be a
// device flag in AsyncStorage, and that had a hole which only appears once a
// phone is used by more than one account: the flag belonged to the install, so
// a second account signing in on a device that had already seen the tutorial
// never got shown it.
//
// That is not a theory. The test emulator's storage held
// `sightseer.tutorial-seen.v1 = true`, so every account created on it skipped
// the tutorial silently — the gate was working exactly as written, on the
// wrong subject.
//
// The device flag's own argument is preserved rather than thrown away. It was:
// an account flag "would only ever fire for someone signing up", and the
// people who most need this are existing testers who already have accounts and
// have never been told their postcards turn over. The new column is null on
// every row that already exists, so those testers are exactly who it fires
// for. Same outcome, without the hole.
//
// Accepted trade: a reinstall no longer replays the tutorial. For "has this
// person been shown this yet" that is the right answer.
//
// Nothing is read from storage here any more. The flag arrives with the
// profile the root layout already waits on, alongside has_shared_invite and
// has_seen_find_friends, so it is subject to exactly the same loading rules as
// every other gate rather than to its own.

// Three states, and the third is the important one.
//
// `null` means "no profile yet". The guard in _layout.tsx must not read that
// as "not seen", or the tutorial flashes up for a frame before the profile
// arrives — which is why that guard tests `=== false` rather than `!seen`.
function seenFrom(tutorialSeenAt: string | null | undefined, hasProfile: boolean): boolean | null {
  if (!hasProfile) return null;
  return tutorialSeenAt != null;
}

export function useTutorialSeen(): {
  seen: boolean | null;
  markSeen: () => void;
} {
  const { session, profile, refreshProfile } = useAuth();
  // Mirrors the profile, but can be flipped locally the moment someone
  // finishes — see markSeen.
  const [optimisticallySeen, setOptimisticallySeen] = useState(false);

  const fromProfile = seenFrom(profile?.tutorial_seen_at, profile != null);

  const markSeen = useCallback(() => {
    // Flipped locally first so the gate closes on this frame. Waiting on the
    // network would leave the tutorial on screen after the person has already
    // said they are done with it — and on a bad connection, for a long time.
    setOptimisticallySeen(true);
    if (!session) return;
    void (async () => {
      const { error } = await supabase
        .from('users')
        .update({ tutorial_seen_at: new Date().toISOString() })
        .eq('id', session.user.id);
      // A failed write means it is offered again next launch. That is the
      // right way to fail for this: the alternative is someone never being
      // shown it because one request lost. Skip is on screen from the first
      // frame, so a repeat is a second's annoyance rather than a trap.
      if (!error) await refreshProfile();
    })();
  }, [session, refreshProfile]);

  return {
    seen: optimisticallySeen ? true : fromProfile,
    markSeen,
  };
}
