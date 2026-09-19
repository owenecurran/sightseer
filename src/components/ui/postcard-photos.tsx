import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PhotoLightbox } from '@/components/photo-lightbox';
import { LoadableImage } from '@/components/ui/loadable-image';
import { Spacing } from '@/constants/theme';
import { usePhotoTaps } from '@/hooks/use-photo-taps';
import { POSTCARD_FRAME_RATIO, type PostcardOrientation } from '@/lib/postcard-orientation';

type PostcardPhotosProps = {
  urls: string[];
  // Grid-sized copies, parallel to urls. Only used where a tile is a
  // fraction of the frame and the full image is far more resolution than it
  // can show.
  thumbUrls?: string[];
  orientation: PostcardOrientation;
  // Overrides the frame the photos are fitted into. A picture tipped onto a
  // written card is a print on one half of the sheet, not the sheet's own
  // face, so it keeps its own proportions instead of the postcard's.
  frameRatio?: number;
  onDoubleTap?: () => void;
  // Fired once, when every tile this actually draws has its picture — or has
  // given up on it. The card above holds itself back until then, so it
  // appears whole rather than assembling a photograph at a time. Errors count
  // as ready on purpose: a picture that will never arrive must not be able to
  // keep a card off the screen.
  onReady?: () => void;
};

// The picture side of a postcard.
//
// Not PhotoGrid. That one lets the photos set the height — a tall photo
// makes a tall block — which is right where a review is the whole screen
// and wrong in a feed of cards that are supposed to read as the same
// object. Here the frame is fixed by the orientation and the photos fill
// it, so every horizontal card in the feed is the same shape and every
// vertical one is the same shape.
//
// A single photo is fitted, not cropped: its shape is the subject, the card
// shows around it the way a print sits on a postcard, and that margin is
// where the stamp and the tag stickers are allowed to go (see fitPicture and
// visit-card's ornament rules). Cropping one would leave no margin anywhere
// and quietly take a third off the top of every portrait shot.
//
// A grid is cropped. Fitting each tile was tried and it is a different thing
// entirely: four photos of four different shapes, each floating in its own
// slot, leave holes of card between them at every size and the card reads as
// broken rather than as a mosaic. In a grid the slot is the composition and
// the photo fills it.
export function PostcardPhotos({
  urls,
  thumbUrls,
  orientation,
  frameRatio,
  onDoubleTap,
  onReady,
}: PostcardPhotosProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const openAt = useCallback((index: number) => setSelectedIndex(index), []);
  const handleTilePress = usePhotoTaps(openAt, onDoubleTap);

  // Which tiles have their picture. A ref rather than state because nothing
  // here re-renders on it — the card above is the only thing that cares, and
  // it is told once, when the last one lands.
  const loaded = useRef<Set<number>>(new Set());
  const announced = useRef(false);
  const key = urls.join(',');
  useEffect(() => {
    // A different review reusing this component starts over.
    loaded.current = new Set();
    announced.current = false;
  }, [key]);

  if (urls.length === 0) return null;

  // Falls back per index, so a photo without a derivative still renders.
  const displayUrls = urls.length > 1 && thumbUrls ? urls.map((url, i) => thumbUrls[i] ?? url) : urls;

  const fit = urls.length === 1 ? 'contain' : 'cover';

  // What the layouts below actually draw. Five photographs still make a
  // four-tile grid, and the card must not wait on a fifth that is never
  // rendered.
  const tileCount = Math.min(urls.length, 4);

  const reportLoaded = (index: number) => {
    loaded.current.add(index);
    if (announced.current || loaded.current.size < tileCount) return;
    announced.current = true;
    onReady?.();
  };

  const tile = (index: number) => {
    // The small copy, shown while the big one is still coming.
    //
    // Only where the two differ, which in practice means the SINGLE-photo
    // card. A grid already draws the thumbnail as its picture, and handing
    // the same url in as its own placeholder would just be a second cache
    // lookup for a byte-identical image.
    //
    // This is where the wait actually was: a one-photo review — the common
    // shape — loaded the full 2048px original with nothing on screen behind
    // it, while its 800px derivative sat unused in the bucket.
    const placeholderUrl = thumbUrls?.[index];
    const placeholder =
      placeholderUrl && placeholderUrl !== displayUrls[index] ? { uri: placeholderUrl } : undefined;

    return (
      <Pressable style={styles.tile} onPress={() => handleTilePress(index)}>
        <LoadableImage
          source={{ uri: displayUrls[index] }}
          placeholder={placeholder}
          style={styles.fill}
          contentFit={fit}
          onLoad={() => reportLoaded(index)}
          onError={() => reportLoaded(index)}
        />
      </Pressable>
    );
  };

  let content;
  if (urls.length === 1) {
    content = tile(0);
  } else if (urls.length === 2) {
    // Split along the frame's long axis, so neither half ends up a sliver.
    content = (
      <View style={orientation === 'horizontal' ? styles.row : styles.column}>
        {tile(0)}
        {tile(1)}
      </View>
    );
  } else if (urls.length === 3) {
    // One large, two stacked beside it — the large one takes the long axis.
    content = (
      <View style={orientation === 'horizontal' ? styles.row : styles.column}>
        {tile(0)}
        <View style={orientation === 'horizontal' ? styles.column : styles.row}>
          {tile(1)}
          {tile(2)}
        </View>
      </View>
    );
  } else {
    content = (
      <View style={styles.column}>
        <View style={styles.row}>
          {tile(0)}
          {tile(1)}
        </View>
        <View style={styles.row}>
          {tile(2)}
          {urls[3] != null && tile(3)}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.frame, { aspectRatio: frameRatio ?? POSTCARD_FRAME_RATIO[orientation] }]}>
      {content}
      <PhotoLightbox
        visible={selectedIndex != null}
        urls={urls}
        initialIndex={selectedIndex ?? 0}
        onClose={() => setSelectedIndex(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    // No clipping and no background: what the fitted photos do not cover is
    // the card itself showing through, not a gap to be filled.
    overflow: 'visible',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.half,
  },
  column: {
    flex: 1,
    flexDirection: 'column',
    gap: Spacing.half,
  },
  tile: {
    flex: 1,
    overflow: 'hidden',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
});
