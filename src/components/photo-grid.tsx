import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { PhotoLightbox } from '@/components/photo-lightbox';
import { LoadableImage } from '@/components/ui/loadable-image';
import { Spacing } from '@/constants/theme';

export const MAX_VISIT_PHOTOS = 4;

// PhotoGrid is now rendered full-bleed (edge-to-edge with the screen, not
// just the centered content column) on the feed and full-reviews views —
// aspectRatio alone would let a "tall" (0.5) photo grow unreasonably tall
// on a wide viewport where full-bleed means the whole browser window width.
const MAX_PHOTO_HEIGHT = 520;

// Matches photo-crop-modal.tsx's own crop bound.
const MIN_DISPLAY_RATIO = 9 / 16;
const MAX_DISPLAY_RATIO = 16 / 9;

// Standard single/double-tap disambiguation window.
const DOUBLE_TAP_MS = 300;

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

type PhotoTileProps = {
  url: string;
  style: StyleProp<ViewStyle>;
  onPress: () => void;
};

// A real component (not a JSX-returning helper called inline from the
// parent's render body) for every tile, single-photo included — keeps each
// tile's press handler as a stable, directly-owned prop rather than a
// closure re-created inside a plain function call, which is both clearer
// and safer under this app's React Compiler (auto-memoization can behave
// unpredictably around closures minted inside ad-hoc render-time helpers).
function PhotoTile({ url, style, onPress }: PhotoTileProps) {
  return (
    <Pressable onPress={onPress} style={style}>
      <LoadableImage source={{ uri: url }} style={styles.fill} />
    </Pressable>
  );
}

type SinglePhotoTileProps = {
  url: string;
  rawRatio: number | null;
  onPress: () => void;
};

// Full width up to MAX_PHOTO_HEIGHT — beyond that, width shrinks to match
// rather than cropping or overflowing. Photos are rendered full-bleed (the
// entire window width on wide viewports, not just a card width — see
// index.tsx's photoBreakout), so an uncapped square/tall photo's height
// would equal the *window's* full width too, overflowing well past the
// screen. Capping height alone (via plain aspectRatio+maxHeight styles)
// breaks the box's actual ratio without adjusting width back down, which is
// why this computes both dimensions together once the tile's own width is
// known via onLayout: most normal-sized photos at typical widths never hit
// the cap at all (full width, no gap, no crop); only extreme cases (very
// wide viewport + square/tall photo) narrow instead of overflowing.
function SinglePhotoTile({ url, rawRatio, onPress }: SinglePhotoTileProps) {
  const [containerWidth, setContainerWidth] = useState(0);

  function handleLayout(event: LayoutChangeEvent) {
    setContainerWidth(event.nativeEvent.layout.width);
  }

  const ratio = rawRatio != null ? clamp(rawRatio, MIN_DISPLAY_RATIO, MAX_DISPLAY_RATIO) : 1;
  const naturalHeight = containerWidth / ratio;
  const height = containerWidth > 0 ? Math.min(naturalHeight, MAX_PHOTO_HEIGHT) : 0;
  const width = height * ratio;

  return (
    <View style={styles.singleOuter} onLayout={handleLayout}>
      {containerWidth > 0 ? (
        <PhotoTile url={url} style={[styles.singleInner, { width, height }]} onPress={onPress} />
      ) : (
        // Holds the photo's space on the very first frame, before onLayout
        // reports a width. Rendering nothing here collapsed the whole card
        // to zero height for a frame — invisible on a static screen, but
        // very visible when stepping through a trip's reviews, where every
        // new card flashed empty before popping open. aspectRatio gives the
        // box a height without needing a measurement first.
        <View style={{ width: '100%', aspectRatio: ratio, maxHeight: MAX_PHOTO_HEIGHT }} />
      )}
    </View>
  );
}

type PhotoGridProps = {
  urls: string[];
  // Parallel to urls — only consulted for the single-photo case.
  aspectRatios?: (number | null)[];
  // Fires on a double-tap on any tile — e.g. the feed's Instagram-style
  // double-tap-to-like. Omitted where that doesn't apply (full-reviews,
  // visit detail).
  onDoubleTap?: () => void;
};

