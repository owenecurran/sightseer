import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Box, BoxShadow, Canvas, FractalNoise, LinearGradient, Path, Rect, Skia } from '@shopify/react-native-skia';

import { OutlinedText } from '@/components/ui/outlined-text';
import { BrandColors } from '@/constants/theme';
import { buildBrandMarkPath, fitBrandMarkPath } from '@/lib/brand-mark';
import { colorForRating } from '@/lib/rating-gradient';
import { buildStampFramePath, STAMP_VIEWBOX_HEIGHT, STAMP_VIEWBOX_WIDTH, STAMP_WINDOW_RECT } from '@/lib/stamp-shape';

type RatingGlassBadgeProps = {
  rating: number;
  // Target width — height follows from the real stamp asset's own portrait
  // aspect ratio (STAMP_VIEWBOX_HEIGHT/WIDTH), not a square like the badge's
  // earlier hand-plotted version.
  size?: number;
};

const DEFAULT_SIZE = 52;

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

// The rating slider's own glass icon (see liquid-glass-track.tsx), reused as
// a small static badge for wherever a rating displays read-only — Feed cards
// and the review-prompt-card's rating circle. Built from the real design
// asset at `assets/brand-source/stamp outline.svg` (a perforated
// postage-stamp frame with a rectangular window cut out — see
// stamp-shape.ts) rather than approximated geometry: the frame is drawn in
// its own cream color, and everything that reads as the "stamp's ink" —
// color fill, grain texture, inner shadow, the brand-mark logo — lives
// inside that window, sized and centered to its exact bounds.
export function RatingGlassBadge({ rating, size = DEFAULT_SIZE }: RatingGlassBadgeProps) {
  const scale = size / STAMP_VIEWBOX_WIDTH;
  const height = STAMP_VIEWBOX_HEIGHT * scale;
  const backgroundColor = colorForRating(rating);
  const iconStrokeWidth = Math.max(1.5, size * 0.045);
  // clamp's own upper bound (not just the multiplier) has to leave enough
  // horizontal room for the widest label ("10.0", 4 glyphs) inside
  // windowRect.width at any size this badge renders at — adjustsFontSizeToFit
  // below is the real backstop, but starting from a sane base avoids relying
  // on it to shrink from something already too big to begin with.
  const fontSize = clamp(size * 0.3, 11, 26);

  const windowRect = useMemo(
    () => ({
      x: STAMP_WINDOW_RECT.x * scale,
      y: STAMP_WINDOW_RECT.y * scale,
      width: STAMP_WINDOW_RECT.width * scale,
      height: STAMP_WINDOW_RECT.height * scale,
    }),
    [scale]
  );

  // Wrapped in try/catch: confirmed live (web only) that react-native-skia's
  // `WithSkiaWeb` gate can swap from its own fallback to this real,
  // dynamically-imported component *before* the shared CanvasKit WASM
  // instance every simultaneously-mounting gate awaits (`LoadSkiaWeb`'s
  // module-level `ckSharedPromise` in the library itself) is actually
  // reflected in `global.CanvasKit` for every one of them — every basic
  // Skia call (`MakeFromSVGString`, even a trivial one) throws "Cannot read
  // properties of undefined" during that window. Only reproduces with
  // several badges mounting at once (Feed/Profile), never on native (Skia
  // is compiled in, synchronously ready, no WASM/gate involved at all) —
  // an upstream library race, not something fixable from here. This catch
  // is what keeps it from taking the *entire screen* down through the
  // nearest error boundary (confirmed that's what happened before this
  // existed) — on web, under that race, the badge just stays on the plain
  // fallback shape below rather than upgrading to the full stamp render.
  const { framePath, iconPath } = useMemo(() => {
    try {
      const frame = buildStampFramePath();
      const frameMatrix = Skia.Matrix();
      frameMatrix.scale(scale, scale);
      frame.transform(frameMatrix);

      // fitBrandMarkPath centers its result at (fitSize/2, fitSize/2) in
      // absolute coordinates, not local-to-itself — fit against the
      // window's *width* (its narrower dimension, since the window is
      // portrait, same as the whole stamp), then translate that square fit
      // box's center onto the window's own (off-center, since the window's
      // taller than wide) center point.
      const icon = fitBrandMarkPath(buildBrandMarkPath(), windowRect.width, 0.82);
      const windowCenterX = windowRect.x + windowRect.width / 2;
      const windowCenterY = windowRect.y + windowRect.height / 2;
      const iconMatrix = Skia.Matrix();
      iconMatrix.translate(windowCenterX - windowRect.width / 2, windowCenterY - windowRect.width / 2);
      icon.transform(iconMatrix);

      return { framePath: frame, iconPath: icon };
    } catch {
      return { framePath: null, iconPath: null };
    }
  }, [scale, windowRect]);

  const innerShadowBlur = Math.max(2, windowRect.width * 0.05);

  if (!framePath || !iconPath) {
    // Same colored-rect-plus-number shape as rating-glass-badge-gated.web.tsx's
    // own pre-CanvasKit fallback, so there's no visible flash of a
    // differently-shaped placeholder between "gate says ready" and "Skia
    // calls actually work" — this is that same brief window, just caught
    // from inside instead of outside.
    return (
      <View style={[styles.placeholder, { width: size, height, backgroundColor, borderRadius: size * 0.08 }]}>
        <OutlinedText
          type="statLine"
          strokeColor={BrandColors.background}
          strokeRadius={2}
          style={[styles.value, { fontSize, width: '100%', textAlign: 'center' }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
        >
          {rating.toFixed(1)}
        </OutlinedText>
      </View>
    );
  }

  return (
    <View style={{ width: size, height }}>
      <Canvas style={StyleSheet.absoluteFill}>
        {/* The frame — the perforated cream border, with its window already
            cut out by the path's own winding (see stamp-shape.ts) — drawn
            first so everything else layers on top of/inside its hole. */}
        <Path path={framePath} color={BrandColors.cream} />

        <Rect x={windowRect.x} y={windowRect.y} width={windowRect.width} height={windowRect.height} color={backgroundColor} />
        {/* DEBUG_GRAIN_DISABLED
        <Rect
          x={windowRect.x}
          y={windowRect.y}
          width={windowRect.width}
          height={windowRect.height}
          opacity={0.42}
          blendMode="overlay"
        >
          <FractalNoise freqX={0.55} freqY={0.55} octaves={3} seed={4} tileWidth={windowRect.width} tileHeight={windowRect.height} />
        </Rect>
        */}
        {/* DEBUG_SHADOW_DISABLED
        <Box box={windowRect}>
          <BoxShadow dx={0} dy={0} blur={innerShadowBlur} color="rgba(0,0,0,0.55)" inner />
        </Box>

        {/* Same silver brushed-metal fill + white stroke as the slider's own
            icon overlay (liquid-glass-track.tsx) — the recognizable "glass"
            look comes from this pairing, not from any per-pixel refraction,
            which is what makes it safe/cheap to repeat once per card
            instead of needing the slider's full shader. */}
        <Path path={iconPath} style="fill" opacity={0.7}>
          <LinearGradient
            start={{ x: windowRect.x, y: windowRect.y }}
            end={{ x: windowRect.x + windowRect.width, y: windowRect.y + windowRect.height }}
            colors={['#e8eaec', '#9aa0a6', '#f2f3f4', '#7d838a', '#e8eaec']}
          />
        </Path>
        <Path path={iconPath} style="stroke" strokeWidth={iconStrokeWidth} strokeJoin="round" strokeCap="round" color="rgba(255,255,255,0.85)" />
      </Canvas>
      {/* Plain RN Text overlay (OutlinedText — the same component
          StretchText's `outline` mode uses), not a Skia text layer — the
          window's own fill color ranges from near-black purple to bright
          teal (see rating-gradient.ts), so a white face with a dark outline
          reads reliably across all of them. condensedHeavy ("Moon Get",
          type="statLine") per direct feedback, replacing the earlier
          roundedStat font. Positioned over the window's own bounds
          specifically (not the whole stamp) so it's centered against the
          colored fill, not the cream frame around it. */}
      <View
        style={[styles.valueWrap, { left: windowRect.x, top: windowRect.y, width: windowRect.width, height: windowRect.height }]}
        pointerEvents="none"
      >
        <OutlinedText
          type="statLine"
          strokeColor={BrandColors.background}
          strokeRadius={2}
          style={[styles.value, { fontSize, width: '100%', textAlign: 'center' }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
        >
          {rating.toFixed(1)}
        </OutlinedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    color: '#fff',
  },
});

// Default export too, specifically so rating-glass-badge-gated.web.tsx can
// dynamic-import this module and pull { default } — WithSkiaWeb's
// getComponent contract expects exactly that shape (see
// liquid-glass-track.tsx's identical default export for the same reason).
export default RatingGlassBadge;
