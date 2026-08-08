import { useMemo } from 'react';
import { View } from 'react-native';
import {
  BlurStyle,
  Canvas,
  Fill,
  Group,
  ImageShader,
  LinearGradient,
  Path,
  PaintStyle,
  Shader,
  Skia,
  StrokeCap,
  StrokeJoin,
  type SkImage,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { buildBrandMarkPath, fitBrandMarkPath } from '@/lib/brand-mark';

const HM_SIZE = 256;

function makeHeightmap(): SkImage | null {
  // Skia.Surface.Make (not MakeOffscreen) — on web, MakeOffscreen creates its
  // own OffscreenCanvas with its own separate WebGL context/GrContext, and a
  // GPU texture created there can't be used as a shader child in a *different*
  // WebGL context (the visible <Canvas>'s). That silently produced a fully
  // transparent shader (confirmed by bisecting: even an unused `uniform
  // shader` child broke rendering) with zero JS-visible errors. Make() uses a
  // raster (CPU-backed) surface instead, so the resulting SkImage is plain
  // pixel data — safe to use as a texture source in any context.
  const surface = Skia.Surface.Make(HM_SIZE, HM_SIZE);
  if (!surface) return null;

  const canvas = surface.getCanvas();
  const path = fitBrandMarkPath(buildBrandMarkPath(), HM_SIZE);

  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(16);
  paint.setStrokeJoin(StrokeJoin.Round);
  paint.setStrokeCap(StrokeCap.Round);
  paint.setColor(Skia.Color('white'));
  paint.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 9, true));

  canvas.drawPath(path, paint);
  surface.flush();
  return surface.makeImageSnapshot();
}

// Piecewise-linear through an arbitrary number of stops (up to MAX_STOPS),
// passed as flat uniform arrays — this app's actual review gradient (8
// irregular stops), not the fixed 3-stop red/amber/green the original
// version hardcoded.
const MAX_STOPS = 8;
const SKSL = `
uniform shader heightmap;
uniform float2 resolution;
uniform float  thumbX;
uniform float  thumbSize;
uniform float  trackHeight;
uniform float  hmSize;
uniform float  refraction;
uniform float  dispersion;
uniform float3 colors[${MAX_STOPS}];
uniform float  stops[${MAX_STOPS}];

// SkSL requires array indices to be compile-time constants — colors[count - 1]
// (count a runtime uniform) failed to compile with exactly that error. Since
// the JS side always pads stops/colors to exactly MAX_STOPS entries (padding
// stops repeat 1.0, padding colors repeat the last real color), every
// padded tail segment is degenerate (zero-width or same-color) and harmless
// to evaluate unconditionally — no need for the count-based early-exit or a
// dynamically-indexed fallback at all, just a plain loop over all
// MAX_STOPS-1 segments and a fixed final index.
float3 track(float t) {
  t = clamp(t, 0.0, 1.0);
  for (int i = 0; i < ${MAX_STOPS - 1}; i++) {
    if (t >= stops[i] && t <= stops[i + 1]) {
      float localT = (t - stops[i]) / max(stops[i + 1] - stops[i], 0.0001);
      return mix(colors[i], colors[i + 1], localT);
    }
  }
  return colors[${MAX_STOPS - 1}];
}

float heightAt(float2 p) {
  return heightmap.eval(p).a;
}

half4 main(float2 xy) {
  // The canvas is taller than the visible track (see CANVAS_HEIGHT in
  // rating-slider.tsx) so the icon overlay — drawn separately, after this
  // Fill — can poke out above/below it. The gradient itself has to stay
  // pill-shaped at trackHeight regardless of the taller canvas: standard
  // rounded-rect/stadium SDF (clamp x to the straight-side core range, then
  // measure Euclidean distance to that clamped point) — outside the
  // radius, this Fill contributes nothing and the (transparent) canvas
  // background shows through instead.
  float radius = trackHeight * 0.5;
  float midY = resolution.y * 0.5;
  float2 pillCenter = float2(clamp(xy.x, radius, resolution.x - radius), midY);
  if (length(xy - pillCenter) > radius) {
    return half4(0.0, 0.0, 0.0, 0.0);
  }

  float2 origin = float2(thumbX - thumbSize * 0.5, (resolution.y - thumbSize) * 0.5);
  float2 local = (xy - origin) / thumbSize * hmSize;

  float h = heightAt(local);
  float t0 = xy.x / resolution.x;

  if (h < 0.004) {
    return half4(half3(track(t0)), 1.0);
  }

  float2 e = float2(2.0, 0.0);
  float dx = heightAt(local + e.xy) - heightAt(local - e.xy);
  float dy = heightAt(local + e.yx) - heightAt(local - e.yx);

  float shift = dx * refraction;
  float r = track((xy.x - shift * (1.0 + dispersion)) / resolution.x).r;
  float g = track((xy.x - shift) / resolution.x).g;
  float b = track((xy.x - shift * (1.0 - dispersion)) / resolution.x).b;
  float3 col = float3(r, g, b);

  col = mix(col, col * 1.06 + 0.05, h * 0.55);

  float3 n = normalize(float3(-dx * 4.0, -dy * 4.0, 1.0));
  float3 lightDir = normalize(float3(-0.45, -0.65, 0.8));
  float spec = pow(clamp(dot(n, lightDir), 0.0, 1.0), 28.0) * h;
  col += spec * 0.9;

  return half4(half3(clamp(col, 0.0, 1.0)), 1.0);
}
`;

