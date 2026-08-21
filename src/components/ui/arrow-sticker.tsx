import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { BrandColors } from '@/constants/theme';
import { buildStickerPaths, type StickerVariant } from '@/lib/sticker-shapes';

type ArrowStickerProps = {
  size: number;
  background: StickerVariant;
  inner: StickerVariant;
  arrow: StickerVariant;
  // The layer whose colour tracks the review this arrow leads to.
  innerColor: string;
  arrowColor: string;
  flip: boolean;
  spin: SharedValue<number>;
  pop: SharedValue<number>;
  wobble: SharedValue<number>;
  fade: SharedValue<number>;
};

// One Canvas for the whole sticker rather than one per layer. Each Canvas
// holds a GL surface, and a long trip page can show ~20 arrows at once —
// three canvases apiece would be sixty. The layers are just Paths inside a
// single surface, which costs nothing extra.
//
// Skia is used here (not plain Views) only because these are custom die-cut
// paths: a View can do a circle, not this. react-native-svg would be lighter
// still, but it's a native module and isn't in the dev build.
export function ArrowSticker({
  size,
  background,
  inner,
  arrow,
  innerColor,
  arrowColor,
  flip,
  spin,
  pop,
  wobble,
  fade,
}: ArrowStickerProps) {
  // Parsing is the expensive part, so it happens once per variant/size
  // rather than per frame.
  const backgroundPaths = useMemo(() => buildStickerPaths(background, size), [background, size]);
  const innerPaths = useMemo(() => buildStickerPaths(inner, size * 0.78), [inner, size]);
  const arrowPaths = useMemo(() => buildStickerPaths(arrow, size * 0.34), [arrow, size]);

  // The sticker turns; the glyph holds its heading and pops instead — a
  // rotating chevron points the wrong way mid-spin.
  const stickerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));
  const glyphStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [
      { scale: pop.value },
      { rotate: `${wobble.value}deg` },
      // The artwork points right; the back arrow is the same shape mirrored,
      // so there's only ever one arrow file per variant.
      { scaleX: flip ? -1 : 1 },
    ],
  }));

  const innerOffset = (size - size * 0.78) / 2;
  const arrowOffset = (size - size * 0.34) / 2;

  if (!backgroundPaths || !innerPaths || !arrowPaths) {
    // Same footprint as the real thing, so a parse failure degrades to a
    // plain coloured disc instead of collapsing the layout.
    return <View style={[styles.fallback, { width: size, height: size, backgroundColor: innerColor }]} />;
  }

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, stickerStyle]} pointerEvents="none">
        <Canvas style={StyleSheet.absoluteFill}>
          {/* Background carries two paths — body and rim — which is what
              lets the outer sticker read as die-cut rather than flat. */}
          {backgroundPaths.map((path, i) => (
            <Path key={`bg-${i}`} path={path} color={i === 0 ? BrandColors.cream : '#ffffff'} />
          ))}
          <Group transform={[{ translateX: innerOffset }, { translateY: innerOffset }]}>
            {innerPaths.map((path, i) => (
              <Path key={`in-${i}`} path={path} color={innerColor} />
            ))}
          </Group>
        </Canvas>
      </Animated.View>

      {/* Fixed, not spinning: a specular highlight comes from the light, not
          the object. Rotating it would read as a painted-on swirl. */}
      <LinearGradient
        colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0)']}
        locations={[0, 0.45, 0.75]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
        pointerEvents="none"
      />

      <Animated.View style={[StyleSheet.absoluteFill, glyphStyle]} pointerEvents="none">
        <Canvas style={StyleSheet.absoluteFill}>
          <Group transform={[{ translateX: arrowOffset }, { translateY: arrowOffset }]}>
            {arrowPaths.map((path, i) => (
              <Path key={`ar-${i}`} path={path} color={arrowColor} />
            ))}
          </Group>
        </Canvas>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    borderRadius: 999,
  },
});
