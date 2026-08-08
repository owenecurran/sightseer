import {
  Canvas,
  FractalNoise,
  Group,
  LinearGradient,
  Path,
  Rect,
} from "@shopify/react-native-skia";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { buildBrandMarkPath, fitBrandMarkPath } from "@/lib/brand-mark";
import { colorForRating } from "@/lib/rating-gradient";
import { buildStampPath } from "@/lib/stamp-shape";

type RatingGlassBadgeProps = {
  rating: number;
  size?: number;
};

const DEFAULT_SIZE = 40;

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

// The rating slider's own glass icon (see liquid-glass-track.tsx), reused as
// a small static badge for wherever a rating displays read-only — Feed cards
// and the review-prompt-card's rating circle, replacing plain "X.X ★" text
// and a flat cream circle respectively. Unlike the slider, this never
// refracts anything (no SkSL shader, no heightmap) — it's the same brand-mark
// silhouette (silver fill + white stroke, identical treatment) sitting on a
// postage-stamp shape (buildStampPath — a perforated-edge square, see that
// file) instead of a live gradient track, since there's no drag position
// here to refract *around*. The stamp's fill color is colorForRating(rating)
// — the plain-JS equivalent of the slider's per-pixel gradient sample,
// evaluated once for this one static value — with a subtle fractal-noise
// grain over it so the fill reads as inked/stamped rather than a flat vector
// color. Everything (fill, grain, logo) is clipped to the stamp's own
// perforated silhouette so none of it bleeds past the notched edge.
export function RatingGlassBadge({
  rating,
  size = DEFAULT_SIZE,
}: RatingGlassBadgeProps) {
  const stampPath = useMemo(() => buildStampPath(size), [size]);
  const iconPath = useMemo(
    () => fitBrandMarkPath(buildBrandMarkPath(), size, 0.58),
    [size],
  );
  const backgroundColor = colorForRating(rating);
  const strokeWidth = Math.max(1.5, size * 0.045);
  const stampStrokeWidth = Math.max(1.5, size * 0.05);
  const fontSize = clamp(size * 0.32, 11, 20);

  return (
    <View style={{ width: size, height: size }}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Group clip={stampPath}>
          <Rect
            x={0}
            y={0}
            width={size}
            height={size}
            color={backgroundColor}
          />
          {/* Grain — a fractal-noise shader multiplied over the flat fill at
              low opacity, so the color reads as unevenly inked rather than a
              clean vector fill. Purely decorative texture, not a real random
              seed per render (fixed seed keeps it stable/non-flickering
              across re-renders of the same badge). */}
          <Rect
            x={0}
            y={0}
            width={size}
            height={size}
            opacity={0.22}
            blendMode="overlay"
          >
            <FractalNoise
              freqX={0.9}
              freqY={0.9}
              octaves={2}
              seed={4}
              tileWidth={size}
              tileHeight={size}
            />
          </Rect>
          <Group>
            {/* Same silver brushed-metal fill + white stroke as the slider's
                own icon overlay (liquid-glass-track.tsx) — the recognizable
                "glass" look comes from this pairing, not from any per-pixel
                refraction, which is what makes it safe/cheap to repeat once
                per card instead of needing the slider's full shader. */}
            <Path path={iconPath} style="fill" opacity={0.55}>
              <LinearGradient
                start={{ x: 0, y: 0 }}
                end={{ x: size, y: size }}
                colors={["#e8eaec", "#9aa0a6", "#f2f3f4", "#7d838a", "#e8eaec"]}
              />
            </Path>
            <Path
              path={iconPath}
              style="stroke"
              strokeWidth={strokeWidth}
              strokeJoin="round"
              strokeCap="round"
              color="rgba(255,255,255,0.85)"
            />
          </Group>
        </Group>
        {/* Stroked separately, outside the clip group above — a stroke is
            centered on the path line (half in, half out), so clipping it to
            the same stamp path would cut away the outward half instead of
            framing the perforated edge cleanly. */}
        <Path
          path={stampPath}
          style="stroke"
          strokeWidth={stampStrokeWidth}
          strokeJoin="round"
          color="rgba(255,255,255,0.9)"
        />
      </Canvas>
      {/* Plain RN Text overlay, not a Skia text layer — the badge's own
          background color ranges from near-black purple to bright teal (see
          rating-gradient.ts), so white text with a soft dark shadow reads
          reliably across all of them rather than needing per-color contrast
          logic. Deliberately outside the grain/clip group above — the
          number itself stays clean and legible, only the stamp surface
          around it is textured. */}
      <View style={styles.valueWrap} pointerEvents="none">
        <ThemedText type="roundedStat" style={[styles.value, { fontSize }]}>
          {rating.toFixed(1)}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  valueWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});

// Default export too, specifically so rating-glass-badge-gated.web.tsx can
// dynamic-import this module and pull { default } — WithSkiaWeb's
// getComponent contract expects exactly that shape (see
// liquid-glass-track.tsx's identical default export for the same reason).
export default RatingGlassBadge;
