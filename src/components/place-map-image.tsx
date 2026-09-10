import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';

import { buildPlaceMapUrl } from '@/lib/place-map-image';

// What a review shows instead of photos when its author posted none.
//
// Deliberately NOT routed through PhotoGrid, even though it occupies the
// same slot. A map is not one of the author's photos, and everything
// PhotoGrid grants a photo is wrong for it: opening in the lightbox, and
// double-tap-to-like, which would make a like look like it landed on the
// map rather than the review. It gets its own affordance instead — a tap
// opens the place, which is the only thing a reader would want from it.
type PlaceMapImageProps = {
  placeId: string;
  placeName: string;
  lat: number;
  lng: number;
  level: string | null;
};

// Wider than it is tall, and shorter than a real photo would be. This is
// context, not content — at photo height it would read as the author having
// posted a picture of a map.
const ASPECT_RATIO = 16 / 9;

export function PlaceMapImage({ placeId, placeName, lat, lng, level }: PlaceMapImageProps) {
  // The URL depends on the rendered width, which is only known after
  // layout — the card is full-bleed on a phone and capped on a wide
  // viewport, so it cannot be derived from the window.
  const [width, setWidth] = useState(0);

  const height = width / ASPECT_RATIO;
  const url = width > 0 ? buildPlaceMapUrl({ lat, lng, level, width, height }) : null;

  return (
    <View
      style={styles.wrap}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {/* Height reserved before the URL exists, so the card does not jump
          once the first layout pass resolves it. */}
      <View style={{ height: width > 0 ? height : undefined, aspectRatio: width > 0 ? undefined : ASPECT_RATIO }}>
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
              // Disk-cached, unlike the generated stamps: this is a real
              // network fetch of a stable URL, and the same place recurs
              // across the feed, so re-fetching it per scroll is waste.
              cachePolicy="memory-disk"
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    overflow: 'hidden',
  },
});
