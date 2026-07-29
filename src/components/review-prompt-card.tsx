import { router } from 'expo-router';
import { useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { LoadableImage } from '@/components/ui/loadable-image';
import { StretchText } from '@/components/ui/stretch-text';
import { BrandColors, Spacing } from '@/constants/theme';

type ReviewPromptCardProps = {
  label: string;
  visitId: string;
  placeName: string;
  rating: number;
  note: string | null;
  photoUrl?: string;
  photoWidth?: number | null;
  photoHeight?: number | null;
};

const DEFAULT_PHOTO_ASPECT_RATIO = 1.3;

// Text and the rating badge both scale with the card's actual size instead
// of using fixed constants, clamped to sane bounds so a tiny card doesn't
// get illegibly small text and a huge one doesn't get a comically large
// badge.
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// The rich sage-card treatment shared by every review-type prompt answer
// (originally built just for a fixed "Favorite trip review" section before
// that became a regular selectable prompt like any other). The photo box's
// height comes from the actual photo's aspect ratio rather than a fixed
// height, so the card is exactly as tall as the image needs — the info
// panel matches via the row's default cross-axis stretch.
export function ReviewPromptCard({
  label,
  visitId,
  placeName,
  rating,
  note,
  photoUrl,
  photoWidth,
  photoHeight,
}: ReviewPromptCardProps) {
  const aspectRatio = photoWidth && photoHeight ? photoWidth / photoHeight : DEFAULT_PHOTO_ASPECT_RATIO;
  const [photoBox, setPhotoBox] = useState({ width: 0, height: 0 });
  const badgeSize = clamp(photoBox.height * 0.24, 40, 72);

  return (
    <View style={styles.wrap}>
      <ThemedText type="sectionLabel">{label}</ThemedText>
      <Pressable
        onPress={() => router.push({ pathname: '/visit/[id]', params: { id: visitId } })}
        style={styles.card}>
        <View
          style={[styles.photoWrap, { aspectRatio }]}
          onLayout={(e: LayoutChangeEvent) =>
            setPhotoBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
          }>
          <LoadableImage
            source={photoUrl ? { uri: photoUrl } : undefined}
            style={styles.photo}
            contentFit="contain"
          />
          {/* Overlay occupies the bottom third of the photo. StretchText's
              `outline` mode stretches the place name to fill this band on
              both axes (not just width) and anchors it flush to the
              bottom edge — overflow:'hidden' is a deliberate safety net,
              not just decoration, in case that measurement is ever off for
              a given photo, so text clips rather than bleeds past the
              card's rounded corners. */}
          <View style={styles.placeOverlay}>
            <StretchText type="headline" outline>
              {placeName}
            </StretchText>
          </View>
        </View>
        <View style={styles.info}>
          <View style={[styles.ratingBadge, { width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2 }]}>
            <ThemedText
              type="roundedStat"
              themeColor="background"
              style={{ fontSize: clamp(badgeSize * 0.32, 14, 28) }}>
              {rating.toFixed(1)}
            </ThemedText>
          </View>
          {note && (
            <ThemedText type="default" themeColor="background">
              {note}
            </ThemedText>
          )}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.one,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: BrandColors.sage,
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  photoWrap: {
    width: '55%',
    backgroundColor: 'rgba(234,231,207,0.15)',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  photo: {
    ...StyleSheet.absoluteFill,
  },
  placeOverlay: {
    height: '33%',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.two,
    overflow: 'hidden',
  },
  info: {
    flex: 1,
    padding: Spacing.three,
    gap: Spacing.two,
    justifyContent: 'center',
  },
  ratingBadge: {
    backgroundColor: BrandColors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
