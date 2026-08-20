import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LoadableImage } from '@/components/ui/loadable-image';
import { StretchText } from '@/components/ui/stretch-text';
import { Spacing } from '@/constants/theme';
import { colorForRating } from '@/lib/rating-gradient';
import type { Trip } from '@/lib/trips';

const THUMB_SIZE = 56;
const STATIC_STYLE = 'mapbox/dark-v10';
// Wide enough to read as the destination rather than a street corner —
// matches TripMapSquare's own reasoning.
const THUMB_ZOOM = 9;

type TripCollectionRowProps = {
  trip: Trip;
  // Average score across the trip's reviews, for the thumbnail's ring. Null
  // when nothing on the trip was rated.
  averageRating: number | null;
};

function formatDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

// A detected trip, listed alongside boards and travel books. Its thumbnail
// is a Mapbox static image rather than a live map — this is a list, and one
// WebGL context per row would be absurd.
export function TripCollectionRow({ trip, averageRating }: TripCollectionRowProps) {
  const token = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const hasCoords = trip.areaLat != null && trip.areaLng != null;
  const thumbUrl =
    token && hasCoords
      ? `https://api.mapbox.com/styles/v1/${STATIC_STYLE}/static/pin-s+EAE7CF(${trip.areaLng},${trip.areaLat})/${trip.areaLng},${trip.areaLat},${THUMB_ZOOM}/${THUMB_SIZE}x${THUMB_SIZE}@2x?access_token=${token}&attribution=false&logo=false`
      : undefined;

  const dateRange =
    trip.startDate === trip.endDate
      ? formatDate(trip.startDate)
      : `${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`;

  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/trip', params: { user: trip.userId, start: trip.startDate } })
      }
      style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.row}>
        {thumbUrl ? (
          <LoadableImage
            source={{ uri: thumbUrl }}
            style={[
              styles.thumbnail,
              averageRating != null && { borderColor: colorForRating(averageRating) },
            ]}
          />
        ) : (
          <View style={[styles.thumbnail, styles.thumbnailPlaceholder]} />
        )}

        <View style={styles.rowLeading}>
          <StretchText type="headline" fill>
            {trip.areaName}
          </StretchText>
          <ThemedText type="small" themeColor="textSecondary">
            {dateRange} · {trip.visitIds.length} review{trip.visitIds.length === 1 ? '' : 's'}
            {trip.kind === 'outing' ? ' · Day out' : ''}
          </ThemedText>
          {trip.travelBookId && (
            <ThemedText type="small" themeColor="sage">
              In a travel book
            </ThemedText>
          )}
        </View>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowLeading: {
    flex: 1,
    gap: Spacing.half,
  },
  thumbnail: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: Spacing.two,
    // Always present, transparent when unrated, so a rated and an unrated
    // trip keep identical footprints.
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbnailPlaceholder: {
    backgroundColor: 'rgba(234,231,207,0.08)',
  },
  pressed: {
    opacity: 0.7,
  },
});
