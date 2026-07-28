import { useState } from 'react';
import { type LayoutChangeEvent, Platform, StyleSheet, View, type ViewStyle } from 'react-native';

import { OutlinedText } from '@/components/ui/outlined-text';
import { ThemedText, type ThemedTextProps } from '@/components/themed-text';

type StretchTextProps = ThemedTextProps & {
  children: string;
  outline?: boolean;
};

// Measures the text's true single-line intrinsic width, then scales it
// horizontally to exactly fill its container.
//
// Renders the text itself (not arbitrary children) specifically so
// `numberOfLines={1}` can be forced directly on it — that turned out to be
// the only reliable way to guarantee single-line rendering. Earlier
// attempts tried to prevent wrapping indirectly via the wrapping View's
// `alignSelf: 'flex-start'` + `flexShrink: 0`, which worked in some
// ancestor contexts (a flex:1 row cell, a plain padded box) but not others
// (nested inside a percentage-width column with justifyContent set) —
// worth remembering if this component is ever generalized past text.
// One known-unresolved case: inside that same narrow, percentage-width
// nested context, the visible copy can still fall back to `numberOfLines`
// ellipsis-truncation instead of the intended compress-to-fit when content
// is much wider than its container (e.g. a long place name over a narrow
// photo column) — a reasonable, non-broken-looking fallback, just not the
// ideal stretched/compressed treatment achieved everywhere else.
//
// The measuring copy needs `position: fixed` on web, not merely
// `absolute` — per CSS's shrink-to-fit sizing rule, an absolutely
// positioned box with no left/right set is still capped at its containing
// *block's* available width, so inside a narrow parent it silently
// under-measures instead of reporting the true natural width. `fixed`
// escapes to the viewport as its containing block, sidestepping any local
// ancestor's width entirely. `fixed` isn't a valid RN `position` value, so
// this is web-only (cast below); native's Yoga layout measures absolutely
// positioned text by intrinsic content size regardless, without this same
// containing-block cap.
// Stretching/compressing is a deliberate editorial touch for text that's
// already close to its container's width — it looks wrong (visibly
// distorted) applied to a short word blown up several times over, or a long
// one crushed down thin. Outside this range, the box grows taller instead:
// text renders at its natural size and is allowed to wrap, rather than
// forcing a single distorted line.
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.3;

export function StretchText({ children, outline, style, ...rest }: StretchTextProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const rawScale = containerWidth > 0 && contentWidth > 0 ? containerWidth / contentWidth : 1;
  const withinRange = rawScale >= MIN_SCALE && rawScale <= MAX_SCALE;
  const scaleX = withinRange ? rawScale : 1;
  const Text = outline ? OutlinedText : ThemedText;

  return (
    <View onLayout={(e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width)} style={styles.container}>
      <View style={styles.measure} pointerEvents="none">
        <Text
          {...rest}
          numberOfLines={1}
          onLayout={(e: LayoutChangeEvent) => setContentWidth(e.nativeEvent.layout.width)}
          style={styles.nowrap}>
          {children}
        </Text>
      </View>
      <Text
        {...rest}
        numberOfLines={withinRange ? 1 : undefined}
        style={[
          withinRange ? styles.nowrap : styles.wrap,
          { transform: [{ scaleX }], transformOrigin: 'left' },
          style,
        ]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  measure: {
    position: Platform.OS === 'web' ? ('fixed' as ViewStyle['position']) : 'absolute',
    opacity: 0,
  },
  nowrap: {
    alignSelf: 'flex-start',
    flexShrink: 0,
    minWidth: 0,
  },
  wrap: {
    alignSelf: 'stretch',
  },
});
