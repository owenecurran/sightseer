import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { PhotoGrid } from '@/components/photo-grid';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import type { BoardVisitItem } from '@/lib/boards';

type FullReviewsViewProps = {
  items: BoardVisitItem[];
  photoUrls: Record<string, string>;
  viewerId?: string;
  // "Your rating: X" read-only overlay for places the viewer has
  // independently reviewed — see src/lib/own-ratings.ts.
  ownRatings?: Record<string, number>;
};

// One full review per row, normal vertical scroll — matching every other
// list in the app (reviews.tsx, index.tsx). Previously a horizontal paging
// carousel (one review per swipe); only the scroll axis changed, card
// content (place name, author+rating, note, full-bleed photo) is unchanged.
export function FullReviewsView({ items, photoUrls, viewerId, ownRatings }: FullReviewsViewProps) {
  const bottomInset = useBottomTabInset();
  const scrollHandler = useHideOnScrollHandler();

  return (
    <Animated.FlatList
      data={items}
      keyExtractor={(item: BoardVisitItem) => item.id}
      style={styles.flex}
      contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
      showsVerticalScrollIndicator={false}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      renderItem={({ item }: { item: BoardVisitItem }) => {
        const ownRating = ownRatings?.[item.placeId];
        const showOwnRating = ownRating != null && item.authorId !== viewerId;
        return (
        <View style={styles.card}>
          <View style={styles.textWrap}>
            <Pressable onPress={() => router.push({ pathname: '/visit/[id]', params: { id: item.visitId } })}>
              <View style={styles.header}>
                <ThemedText type="displaySerif">{item.placeName}</ThemedText>
                {item.stateCountry && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.stateCountry}
                  </ThemedText>
                )}
                <ThemedText type="small" themeColor="textSecondary">
                  {item.authorName}
                  {item.rating != null ? ` · ${item.rating.toFixed(1)} ★` : ''}
                </ThemedText>
                {showOwnRating && (
                  <ThemedText type="small" themeColor="textSecondary">
                    Your rating: {ownRating.toFixed(1)} ★
                  </ThemedText>
                )}
              </View>
              {item.note && <ThemedText type="default">{item.note}</ThemedText>}
            </Pressable>
          </View>
          {(() => {
            const photos = item.photoIds
              .map((id, i) => ({ url: photoUrls[id], ratio: item.photoAspectRatios[i] }))
              .filter((p): p is { url: string; ratio: number | null } => p.url != null);
            return <PhotoGrid urls={photos.map((p) => p.url)} aspectRatios={photos.map((p) => p.ratio)} />;
          })()}
        </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  list: {
    gap: Spacing.four,
    paddingTop: Spacing.three,
  },
  card: {
    gap: Spacing.three,
  },
  textWrap: {
    paddingHorizontal: Spacing.four,
  },
  header: {
    gap: Spacing.half,
  },
});