function hexToFloat3(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

type LiquidGlassTrackProps = {
  width: number;
  // Overall canvas height — taller than trackHeight so the icon overlay can
  // extend past the gradient's own pill shape (see the SkSL mask above).
  height: number;
  // The gradient bar's own visual height (what used to be `height` before
  // the icon needed to be bigger than it) — drives both the pill mask and
  // the glass-bulge/heightmap footprint, which stays track-sized regardless
  // of how big the icon on top of it is drawn.
  trackHeight: number;
  thumbSize: number;
  // Size the logo silhouette overlay is actually drawn at — independent of
  // thumbSize (the glass bulge's own footprint) so the icon can be drawn
  // larger than the bulge/track without changing the refraction physics.
  iconSize: number;
  progress: SharedValue<number>;
  usableWidth: number;
  // Same near-extremes wobble RatingSlider already had on the plain thumb —
  // folded in here now since the thumb's position is driven entirely inside
  // this canvas (via the shader's thumbX uniform), not a separate Animated.View
  // transform anymore.
  shakePhase: SharedValue<number>;
  shakeIntensity: SharedValue<number>;
  maxShakePx: number;
  gradientStops: number[];
  gradientColors: string[];
  refraction?: number;
  dispersion?: number;
};

export function LiquidGlassTrack({
  width,
  height,
  trackHeight,
  thumbSize,
  iconSize,
  progress,
  usableWidth,
  shakePhase,
  shakeIntensity,
  maxShakePx,
  gradientStops,
  gradientColors,
  refraction = 26,
  dispersion = 0.35,
}: LiquidGlassTrackProps) {
  const effect = useMemo(() => Skia.RuntimeEffect.Make(SKSL), []);
  const heightmap = useMemo(makeHeightmap, []);

  const overlayPath = useMemo(() => fitBrandMarkPath(buildBrandMarkPath(), iconSize), [iconSize]);
  const iconStrokeWidth = Math.max(2, iconSize * 0.045);

  const flatColors = useMemo(() => {
    const padded = [...gradientColors];
    while (padded.length < MAX_STOPS) padded.push(padded[padded.length - 1]);
    return padded.slice(0, MAX_STOPS).flatMap(hexToFloat3);
  }, [gradientColors]);

  const flatStops = useMemo(() => {
    const padded = [...gradientStops];
    while (padded.length < MAX_STOPS) padded.push(1);
    return padded.slice(0, MAX_STOPS);
  }, [gradientStops]);

  const thumbCenterX = useDerivedValue(
    () => progress.value * usableWidth + thumbSize / 2 + shakePhase.value * shakeIntensity.value * maxShakePx
  );

  const uniforms = useDerivedValue(() => ({
    resolution: [width, height],
    thumbX: thumbCenterX.value,
    thumbSize,
    trackHeight,
    hmSize: HM_SIZE,
    refraction,
    dispersion,
    colors: flatColors,
    stops: flatStops,
  }));

  const overlayTransform = useDerivedValue(() => [
    { translateX: thumbCenterX.value - iconSize / 2 },
    { translateY: (height - iconSize) / 2 },
  ]);

  if (!effect || !heightmap) return <View style={{ width, height }} />;

  return (
    <Canvas style={{ width, height }}>
      <Fill>
        <Shader source={effect} uniforms={uniforms}>
          <ImageShader
            image={heightmap}
            fit="fill"
            rect={{ x: 0, y: 0, width: HM_SIZE, height: HM_SIZE }}
            tx="decal"
            ty="decal"
          />
        </Shader>
      </Fill>
      <Group transform={overlayTransform}>
        {/* Silver fill on the inside of the icon shape (a brushed-metal
            gradient, a few light/dark passes rather than one flat tone) with
            a plain solid-white border on top — the fill is what should read
            as "fractured"/metallic, not the outline. */}
        <Path path={overlayPath} style="fill" opacity={0.5}>
          <LinearGradient
            start={{ x: 0, y: 0 }}
            end={{ x: iconSize, y: iconSize }}
            colors={['#e8eaec', '#9aa0a6', '#f2f3f4', '#7d838a', '#e8eaec']}
          />
        </Path>
        <Path
          path={overlayPath}
          style="stroke"
          strokeWidth={iconStrokeWidth}
          strokeJoin="round"
          strokeCap="round"
          color="rgba(255,255,255,0.85)"
        />
      </Group>
    </Canvas>
  );
}

// Default export too, specifically so google-sign-in-button.tsx-style .web
// gating (see liquid-glass-track-gated.web.tsx) can dynamic-import this
// module and pull { default } — WithSkiaWeb's getComponent contract expects
// exactly that shape.
export default LiquidGlassTrack;
