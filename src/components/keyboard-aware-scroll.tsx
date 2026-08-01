import Animated from 'react-native-reanimated';
import type { ScrollViewProps } from 'react-native';

// Web has no react-native-keyboard-controller build — plain Animated.ScrollView
// (same as before), since web has no on-screen keyboard to avoid in the
// first place. See keyboard-aware-scroll.native.tsx for the real behavior.
export function KeyboardAwareScroll(props: ScrollViewProps) {
  return <Animated.ScrollView {...props} />;
}
