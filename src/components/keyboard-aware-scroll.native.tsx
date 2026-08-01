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
export function KeyboardAwareScroll(props: ScrollViewProps) {
  return <KeyboardAwareScrollView bottomOffset={24} {...props} />;
}
