import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrandColors } from '@/constants/theme';
import { STICKER_SETS, type StickerLayer } from '@/lib/sticker-shape';

// Accent palette the inner blob is tinted from. Brand colours plus the
// rating gradient's own ends, so a sticker never looks foreign next to a
// stamp or a harmony meter.
const ACCENTS = ['#a0bd91', '#e0a458', '#c96a5b', '#6b8fb5', '#b58bbd', '#7fae9e'];

export type StickerArrowDirection = 'left' | 'right';

type StickerArrowProps = {
  direction?: StickerArrowDirection;
  size?: number;
  // Anything stable per call site. The set and accent are picked from this,
  // so a given screen's arrow looks the same every time it renders rather
  // than reshuffling — the same reasoning FeedRatingStamp's seeding uses.
  seed?: string;
};

const DEFAULT_SIZE = 34;
// Stamp-like placement jitter. Same idea as FeedRatingStamp: a sticker
// applied by hand is never perfectly square to the thing it is stuck on, and
// a tiny deterministic offset reads as "placed" rather than "rendered".
// Deliberately small -- this is a navigation control, so it has to still
// look deliberate and stay comfortably tappable.
const JITTER_PX = 2;
const JITTER_DEGREES = 3;

// mulberry32 -- the same small PRNG the rating stamps use, so seeded
// placement behaves identically across the app.
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

// Fits a layer's own viewBox into a square box, centred, preserving its
// aspect ratio. The three layers were drawn on different canvases, so each
// needs its own transform rather than one shared scale.
function layerTransform(layer: StickerLayer, box: number, inset: number) {
  const available = box * inset;
  const scale = Math.min(available / layer.viewBoxWidth, available / layer.viewBoxHeight);
  return {
    scale,
    dx: (box - layer.viewBoxWidth * scale) / 2,
    dy: (box - layer.viewBoxHeight * scale) / 2,
  };
}

// A navigation arrow drawn as one of the brand's die-cut stickers: body,
// rim, a tinted blob, and the chevron on top.
//
// All four layers share ONE Canvas rather than one each. A Canvas holds a GL
// surface, and these appear on every screen with a back link plus every row
// with a chevron — four contexts per arrow would be wasteful for what is
// ultimately four filled paths.
export function StickerArrow({
  direction = 'left',
  size = DEFAULT_SIZE,
  seed = 'default',
}: StickerArrowProps) {
  const { set, accent, jitter } = useMemo(() => {
    const h = hashSeed(seed);
    const next = mulberry32(h);
    return {
      set: STICKER_SETS[h % STICKER_SETS.length],
      // A second, decorrelated draw so the set and the colour don't move
      // together across call sites.
      accent: ACCENTS[Math.floor(h / 7) % ACCENTS.length],
      // Applied to the wrapper View rather than inside the Canvas: Skia
      // clips to the canvas bounds, so rotating in there would shave the
      // artwork's corners. Transforming the view moves already-drawn pixels
      // and lets them hang past the box instead.
      jitter: {
        dx: (next() * 2 - 1) * JITTER_PX,
        dy: (next() * 2 - 1) * JITTER_PX,
        rotate: (next() * 2 - 1) * JITTER_DEGREES,
      },
    };
  }, [seed]);

  const paths = useMemo(() => {
    const build = (layer: StickerLayer, inset: number) => {
      const path = Skia.Path.MakeFromSVGString(layer.d);
      if (!path) return null;
      const t = layerTransform(layer, size, inset);
      const m = Skia.Matrix();
      m.translate(t.dx, t.dy);
      m.scale(t.scale, t.scale);
      path.transform(m);
      return path;
    };
    return {
      // Insets stack the layers inward so each reads as sitting on the one
      // beneath it rather than covering it edge to edge.
      bgBody: build(set.bgBody, 1),
      bgRim: build(set.bgRim, 1),
      inner: build(set.inner, 0.74),
      arrow: build(set.arrow, 0.3),
    };
  }, [set, size]);

  if (!paths.bgBody || !paths.arrow) {
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
        <Path path={paths.bgBody} color={BrandColors.cream} />
        {paths.bgRim && <Path path={paths.bgRim} color="rgba(255,255,255,0.55)" />}
        {paths.inner && <Path path={paths.inner} color={accent} />}
        {/* The artwork points right, so a left arrow is the same shape
            mirrored about the centre rather than a second asset. */}
        <Group
          transform={direction === 'left' ? [{ scaleX: -1 }] : undefined}
          origin={{ x: size / 2, y: size / 2 }}>
          <Path path={paths.arrow} color={BrandColors.background} />
        </Group>
      </Canvas>
    </View>
  );
}
