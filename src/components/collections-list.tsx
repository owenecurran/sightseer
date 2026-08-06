import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { CollectionsSwitcher, type CollectionMode } from '@/components/collections-switcher';
import { CollectionsSortControl, type CollectionSortMode } from '@/components/collections-sort-control';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import type { CollectionStats } from '@/lib/collection-stats';
import type { Database } from '@/lib/database.types';
import type { TravelBookListItem } from '@/lib/travel-books';

type BoardRow = Database['public']['Tables']['boards']['Row'];

type CollectionsListProps = {
  mode: CollectionMode;
  onModeChange: (mode: CollectionMode) => void;
  sortMode: CollectionSortMode;
  onSortModeChange: (mode: CollectionSortMode) => void;
  boards: BoardRow[];
  travelBooks: TravelBookListItem[];
  boardThumbnailUrls: Record<string, string>;
  travelBookThumbnailUrls: Record<string, string>;
  boardStats: Record<string, CollectionStats>;
  travelBookStats: Record<string, CollectionStats>;
  isLoading: boolean;
  emptyBoardsMessage: string;
  emptyTravelBooksMessage: string;
};

function sortValue(
  stats: CollectionStats | undefined,
  updatedAt: string,
  sortMode: CollectionSortMode,
  // Travel books have their own single manually-set trip rating
  // (travel_books.rating, set via the RatingSlider on travel-book/[id].tsx)
  // — "Top rated" should sort by that, not by the average of the book's
  // item ratings, so callers for travel books pass it explicitly. `undefined`
  // (boards, which have no such field) falls through to the computed
  // average; an explicit `null` (an unrated travel book) sinks to the
  // bottom rather than silently falling back to the average.
  manualRating?: number | null
): number {
  if (sortMode === 'mean_rating') {
    return manualRating !== undefined ? (manualRating ?? -Infinity) : (stats?.avgRating ?? -Infinity);
  }
  if (sortMode === 'most_saves') return stats?.saveCount ?? 0;
  return Date.parse(updatedAt);
}

// Presentational only — takes already-loaded data as props, no fetching of
// its own. (tabs)/boards.tsx needs useTabFocusEffect to load it;
// collections/[userId].tsx needs plain useFocusEffect — the fetching stays
// in each host, this just renders whatever they hand it, sorted and with
// cover photos, same shape "Latest reviews" already gets on profile.
export function CollectionsList({
  mode,
  onModeChange,
  sortMode,
  onSortModeChange,
  boards,
  travelBooks,
  boardThumbnailUrls,
  travelBookThumbnailUrls,
  boardStats,
  travelBookStats,
  isLoading,
  emptyBoardsMessage,
  emptyTravelBooksMessage,
}: CollectionsListProps) {
  const bottomInset = useBottomTabInset();
  const scrollHandler = useHideOnScrollHandler();

  const sortedBoards = [...boards].sort(
    (a, b) => sortValue(boardStats[b.id], b.updated_at, sortMode) - sortValue(boardStats[a.id], a.updated_at, sortMode)
  );
  const sortedTravelBooks = [...travelBooks].sort(
    (a, b) =>
      sortValue(travelBookStats[b.id], b.updated_at, sortMode, b.rating) -
      sortValue(travelBookStats[a.id], a.updated_at, sortMode, a.rating)
  );

  return (
    <View style={styles.container}>
      <View style={styles.controlsRow}>
        <CollectionsSwitcher active={mode} onChange={onModeChange} />
        <CollectionsSortControl active={sortMode} onChange={onSortModeChange} />
      </View>

      {mode === 'boards' && !isLoading && boards.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          {emptyBoardsMessage}
        </ThemedText>
      )}
      {mode === 'travel_books' && !isLoading && travelBooks.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          {emptyTravelBooksMessage}
        </ThemedText>
      )}

      {mode === 'boards' ? (
        <Animated.FlatList
          data={sortedBoards}
          keyExtractor={(item: BoardRow) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          renderItem={({ item }: { item: BoardRow }) => {
            const stats = boardStats[item.id];
            return (
              <Pressable
                onPress={() => router.push({ pathname: '/board/[id]', params: { id: item.id } })}
                style={({ pressed }) => pressed && styles.pressed}>
                <ThemedView type="backgroundElement" style={styles.row}>
                  {boardThumbnailUrls[item.id] ? (
                    <Image source={{ uri: boardThumbnailUrls[item.id] }} style={styles.thumbnail} />
                  ) : (
                    <View style={styles.thumbnailPlaceholder} />
                  )}
                  <View style={styles.rowLeading}>
                    <ThemedText type="headline">{item.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {stats?.avgRating != null ? `${stats.avgRating.toFixed(1)} ★ · ` : ''}
                      {stats?.saveCount ?? 0} save{stats?.saveCount === 1 ? '' : 's'}
                      {item.is_private ? ' · Private' : ''}
                    </ThemedText>
                  </View>
                  <ThemedText type="headline">›</ThemedText>
                </ThemedView>
              </Pressable>
            );
          }}
        />
      ) : (
        <Animated.FlatList
          data={sortedTravelBooks}
          keyExtractor={(item: TravelBookListItem) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          renderItem={({ item }: { item: TravelBookListItem }) => {
            const stats = travelBookStats[item.id];
            return (
              <Pressable
                onPress={() => router.push({ pathname: '/travel-book/[id]', params: { id: item.id } })}
                style={({ pressed }) => pressed && styles.pressed}>
                <ThemedView type="backgroundElement" style={styles.row}>
                  {travelBookThumbnailUrls[item.id] ? (
                    <Image source={{ uri: travelBookThumbnailUrls[item.id] }} style={styles.thumbnail} />
                  ) : (
                    <View style={styles.thumbnailPlaceholder} />
                  )}
                  <View style={styles.rowLeading}>
                    <ThemedText type="headline">{item.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.rating != null ? `${item.rating.toFixed(1)} ★ · ` : ''}
                      {stats?.saveCount ?? 0} save{stats?.saveCount === 1 ? '' : 's'}
                      {item.locationName ? ` · ${item.locationName}` : ''}
                      {item.is_private ? ' · Private' : ''}
                    </ThemedText>
                  </View>
                  <ThemedText type="headline">›</ThemedText>
                </ThemedView>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: Spacing.three,
  },
  controlsRow: {
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.two,
  },
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
    width: 56,
    height: 56,
    borderRadius: Spacing.two,
  },
  thumbnailPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(234,231,207,0.08)',
  },
  pressed: {
    opacity: 0.7,
  },
});
