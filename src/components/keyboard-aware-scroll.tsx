import Animated from 'react-native-reanimated';
import type { ScrollViewProps } from 'react-native';

// Web has no react-native-keyboard-controller build — plain Animated.ScrollView
// (same as before), since web has no on-screen keyboard to avoid in the
// first place. See keyboard-aware-scroll.native.tsx for the real behavior.
export type KeyboardAwareScrollProps = ScrollViewProps & { bottomOffset?: number };

// bottomOffset is accepted and DROPPED rather than forwarded: there is no
// keyboard to clear on web, and passing an unknown prop through to the DOM is
// how you get a React warning about it.
export function KeyboardAwareScroll({ bottomOffset: _bottomOffset, ...props }: KeyboardAwareScrollProps) {
  return <Animated.ScrollView {...props} />;
}
