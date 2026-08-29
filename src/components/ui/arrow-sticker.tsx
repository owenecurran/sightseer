import { Image } from 'expo-image';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { BrandColors } from '@/constants/theme';
import type { StickerVariant } from '@/lib/sticker-shapes';
import { buildStickerBodyDataUri, buildStickerGlyphDataUri } from '@/lib/sticker-svg';

// Layer insets, matching StickerArrow so the animated and static stickers
// stay visually identical.
const INNER_SCALE = 0.78;
const ARROW_SCALE = 0.34;

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

// Two images — the disc and the glyph — because they animate separately: the
// sticker turns while the glyph holds its heading and pops instead.
//
// Previously two Skia Canvases, one per animated layer, which is two GL
// surfaces per arrow and forty on a long trip page. It also crashed the web
// build outright: buildStickerPaths calls Skia.Matrix(), which is undefined
// there, so any feed showing a trip threw into the error boundary.
//
// The earlier note here said react-native-svg would be lighter but isn't in
// the dev build — true, and beside the point: expo-image is already a
// dependency and decodes SVG on both platforms, so the die-cut paths can be
// an image without adding a native module. The animation is unaffected
// either way; it was always Reanimated view transforms, never Skia.
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
  // Built once per variant/size/colour rather than per frame — the
  // animation only moves the views these sit inside.
  const bodyUri = useMemo(
    () =>
      buildStickerBodyDataUri({
        size,
        background,
        inner,
        innerScale: INNER_SCALE,
        bodyColor: BrandColors.cream,
        rimColor: '#ffffff',
        innerColor,
      }),
    [size, background, inner, innerColor]
  );
  const glyphUri = useMemo(
    () => buildStickerGlyphDataUri({ size, arrow, arrowScale: ARROW_SCALE, arrowColor }),
    [size, arrow, arrowColor]
  );

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

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, stickerStyle]} pointerEvents="none">
        {/* Body and rim are separate paths inside this image, which is what
            lets the outer sticker read as die-cut rather than flat. */}
        <Image
          source={{ uri: bodyUri }}
          style={StyleSheet.absoluteFill}
          contentFit="fill"
          cachePolicy="memory"
          transition={0}
        />
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
        <Image
          source={{ uri: glyphUri }}
          style={StyleSheet.absoluteFill}
          contentFit="fill"
          cachePolicy="memory"
          transition={0}
        />
      </Animated.View>
    </View>
  );
}
