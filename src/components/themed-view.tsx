import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { type LayoutChangeEvent, View, type ViewProps } from 'react-native';

import { GradientColors, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  type?: ThemeColor | 'screen';
};

// A literal 45° angle (bottom-left → top-right), computed from the screen's
// actual pixel dimensions rather than fixed corner fractions ({x:0,y:1} to
// {x:1,y:0}). Corner-to-corner fractions are only a true 45° line on a
// square box — on a tall phone screen the same fractions stretch into an
// almost-vertical line (confirmed empirically: sampling rendered pixels
// showed a portrait screenshot's bottom-left and bottom-right corners came
// out nearly identical, since the real diagonal barely moved horizontally
// over that aspect ratio), while a wide desktop window stretches them into
// a shallow, mostly-horizontal one — same code, same two colors, visibly
// different gradients. This is the standard CSS `linear-gradient(<angle>)`
// projection formula (as opposed to the `to top right` corner-keyword
// behavior, which is what the old fixed-fraction version accidentally
// matched): project a line through the box's center at a fixed real-world
// angle, long enough that its ends fully cover the box regardless of aspect
// ratio — the endpoints can legitimately fall outside the normalized [0,1]
// range on a non-square box, which is expected (the line simply extends
// past the shorter axis) and is fine for expo-linear-gradient's start/end.
// Closed-form for exactly 45°: the general CSS `linear-gradient(<angle>)`
// projection is `dx = half-length * sin(angle) / width`, and at 45° both
// sin and cos are √0.5, which cancels neatly against the half-length's own
// √0.5 factor down to this — see the derivation this replaced in git
// history if this ever needs to become a genuine variable-angle helper.
function diagonalGradientPoints(width: number, height: number) {
  if (width <= 0 || height <= 0) {
    // Before the first onLayout, fall back to literal corners — only exact
    // for a square, but a reasonable default until real dimensions land.
    return { start: { x: 0, y: 1 }, end: { x: 1, y: 0 } };
  }
  const dx = (width + height) / (4 * width);
  const dy = (width + height) / (4 * height);
  return {
    start: { x: 0.5 - dx, y: 0.5 + dy },
    end: { x: 0.5 + dx, y: 0.5 - dy },
  };
}

// `type="screen"` is the one exception to the flat theme-color lookup below —
// it's the diagonal brand gradient, reserved for each screen's single
// outermost wrapper (not nested cards/boxes, which stay flat via the regular
// `background` theme color) so the gradient doesn't repeat inside every box.
export function ThemedView({ style, lightColor, darkColor, type, ...otherProps }: ThemedViewProps) {
  const theme = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });

  if (type === 'screen') {
    const { start, end } = diagonalGradientPoints(size.width, size.height);
    return (
      <LinearGradient
        colors={[GradientColors.screenStart, GradientColors.screenEnd]}
        start={start}
        end={end}
        style={style}
        onLayout={(e: LayoutChangeEvent) => {
          setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });
          otherProps.onLayout?.(e);
        }}
        {...otherProps}
      />
    );
  }

  return <View style={[{ backgroundColor: theme[type ?? 'background'] }, style]} {...otherProps} />;
}
