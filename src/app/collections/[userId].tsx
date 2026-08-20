import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CollectionsList } from '@/components/collections-list';
import type { CollectionMode } from '@/components/collections-switcher';
import type { CollectionSortMode } from '@/components/collections-sort-control';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/page-loader';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { listMyBoards } from '@/lib/boards';
import { getCollectionStats, type CollectionStats } from '@/lib/collection-stats';
import { getTripsForUsers, type Trip } from '@/lib/trips';
import { getVisitsByIds } from '@/lib/feed';
import { getBoardThumbnailUrls, getTravelBookThumbnailUrls } from '@/lib/collection-thumbnails';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { listMyTravelBooks, listUserTravelBooks, type TravelBookListItem } from '@/lib/travel-books';

type BoardRow = Database['public']['Tables']['boards']['Row'];

// Not the (tabs)/boards.tsx tab itself — native tabs are 5 fixed-pathname
// PagerView pages with no param slot (see src/constants/tab-routes.ts), so
// viewing someone ELSE's boards/travel books needs its own pushed route
// instead of overloading /boards. Shares CollectionsList (switcher + sort +
// cover thumbnails) with the tab, just with its own isSelf-aware data
// fetching.
export default function UserCollectionsScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { session } = useAuth();
  const [userName, setUserName] = useState<string | null>(null);
  const [mode, setMode] = useState<CollectionMode>('boards');
  const [sortMode, setSortMode] = useState<CollectionSortMode>('recently_edited');
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [boardThumbnailUrls, setBoardThumbnailUrls] = useState<Record<string, string>>({});
  const [travelBooks, setTravelBooks] = useState<TravelBookListItem[]>([]);
  const [travelBookThumbnailUrls, setTravelBookThumbnailUrls] = useState<Record<string, string>>({});
  const [boardStats, setBoardStats] = useState<Record<string, CollectionStats>>({});
  const [travelBookStats, setTravelBookStats] = useState<Record<string, CollectionStats>>({});
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripAverageRatings, setTripAverageRatings] = useState<Record<string, number | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const isSelf = Boolean(session && userId && session.user.id === userId);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      setIsLoading(true);
      setError(null);
      Promise.all([
        supabase.from('users').select('name, handle').eq('id', userId).single(),
        listMyBoards(userId).then(async (myBoards) => {
          setBoards(myBoards);
          setBoardThumbnailUrls(await getBoardThumbnailUrls(myBoards));
          return myBoards;
        }),
        (isSelf ? listMyTravelBooks(userId) : listUserTravelBooks(userId)).then(async (myBooks) => {
          setTravelBooks(myBooks);
          setTravelBookThumbnailUrls(await getTravelBookThumbnailUrls(myBooks));
          return myBooks;
        }),
      ])
        .then(async ([{ data: userRow }, myBoards, myBooks]) => {
          setUserName(userRow?.name ?? userRow?.handle ?? null);
          const stats = await getCollectionStats(
            myBoards.map((b) => b.id),
            myBooks.map((b) => b.id)
          );
          setBoardStats(stats.boards);
          setTravelBookStats(stats.travelBooks);

          // Trips are derived, so they're fetched rather than stored — and
          // their average score (for each row's thumbnail ring) needs the
          // underlying reviews, which the RPC returns only ids for.
          const detected = await getTripsForUsers([userId]);
          setTrips(detected);
          const allVisitIds = [...new Set(detected.flatMap((t) => t.visitIds))];
          if (allVisitIds.length > 0) {
            const visits = await getVisitsByIds(allVisitIds, session?.user.id ?? userId);
            const ratingById = new Map(visits.map((v) => [v.id, v.rating]));
            setTripAverageRatings(
              Object.fromEntries(
                detected.map((trip) => {
                  const rated = trip.visitIds
                    .map((id) => ratingById.get(id))
                    .filter((r): r is number => r != null);
                  return [
                    trip.key,
                    rated.length > 0 ? rated.reduce((sum, r) => sum + r, 0) / rated.length : null,
                  ];
                })
              )
            );
          }
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not load these collections.'))
        .finally(() => {
          setIsLoading(false);
          setHasLoadedOnce(true);
        });
    }, [userId, isSelf])
  );

  if (!hasLoadedOnce) return <PageLoader />;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.gutter}>
          <Pressable onPress={() => router.back()}>
            <ThemedText type="link">← Back</ThemedText>
          </Pressable>

          <ThemedText type="displaySerif">
            {isSelf ? 'Your boards' : userName ? `${userName}’s boards` : 'Boards'}
          </ThemedText>

          {isSelf && (
            <Button
              label={mode === 'boards' ? 'New board' : 'New travel book'}
              onPress={() => router.push(mode === 'boards' ? '/board/new' : '/travel-book/new')}
            />
          )}

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}
        </View>

        <CollectionsList
          mode={mode}
          onModeChange={setMode}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
          boards={boards}
          travelBooks={travelBooks}
          boardThumbnailUrls={boardThumbnailUrls}
          travelBookThumbnailUrls={travelBookThumbnailUrls}
          boardStats={boardStats}
          travelBookStats={travelBookStats}
          trips={trips}
          tripAverageRatings={tripAverageRatings}
          isLoading={isLoading}
          emptyBoardsMessage={isSelf ? 'No boards yet.' : 'No boards to show.'}
          emptyTravelBooksMessage={isSelf ? 'No travel books yet.' : 'No travel books to show.'}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingTop: Spacing.four + TopTabInset,
    gap: Spacing.three,
  },
  // Applied here instead of safeArea's own paddingHorizontal — see the
  // matching comment in (tabs)/boards.tsx for why (CollectionsList's
  // FlatList needs safeArea's full unclipped width for FeedRatingStamp's
  // overflow to render instead of being clipped at a padded ancestor frame).
  gutter: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
});
