import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { FeedCardHeaderText } from '@/components/feed-place-photo-block';
import { PhotoGrid } from '@/components/photo-grid';
import { ThemedText } from '@/components/themed-text';
import { OwnRatingLine } from '@/components/ui/own-rating-line';
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
// carousel (one review per swipe); only the scroll axis changed. The header
// block itself now reuses FeedCardHeaderText directly instead of a
// hand-rolled lookalike — same "one implementation, everyone matches"
// reasoning that component's own header comment already states, so this
// card's place name/location/note/rating stamp match the real feed and
// travel-book reviews exactly rather than approximating them a third way.
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
      // Each row draws at least one rating stamp, and every stamp is a Skia
      // canvas holding a GL surface. FlatList's default window is 21
      // screens' worth, which on a long board mounts far more live GL
      // contexts than anything on screen needs — the same load that faulted
      // the host OpenGL driver on the harmony and place screens.
      initialNumToRender={5}
      maxToRenderPerBatch={5}
      windowSize={5}
      renderItem={({ item }: { item: BoardVisitItem }) => {
        const ownRating = ownRatings?.[item.placeId];
        const showOwnRating = ownRating != null && item.authorId !== viewerId;
        const photos = item.photoIds
          .map((id, i) => ({ url: photoUrls[id], ratio: item.photoAspectRatios[i] }))
          .filter((p): p is { url: string; ratio: number | null } => p.url != null);
        return (
          <View style={styles.card}>
            <View style={styles.textWrap}>
              <ThemedText type="small" themeColor="textSecondary">
                {item.authorName}
              </ThemedText>
              <Pressable onPress={() => router.push({ pathname: '/visit/[id]', params: { id: item.visitId } })}>
                <FeedCardHeaderText
                  placeName={item.placeName}
                  placeId={item.placeId}
                  stateCountry={item.stateCountry}
                  visitedLine={[item.rating == null ? 'Visited' : null, item.note || null].filter(Boolean).join(' · ')}
                  rating={item.rating}
                  stampSeed={item.id}
                  stampCanSeep={photos.length > 0}
                />
              </Pressable>
              {showOwnRating && (
                <OwnRatingLine rating={ownRating} />
              )}
            </View>
            <PhotoGrid urls={photos.map((p) => p.url)} aspectRatios={photos.map((p) => p.ratio)} />
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
  // position/zIndex here (not just on FeedCardHeaderText's own internal
  // zIndex) matters because PhotoGrid below is a *sibling* of this block,
  // not of FeedCardHeaderText itself — zIndex only resolves stacking among
  // elements sharing one immediate parent, so the stamp's own zIndex
  // (scoped to its direct parent, FeedCardHeaderText) can't win that fight
  // on its own. Same fix (tabs)/index.tsx's cardTop needed for the same
  // reason.
  textWrap: {
    position: 'relative',
    zIndex: 2,
    paddingHorizontal: Spacing.four,
    gap: Spacing.half,
  },
});
