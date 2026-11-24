import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OutlinedText } from '@/components/ui/outlined-text';
import { BrandColors } from '@/constants/theme';
import { colorForRating } from '@/lib/rating-gradient';
import { buildStampArtworkDataUri, buildStampDataUri, buildStampFrameDataUri } from '@/lib/stamp-svg';
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
  // For a rating that is being changed as it shows (the rating slider). The
  // number and the window's colour follow at once; the artwork in the
  // window follows once the rating settles. See LiveRatingStamp.
  live?: boolean;
};

const DEFAULT_SIZE = 52;

// How long the rating has to stay put before the live stamp draws its
// artwork for it. Long enough to sit out a drag, short enough to read as
// arriving with the release.
const ARTWORK_SETTLE_MS = 180;

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
export function RatingStampSvg(props: RatingStampSvgProps) {
  return props.live ? <LiveRatingStamp {...props} /> : <StillRatingStamp {...props} />;
}

function StillRatingStamp({ rating, size = DEFAULT_SIZE, seed, tags, placeId }: RatingStampSvgProps) {
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

// The stamp in layers, for a rating being changed as it shows.
//
// The still stamp is one image, rebuilt and decoded for every rating, and its
// number waits for it. On the rating slider that is a new image every tenth
// of a point, so the number and colour trailed the thumb, each step waiting
// on a decode. Here the stamp comes apart: the paper is one image that never
// changes, the window's colour is a plain view that changes at once, the
// number is text that changes at once, and only the artwork (with the wear
// over it), the slow part, waits for the rating to settle and then appears.
//
// The whole stamp still arrives together the first time: nothing shows until
// the paper has decoded, the same rule the still stamp keeps.
function LiveRatingStamp({ rating, size = DEFAULT_SIZE, seed, tags, placeId }: RatingStampSvgProps) {
  const scale = size / STAMP_VIEWBOX_WIDTH;
  const height = STAMP_VIEWBOX_HEIGHT * scale;
  const fontSize = clamp(size * 0.3, 11, 26);
  // One paper and one wear for the whole drag. Seeded from the rating, as
  // the still stamp is when it has no seed, they changed with every step.
  const stampSeed = seed ?? 'rating-preview';
  const tagKey = tags?.join(',') ?? '';
  const context = useMemo(
    () => ({ seed: stampSeed, tags, placeId }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stampSeed, tagKey, placeId]
  );

  // The paper is decided by the seed alone, never the rating, so any rating
  // draws the same one; 0 keeps it out of this memo's dependencies.
  const frameUri = useMemo(() => buildStampFrameDataUri(0, size, context), [size, context]);
  const [frameReady, setFrameReady] = useState(false);
  useEffect(() => {
    if (frameReady) return;
    const timer = setTimeout(() => setFrameReady(true), ARTWORK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [frameReady]);

  // The rating the artwork is drawn for: the shown one, once it has held
  // still for ARTWORK_SETTLE_MS.
  const [settled, setSettled] = useState(rating);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(rating), ARTWORK_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [rating]);
  const artworkUri = useMemo(() => buildStampArtworkDataUri(settled, size, context), [settled, size, context]);
  const [loadedArtwork, setLoadedArtwork] = useState<string | null>(null);
  // Only the artwork for the rating on show: an older one, in the older
  // rating's colours, would clash with the window it sits in.
  const showArtwork = settled === rating && loadedArtwork === artworkUri;

  const windowBox = {
    left: STAMP_WINDOW_RECT.x * scale,
    top: STAMP_WINDOW_RECT.y * scale,
    width: STAMP_WINDOW_RECT.width * scale,
    height: STAMP_WINDOW_RECT.height * scale,
  };

  return (
    <View style={{ width: size, height, opacity: frameReady ? 1 : 0 }}>
      <Image
        source={{ uri: frameUri }}
        style={StyleSheet.absoluteFill}
        contentFit="fill"
        cachePolicy="memory"
        transition={0}
        onLoad={() => setFrameReady(true)}
        onError={() => setFrameReady(true)}
      />
      <View style={[styles.window, windowBox, { backgroundColor: colorForRating(rating) }]} />
      <Image
        source={{ uri: artworkUri }}
        style={[StyleSheet.absoluteFill, { opacity: showArtwork ? 1 : 0 }]}
        contentFit="fill"
        cachePolicy="memory"
        transition={0}
        onLoad={() => setLoadedArtwork(artworkUri)}
        onError={() => setLoadedArtwork(artworkUri)}
      />
      <View style={[styles.valueWrap, windowBox]} pointerEvents="none">
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
    </View>
  );
}

const styles = StyleSheet.create({
  window: {
    position: 'absolute',
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
