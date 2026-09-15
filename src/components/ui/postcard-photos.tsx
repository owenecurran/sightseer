import { useCallback, useState } from 'react';
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
  onDoubleTap?: () => void;
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
// Filling rather than fitting: a letterboxed photo inside a postcard frame
// looks like a mistake, and the frame was already chosen (see
// orientationForPhotos) to be the one the photo loses least in.
export function PostcardPhotos({
  urls,
  thumbUrls,
  orientation,
  onDoubleTap,
}: PostcardPhotosProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const openAt = useCallback((index: number) => setSelectedIndex(index), []);
  const handleTilePress = usePhotoTaps(openAt, onDoubleTap);

  if (urls.length === 0) return null;

  // Falls back per index, so a photo without a derivative still renders.
  const displayUrls = urls.length > 1 && thumbUrls ? urls.map((url, i) => thumbUrls[i] ?? url) : urls;

  const tile = (index: number) => (
    <Pressable style={styles.tile} onPress={() => handleTilePress(index)}>
      <LoadableImage source={{ uri: displayUrls[index] }} style={styles.fill} contentFit="cover" />
    </Pressable>
  );

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
    <View style={[styles.frame, { aspectRatio: POSTCARD_FRAME_RATIO[orientation] }]}>
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
    overflow: 'hidden',
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
