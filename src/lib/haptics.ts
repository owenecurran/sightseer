import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// The taps the app answers with a small physical knock.
//
// Two rules hold everywhere this is used. Web has no haptics API at all, so
// every one of these is a no-op there rather than a crash. And none of them
// is awaited: a haptic is a side effect of an interaction that has already
// happened, and making the interaction wait on the motor would be the wrong
// way round. A rejected promise — a device with the motor disabled, a
// simulator — is swallowed for the same reason.

function fire(run: () => Promise<void>) {
  if (Platform.OS === 'web') return;
  void run().catch(() => {});
}

// Liking something. Light rather than medium: it is a small, repeatable,
// reversible action, and a heavy knock for a double tap on a photograph
// reads as though something went wrong.
export function hapticLike() {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

// Unliking. Deliberately the same weight as liking rather than something
// softer — the two are one toggle, and giving them different feels would
// suggest they are different kinds of action.
export function hapticUnlike() {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

// A postcard turning over. Medium, because unlike a like this is a gesture
// with travel behind it: the knock lands at the moment the card commits and
// confirms that the drag was enough, which is exactly the thing that was
// hard to tell on a card that had not yet started moving.
export function hapticFlip() {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}
