import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LoadableImage } from '@/components/ui/loadable-image';
import { BrandColors, Spacing } from '@/constants/theme';
import type { PlacePreview } from '@/lib/nearby-places';

type NearbyPlacePreviewCardProps = {
  preview: PlacePreview;
  onPress: () => void;
};

// The map's "browse" mode preview card — shown when a nearby-review marker
// is tapped. Deliberately NOT a reuse of ReviewPromptCard's photo-overlay
// treatment (StretchText, dynamic aspect ratio, the sage-border inset —
// real accumulated complexity from that component's own history): this is
// a much smaller floating popup over the map, not a profile section, and
// navigates to /place/[id] (all reviews for the place) rather than
// ReviewPromptCard's /visit/[id] (one specific review) — different enough
// destinations and layouts that sharing the component would fight both.
export function NearbyPlacePreviewCard({ preview, onPress }: NearbyPlacePreviewCardProps) {
  return (
    <Pressable onPress={onPress}>
      <ThemedView type="backgroundElement" style={styles.card}>
        {preview.photoUrl && (
          <LoadableImage source={{ uri: preview.photoUrl }} style={styles.photo} contentFit="cover" />
        )}
        <View style={styles.info}>
          <View style={styles.titleRow}>
            <ThemedText type="smallBold" numberOfLines={1} style={styles.placeName}>
              {preview.placeName}
            </ThemedText>
            {preview.rating != null && (
              <View style={styles.ratingBadge}>
                <ThemedText type="small" themeColor="background">
                  {preview.rating.toFixed(1)}
                </ThemedText>
              </View>
            )}
          </View>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {preview.authorName}
          </ThemedText>
          {preview.note && (
            <ThemedText type="small" numberOfLines={2}>
              {preview.note}
            </ThemedText>
          )}
        </View>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: Spacing.three,
    overflow: 'hidden',
    gap: Spacing.two,
  },
  photo: {
    width: 72,
    height: 72,
  },
  info: {
    flex: 1,
    paddingVertical: Spacing.two,
    paddingRight: Spacing.three,
    gap: Spacing.half,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  placeName: {
    flex: 1,
  },
  ratingBadge: {
    backgroundColor: BrandColors.cream,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.five,
  },
});
