import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrandColors } from '@/constants/theme';
import { buildStickerPaths, pickStickerVariants } from '@/lib/sticker-shapes';

// Accent palette the inner layer is tinted from. Brand colours plus tones
// from the rating gradient, so a sticker never looks foreign next to a stamp.
const ACCENTS = ['#a0bd91', '#e0a458', '#c96a5b', '#6b8fb5', '#b58bbd', '#7fae9e'];

export type StickerArrowDirection = 'left' | 'right';

type StickerArrowProps = {
  direction?: StickerArrowDirection;
  size?: number;
  // Anything stable per call site. Variant, accent and jitter all derive
  // from it, so a given arrow looks the same on every render rather than
  // reshuffling.
  seed?: string;
};

const DEFAULT_SIZE = 34;
// Stamp-like placement jitter: a sticker applied by hand is never perfectly
// square to what it is stuck on. Deliberately small — this is a tap target,
// so it has to stay looking deliberate and stay comfortably hittable.
const JITTER_PX = 2;
const JITTER_DEGREES = 3;
// Matches ArrowSticker's own layer insets, so the static and animated
// renderers produce visually identical stickers.
const INNER_INSET = 0.78;
const ARROW_INSET = 0.34;

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

// A static navigation arrow drawn as one of the brand's die-cut stickers.
//
// Shares its artwork and variant-picking with ArrowSticker (sticker-shapes.ts)
// rather than carrying its own copy — the two differ only in that the trip
// stepper's version is driven by animation values on press, which every other
// arrow in the app has no use for. Keeping one data module means adding a new
// sticker variant shows up everywhere at once.
//
// All layers share ONE Canvas: a Canvas holds a GL surface, and these appear
// on nearly every screen.
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
      // Applied to the wrapper View, not inside the Canvas: Skia clips to
      // its canvas bounds, so rotating in there would shave the artwork's
      // corners. Transforming the view lets it hang past the box instead.
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
    () => buildStickerPaths(variants.inner, size * INNER_INSET),
    [variants.inner, size]
  );
  const arrowPaths = useMemo(
    () => buildStickerPaths(variants.arrow, size * ARROW_INSET),
    [variants.arrow, size]
  );

  if (!backgroundPaths || !arrowPaths) {
    // Skia not ready (web loads CanvasKit asynchronously) — hold the space
    // so nothing jumps when it arrives.
    return <View style={{ width: size, height: size }} />;
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
        {/* A background variant carries a body and a rim as separate paths,
            which is what lets the two take different colours. */}
        {backgroundPaths.map((path, i) => (
          <Path
            key={`bg-${i}`}
            path={path}
            color={i === 0 ? BrandColors.cream : 'rgba(255,255,255,0.55)'}
          />
        ))}
        {innerPaths?.map((path, i) => <Path key={`in-${i}`} path={path} color={accent} />)}
        {/* The artwork points right, so a left arrow is the same shape
            mirrored about the centre rather than a second asset. */}
        <Group
          transform={direction === 'left' ? [{ scaleX: -1 }] : undefined}
          origin={{ x: size / 2, y: size / 2 }}>
          {arrowPaths.map((path, i) => (
            <Path key={`ar-${i}`} path={path} color={BrandColors.background} />
          ))}
        </Group>
      </Canvas>
    </View>
  );
}
