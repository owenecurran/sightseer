import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import type { ScrollViewProps } from 'react-native';

// Native-only (no web build for react-native-keyboard-controller — kept out
// of any route/layout file per this session's established pager-view
// finding: Expo Router's route-file discovery pulls in both platform
// variants of a route file rather than letting Metro's normal per-import
// resolution pick one, but a plain component file like this resolves
// correctly). Replaces Animated.ScrollView in forms with mid-page inputs
// (review.tsx, edit-profile.tsx) so a focused field scrolls into view above
// the keyboard automatically instead of needing per-field measure/scrollTo
// wiring.
//
// Deliberately NOT setting keyboardDismissMode="interactive" here (tried,
// reverted) — it's a plain native ScrollView prop that this library's own
// source never references, meaning it just passes straight through to RN's
// native ScrollView and drives RN's own native keyboard-follow behavior in
// parallel with this library's independent keyboard-height tracking. Likely
// root cause of a jitter bug reported after adding it (content/search
// results repositioning rapidly while the keyboard was up, sometimes
// settling mid-screen once it closed) — plausible from reading both
// implementations, not something reverting has been re-tested to confirm
// yet. If interactive swipe-to-dismiss is wanted again, it needs a mechanism
// this library actually supports, not raw ScrollViewProps passthrough.
// bottomOffset is how much room is kept clear BELOW the focused field. The
// default of 24 clears the field itself and nothing else, which is right for
// a long form where the next field is the next thing wanted. It is wrong for
// a short form whose submit button sits directly under its only input — 24
// leaves the button under the keyboard on a short screen, so the thing you
// are meant to press next is the one thing hidden. Those screens pass their
// own, measured to include the button.
export type KeyboardAwareScrollProps = ScrollViewProps & { bottomOffset?: number };

export function KeyboardAwareScroll({ bottomOffset = 24, ...props }: KeyboardAwareScrollProps) {
  return <KeyboardAwareScrollView bottomOffset={bottomOffset} {...props} />;
}
