import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';
import { buildPlaceMapUrl } from '@/lib/place-map-image';

type PostcardMapProps = {
  placeId: string;
  placeName: string;
  lat: number;
  lng: number;
  level: string | null;
  // 'block' fills the column it is given at `ratio`; 'thumb' is a fixed
  // square for the action row of a card with no width to spare.
  size: 'block' | 'thumb';
  // Block only. Defaults to a landscape thumbnail; the picture side of a
  // photoless card passes the postcard frame's own ratio instead, so the
  // map fills the frame rather than sitting in it.
  ratio?: number;
};

const BLOCK_RATIO = 4 / 3;
const THUMB_SIZE = 56;

// Where the review happened, on the written side of the card.
//
// Built from buildPlaceMapUrl rather than reusing TripMapSquare: that one
// frames a set of pins for a whole trip and caps its zoom at a
// neighbourhood, which on a country- or region-level place is a grey square
// with a pin in the middle of it — the "could be anywhere" failure the
// picture-side map already had to be widened out of. This takes the zoom
// from the place's own level, the same as the big one.
export function PostcardMap({
  placeId,
  placeName,
  lat,
  lng,
  level,
  size,
  ratio = BLOCK_RATIO,
}: PostcardMapProps) {
  // The URL depends on the rendered width, which is only known after layout
  // for the block form — the column it sits in is a fraction of a card
  // whose own width varies with the viewport.
  const [width, setWidth] = useState(0);

  const isThumb = size === 'thumb';
  const boxWidth = isThumb ? THUMB_SIZE : width;
  const boxHeight = isThumb ? THUMB_SIZE : width / ratio;
  const url =
    boxWidth > 0 ? buildPlaceMapUrl({ lat, lng, level, width: boxWidth, height: boxHeight }) : null;

  return (
    <View
      style={[
        styles.wrap,
        isThumb
          ? { width: THUMB_SIZE, height: THUMB_SIZE }
          : // Height held before the URL resolves so the card does not jump
            // when the first layout pass lands.
            { width: '100%', aspectRatio: ratio },
      ]}
      onLayout={isThumb ? undefined : (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {url && (
        <Pressable
          onPress={() => router.push({ pathname: '/place/[id]', params: { id: placeId } })}
          style={StyleSheet.absoluteFill}>
          <Image
            source={{ uri: url }}
            accessibilityLabel={`Map of ${placeName}`}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={160}
            // A real network fetch of a stable URL, and the same place
            // recurs across a feed — re-fetching per scroll is waste.
            cachePolicy="memory-disk"
          />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: Spacing.two,
    overflow: 'hidden',
    // A hairline of the card's own cream, so the map reads as something
    // pasted onto the card rather than a hole cut in it.
    borderWidth: 1,
    borderColor: `${BrandColors.cream}22`,
  },
});