// Layouts match the standard 1/2/3/4-photo social-feed grid (Instagram-style):
// 1 full width, 2 side-by-side, 3 as one tall + two stacked, 4 as a 2x2 grid.
// Owns its own tap-to-focus lightbox.
export function PhotoGrid({ urls, aspectRatios, onDoubleTap }: PhotoGridProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  // Plain RN Pressable + a manual tap-timestamp comparison, not an RNGH
  // gesture — an RNGH GestureDetector nested inside the feed's *outer*
  // double-tap detector didn't reliably receive events, and neither did a
  // later attempt building both taps as one RNGH Gesture.Exclusive() per
  // tile. This sidesteps RNGH entirely: single tap opens the lightbox
  // after a short window with no second tap; a second tap inside that
  // window cancels it and fires onDoubleTap instead — the same debounce
  // pattern gesture libraries use internally, implemented directly. One
  // ref per grid (keyed by tile index), not one per tile, since the
  // number of tiles varies with props and hooks can't be called a
  // variable number of times.
  const lastTapAtRef = useRef<Map<number, number>>(new Map());
  const pendingOpenRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const handleTilePress = useCallback(
    (index: number) => {
      const now = Date.now();
      const lastTapAt = lastTapAtRef.current.get(index) ?? 0;
      lastTapAtRef.current.set(index, now);

      if (onDoubleTap && now - lastTapAt < DOUBLE_TAP_MS) {
        const pending = pendingOpenRef.current.get(index);
        if (pending) {
          clearTimeout(pending);
          pendingOpenRef.current.delete(index);
        }
        lastTapAtRef.current.set(index, 0);
        onDoubleTap();
        return;
      }

      if (onDoubleTap) {
        const timeout = setTimeout(() => {
          pendingOpenRef.current.delete(index);
          setSelectedIndex(index);
        }, DOUBLE_TAP_MS);
        pendingOpenRef.current.set(index, timeout);
      } else {
        setSelectedIndex(index);
      }
    },
    [onDoubleTap]
  );

  if (urls.length === 0) return null;

  let content: ReactNode;

  if (urls.length === 1) {
    content = (
      <SinglePhotoTile url={urls[0]} rawRatio={aspectRatios?.[0] ?? null} onPress={() => handleTilePress(0)} />
    );
  } else if (urls.length === 2) {
    content = (
      <View style={styles.row}>
        <PhotoTile url={urls[0]} style={styles.square} onPress={() => handleTilePress(0)} />
        <PhotoTile url={urls[1]} style={styles.square} onPress={() => handleTilePress(1)} />
      </View>
    );
  } else if (urls.length === 3) {
    content = (
      <View style={styles.row}>
        <PhotoTile url={urls[0]} style={styles.tall} onPress={() => handleTilePress(0)} />
        <View style={styles.column}>
          <PhotoTile url={urls[1]} style={styles.square} onPress={() => handleTilePress(1)} />
          <PhotoTile url={urls[2]} style={styles.square} onPress={() => handleTilePress(2)} />
        </View>
      </View>
    );
  } else {
    content = (
      <View style={styles.column}>
        <View style={styles.row}>
          <PhotoTile url={urls[0]} style={styles.square} onPress={() => handleTilePress(0)} />
          <PhotoTile url={urls[1]} style={styles.square} onPress={() => handleTilePress(1)} />
        </View>
        <View style={styles.row}>
          <PhotoTile url={urls[2]} style={styles.square} onPress={() => handleTilePress(2)} />
          {urls[3] != null && <PhotoTile url={urls[3]} style={styles.square} onPress={() => handleTilePress(3)} />}
        </View>
      </View>
    );
  }

  return (
    <>
      {content}
      <PhotoLightbox
        visible={selectedIndex != null}
        urls={urls}
        initialIndex={selectedIndex ?? 0}
        onClose={() => setSelectedIndex(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  singleOuter: {
    width: '100%',
    alignItems: 'center',
  },
  singleInner: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.half,
  },
  column: {
    flex: 1,
    gap: Spacing.half,
  },
  square: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: MAX_PHOTO_HEIGHT,
    overflow: 'hidden',
  },
  tall: {
    flex: 1,
    aspectRatio: 0.5,
    maxHeight: MAX_PHOTO_HEIGHT,
    overflow: 'hidden',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
});
