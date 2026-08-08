import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
// Deep import: this package has no root-level web re-export and no package.json
// "exports" map restricting subpaths, so Metro resolves this against the
// package's real ESM output location — same reasoning as
// liquid-glass-track-gated.web.tsx, which this file otherwise mirrors exactly.
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

import { ThemedText } from '@/components/themed-text';
import type { RatingGlassBadge } from '@/components/ui/rating-glass-badge';
import { colorForRating } from '@/lib/rating-gradient';

type Props = ComponentProps<typeof RatingGlassBadge>;

// Plain colored-square-plus-number fallback while CanvasKit's WASM loads —
// unlike the slider's own gated fallback (an empty box; that's fine there
// since it's only visible for a moment before the first interaction), this
// one renders on every Feed card on first paint, so an empty box would read
// as a real, if brief, layout glitch. A slightly-rounded square (not the
// real stamp's perforated edge — that needs Skia's path boolean ops, not
// worth reproducing in plain Views for a moment-long fallback) reads closer
// to the real badge's silhouette than a circle would, so swapping to the
// genuine Skia version a moment later isn't a jarring shape change.
function RatingBadgeFallback({ rating, size = 40 }: Props) {
  return (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: size * 0.08,
          backgroundColor: colorForRating(rating),
          borderWidth: Math.max(1.5, size * 0.05),
          borderColor: 'rgba(255,255,255,0.9)',
        },
      ]}
    >
      <ThemedText type="roundedStat" style={[styles.fallbackText, { fontSize: Math.min(20, Math.max(11, size * 0.32)) }]}>
        {rating.toFixed(1)}
      </ThemedText>
    </View>
  );
}

// Web-only: react-native-skia's web target loads a CanvasKit WASM engine
// asynchronously — calling any Skia API before that finishes throws.
// WithSkiaWeb is the library's own documented gate for exactly this.
export function RatingGlassBadgeGated(props: Props) {
  return (
    <WithSkiaWeb
      getComponent={() => import('@/components/ui/rating-glass-badge')}
      componentProps={props}
      fallback={<RatingBadgeFallback {...props} />}
      opts={{
        // Same CDN pin as liquid-glass-track-gated.web.tsx — Metro doesn't
        // serve node_modules' canvaskit.wasm at any predictable URL on its
        // own, confirmed there; version pinned to match the installed
        // canvaskit-wasm package.
        locateFile: (file: string) => `https://unpkg.com/canvaskit-wasm@0.41.0/bin/full/${file}`,
      }}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
