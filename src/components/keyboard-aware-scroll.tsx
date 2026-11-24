import Animated from 'react-native-reanimated';
import type { ReactElement, Ref } from 'react';
import type { ScrollView, ScrollViewProps } from 'react-native';

// Web has no react-native-keyboard-controller build — plain Animated.ScrollView
// (same as before), since web has no on-screen keyboard to avoid in the
// first place. See keyboard-aware-scroll.native.tsx for the real behavior.
export type KeyboardAwareScrollProps = ScrollViewProps & {
  bottomOffset?: number;
  ref?: Ref<ScrollView>;
};

// bottomOffset is accepted and DROPPED rather than forwarded: there is no
// keyboard to clear on web, and passing an unknown prop through to the DOM is
// how you get a React warning about it.
export function KeyboardAwareScroll({ bottomOffset: _bottomOffset, ref, ...props }: KeyboardAwareScrollProps) {
  return <Animated.ScrollView ref={ref as never} {...props} />;
}

// No keyboard to clear, so no custom scroll view: undefined leaves a
// FlatList on its own default.
export function keyboardAwareScrollRenderer(
  _bottomOffset?: number,
): ((props: ScrollViewProps) => ReactElement<ScrollViewProps>) | undefined {
  return undefined;
}
