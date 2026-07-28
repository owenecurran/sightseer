import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
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

  return (
    <View style={styles.wrap}>
      <ThemedText type="sectionLabel">{label}</ThemedText>
      <Pressable
        onPress={() => router.push({ pathname: '/visit/[id]', params: { id: visitId } })}
        style={styles.card}>
        <View style={[styles.photoWrap, { aspectRatio }]}>
          {photoUrl && <Image source={{ uri: photoUrl }} style={styles.photo} contentFit="contain" />}
          <View style={styles.placeOverlay}>
            <StretchText type="headline" outline>
              {placeName}
            </StretchText>
          </View>
        </View>
        <View style={styles.info}>
          <View style={styles.ratingBadge}>
            <ThemedText type="roundedStat" themeColor="background">
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
  },
  photo: {
    ...StyleSheet.absoluteFill,
  },
  placeOverlay: {
    padding: Spacing.two,
  },
  info: {
    flex: 1,
    padding: Spacing.three,
    gap: Spacing.two,
    justifyContent: 'center',
  },
  ratingBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: BrandColors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
