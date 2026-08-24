import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrandColors } from '@/constants/theme';
import { buildStickerPaths, pickStickerVariants } from '@/lib/sticker-shapes';

// Tints the inner layer. Brand colours plus tones from the rating gradient,
// so a sticker never looks foreign beside a stamp.
const ACCENTS = ['#a0bd91', '#e0a458', '#c96a5b', '#6b8fb5', '#b58bbd', '#7fae9e'];

export type StickerArrowDirection = 'left' | 'right';

type StickerArrowProps = {
  direction?: StickerArrowDirection;
  size?: number;
  // Anything stable per call site. Variant, accent and jitter all derive
  // from it, so a given arrow looks the same on every render.
  seed?: string;
};

const DEFAULT_SIZE = 34;
// Layer insets, matching ArrowSticker exactly so the static and animated
// stickers are visually identical.
const INNER_SCALE = 0.78;
const ARROW_SCALE = 0.34;
// Stamp-like placement jitter: a hand-applied sticker is never perfectly
// square to what it is stuck on. Small on purpose — this is a tap target.
const JITTER_PX = 2;
const JITTER_DEGREES = 3;

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// The static sticker arrow, for back links and row chevrons.
//
// Composes its layers exactly the way ArrowSticker does — same artwork, same
// scales, same centring offsets, same gloss — and differs only in that the
// trip stepper's version is driven by animation values on press, which no
// other arrow in the app needs. Colours here are seeded per call site rather
// than derived from a neighbouring review's rating, which is the one thing a
// back button has no notion of.
export function StickerArrow({
  direction = 'left',
  size = DEFAULT_SIZE,
  seed = 'default',
}: StickerArrowProps) {
  const { variants, accent, jitter } = useMemo(() => {
    const h = hashSeed(seed);
    const next = mulberry32(h);
    return {
      variants: pickStickerVariants(seed),
      accent: ACCENTS[Math.floor(h / 7) % ACCENTS.length],
      jitter: {
        dx: (next() * 2 - 1) * JITTER_PX,
        dy: (next() * 2 - 1) * JITTER_PX,
        rotate: (next() * 2 - 1) * JITTER_DEGREES,
      },
    };
  }, [seed]);

  const backgroundPaths = useMemo(
    () => buildStickerPaths(variants.background, size),
    [variants.background, size]
  );
  const innerPaths = useMemo(
    () => buildStickerPaths(variants.inner, size * INNER_SCALE),
    [variants.inner, size]
  );
  const arrowPaths = useMemo(
    () => buildStickerPaths(variants.arrow, size * ARROW_SCALE),
    [variants.arrow, size]
  );

  // buildStickerPaths fits each layer into the square it is GIVEN, so a
  // layer scaled to a fraction of the sticker lands at the canvas's
  // top-left. These offsets recentre it. Without them the blob and chevron
  // sit in the corner rather than the middle.
  const innerOffset = (size - size * INNER_SCALE) / 2;
  const arrowOffset = (size - size * ARROW_SCALE) / 2;

  if (!backgroundPaths || !innerPaths || !arrowPaths) {
    // Same footprint as the real thing, so a parse failure (or CanvasKit
    // still loading on web) degrades to a plain disc rather than collapsing
    // the layout around it.
    return (
      <View style={[styles.fallback, { width: size, height: size, backgroundColor: accent }]} />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        transform: [
          { translateX: jitter.dx },
          { translateY: jitter.dy },
          { rotate: `${jitter.rotate}deg` },
        ],
      }}>
      <Canvas style={StyleSheet.absoluteFill}>
        {/* Background carries two paths — body and rim — which is what lets
            the outer sticker read as die-cut rather than flat. */}
        {backgroundPaths.map((path, i) => (
          <Path key={`bg-${i}`} path={path} color={i === 0 ? BrandColors.cream : '#ffffff'} />
        ))}
        <Group transform={[{ translateX: innerOffset }, { translateY: innerOffset }]}>
          {innerPaths.map((path, i) => (
            <Path key={`in-${i}`} path={path} color={accent} />
          ))}
        </Group>
        {/* The artwork points right; a left arrow is the same shape mirrored
            about the sticker's centre, so there is one arrow file per
            variant. Mirrored around the whole sticker (not the scaled-down
            arrow box) so it lands centred either way. */}
        <Group
          transform={direction === 'left' ? [{ scaleX: -1 }] : undefined}
          origin={{ x: size / 2, y: size / 2 }}>
          <Group transform={[{ translateX: arrowOffset }, { translateY: arrowOffset }]}>
            {arrowPaths.map((path, i) => (
              <Path key={`ar-${i}`} path={path} color={BrandColors.background} />
            ))}
          </Group>
        </Group>
      </Canvas>

      {/* Fixed, not rotated with the sticker: a specular highlight comes
          from the light, not the object. */}
      <LinearGradient
        colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0)']}
        locations={[0, 0.45, 0.75]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    borderRadius: 999,
  },
});
