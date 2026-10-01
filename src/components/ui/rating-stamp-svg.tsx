import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OutlinedText } from '@/components/ui/outlined-text';
import { BrandColors } from '@/constants/theme';
import { buildStampDataUri } from '@/lib/stamp-svg';
import { STAMP_VIEWBOX_HEIGHT, STAMP_VIEWBOX_WIDTH, STAMP_WINDOW_RECT } from '@/lib/stamp-shape';

type RatingStampSvgProps = {
  rating: number;
  size?: number;
  // Anything stable and unique per post — the visit id in practice. Decides
  // which of the registered designs fills the stamp's window, and is what
  // keeps that choice fixed across re-renders and relaunches instead of
  // reshuffling on every scroll.
  //
  // Optional because several callers have no single post behind them (a
  // place's average, the slider preview). Those fall back to keying off the
  // rating itself, which is what they want anyway: an aggregate should not
  // pretend to be one particular review.
  seed?: string;
  // Feed into which design the stamp draws -- a review tagged "open water"
  // or posted somewhere with its own stamp gets that one instead of a
  // random draw. See stamp-matching.ts.
  tags?: string[];
  placeId?: string;
};

const DEFAULT_SIZE = 52;

// How long the number will wait for its artwork before showing regardless.
const ARTWORK_TIMEOUT_MS = 1000;

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

// The rating stamp drawn as an SVG image rather than through Skia.
//
// Same artwork, same path data, same layout as rating-glass-badge.tsx — but
// no <Canvas>, so no GL surface. That matters because the stamp is the most
// repeated element in the app (one per review), and it was the dominant
// source of the GPU pressure that repeatedly faulted the host OpenGL driver
// with many reviews on screen. On web it matters for a different reason:
// Skia never works there at all (see the .web.tsx gate's own comment).
//
// The number stays a real text node over the window, exactly as the Skia
// version does it, so it keeps the app's font and its shrink-to-fit
// behaviour rather than becoming part of the image.
export function RatingStampSvg({ rating, size = DEFAULT_SIZE, seed, tags, placeId }: RatingStampSvgProps) {
  const scale = size / STAMP_VIEWBOX_WIDTH;
  const height = STAMP_VIEWBOX_HEIGHT * scale;
  const fontSize = clamp(size * 0.3, 11, 26);

  // Rebuilt only when the drawing actually changes. The string is a few KB
  // and one exists per distinct rating/size pair on screen.
  // Keyed on a joined string rather than the array itself: `tags` is a new
  // array identity on every render, which would rebuild the SVG (a few KB
  // of base64) on each one.
  const tagKey = tags?.join(',') ?? '';
  const uri = useMemo(
    () => buildStampDataUri(rating, size, { seed, tags, placeId }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rating, size, seed, tagKey, placeId]
  );

  // THE NUMBER WAITS FOR ITS STAMP.
  //
  // The artwork is a data URI, so there is no network wait -- but expo-image
  // still decodes it off the main thread, and the number is a real text node
  // that lays out immediately. For the frames in between, a rating rendered
  // as bare white text floating on whatever was behind it: on a Discover
  // tile still loading its photo, that is "8.5" alone in the middle of an
  // empty box.
  //
  // Showing them together costs a few frames of no rating at all, which is
  // the same trade the postcards make -- a thing that appears whole reads as
  // arriving, a thing that assembles itself reads as broken.
  // Which drawing is ready, rather than a boolean that has to be reset.
  //
  // A new rating or size is a new URI and therefore a new wait, and this gets
  // that for free: artworkReady simply stops being true the moment `uri`
  // changes. A boolean would need an effect to clear it, which is both a
  // render-phase state write and one more thing to forget.
  const [readyUri, setReadyUri] = useState<string | null>(null);
  const artworkReady = readyUri === uri;

  // A stamp that never decodes must not hide the rating for good: the number
  // is the information, the artwork is only the frame around it. Errors count
  // as ready for the same reason.
  useEffect(() => {
    if (artworkReady) return;
    const timer = setTimeout(() => setReadyUri(uri), ARTWORK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [artworkReady, uri]);

  return (
    <View style={{ width: size, height }}>
      {/* The SVG's aspect ratio is the stamp's own, so filling the box is
          exact rather than approximate. Memory-only caching: every rating
          produces a distinct URI, and writing thousands of tiny generated
          images to disk would be pure churn. */}
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="fill"
        cachePolicy="memory"
        transition={0}
        onLoad={() => setReadyUri(uri)}
        onError={() => setReadyUri(uri)}
      />
      {/* Positioned over the WINDOW, not the whole stamp, so the number
          centres against the coloured fill rather than the cream frame. */}
      {artworkReady && (
      <View
        style={[
          styles.valueWrap,
          {
            left: STAMP_WINDOW_RECT.x * scale,
            top: STAMP_WINDOW_RECT.y * scale,
            width: STAMP_WINDOW_RECT.width * scale,
            height: STAMP_WINDOW_RECT.height * scale,
          },
        ]}
        pointerEvents="none">
        <OutlinedText
          type="statLine"
          strokeColor={BrandColors.background}
          strokeRadius={2}
          style={[styles.value, { fontSize, width: '100%', textAlign: 'center' }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}>
          {rating.toFixed(1)}
        </OutlinedText>
      </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  valueWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    color: '#fff',
  },
});
