import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CollectionsList } from '@/components/collections-list';
import type { CollectionMode } from '@/components/collections-switcher';
import type { CollectionSortMode } from '@/components/collections-sort-control';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/page-loader';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useTabFocusEffect } from '@/hooks/use-tab-pager';
import { useAuth } from '@/lib/auth-context';
import { listMyBoards } from '@/lib/boards';
import { getCollectionStats, type CollectionStats } from '@/lib/collection-stats';
import { getTripsForUsers, type Trip } from '@/lib/trips';
import { getVisitsByIds } from '@/lib/feed';
import { getBoardThumbnailUrls, getTravelBookThumbnailUrls } from '@/lib/collection-thumbnails';
import type { Database } from '@/lib/database.types';
import { listMyTravelBooks, type TravelBookListItem } from '@/lib/travel-books';

type BoardRow = Database['public']['Tables']['boards']['Row'];

export default function BoardsScreen() {
  const { session } = useAuth();
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

  // Both datasets load together regardless of which mode is active, so
  // switching between Boards and Travel Books is instant with no reload —
  // the whole point of merging these into one tabbed screen.
  useTabFocusEffect(
    3,
    useCallback(() => {
      if (!session) return;
      setIsLoading(true);
      setError(null);
      Promise.all([
        listMyBoards(session.user.id).then(async (myBoards) => {
          setBoards(myBoards);
          setBoardThumbnailUrls(await getBoardThumbnailUrls(myBoards));
          return myBoards;
        }),
        listMyTravelBooks(session.user.id).then(async (myBooks) => {
          setTravelBooks(myBooks);
          setTravelBookThumbnailUrls(await getTravelBookThumbnailUrls(myBooks));
          return myBooks;
        }),
        // Independent of the two above, so it belongs in the same batch
        // rather than waiting for collection stats it never uses.
        getTripsForUsers([session.user.id]),
      ])
        .then(async ([myBoards, myBooks, detected]) => {
          const stats = await getCollectionStats(
            myBoards.map((b) => b.id),
            myBooks.map((b) => b.id)
          );
          setBoardStats(stats.boards);
          setTravelBookStats(stats.travelBooks);

          // Each row's thumbnail ring needs the trip's average score, and
          // the RPC returns only visit ids — so the reviews themselves are
          // still a follow-up fetch.
          setTrips(detected);
          const allVisitIds = [...new Set(detected.flatMap((t) => t.visitIds))];
          if (allVisitIds.length > 0) {
            const visits = await getVisitsByIds(allVisitIds, session.user.id);
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
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your collections.'))
        .finally(() => {
          setIsLoading(false);
          setHasLoadedOnce(true);
        });
    }, [session])
  );

  if (!hasLoadedOnce) return <PageLoader />;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Title stays constant. It used to change with the active mode
            ("Your boards" / "Your travel books"), which meant the page
            announced itself as whichever tab you happened to be on and gave
            no hint the other two existed. */}
        <View style={styles.gutter}>
          <ThemedText type="displaySerif">Your collections</ThemedText>

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
          headerAction={
            // Below the switcher, so it reads as an action for the mode
            // you're in rather than the page's whole purpose. Trips have no
            // create button — they're detected, not made.
            mode === 'trips' ? null : (
              <Button
                label={mode === 'boards' ? 'New board' : 'New travel book'}
                onPress={() => router.push(mode === 'boards' ? '/board/new' : '/travel-book/new')}
              />
            )
          }
          trips={trips}
          tripAverageRatings={tripAverageRatings}
          isLoading={isLoading}
          emptyBoardsMessage="No boards yet. Create one above, or save a visit to a board from the Search tab."
          emptyTravelBooksMessage="No travel books yet. Start one to keep a chronological log of a trip."
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
  // Applied here instead of safeArea's own paddingHorizontal — CollectionsList's
  // FlatList needs to render at safeArea's full (unclipped) width so
  // FeedRatingStamp's deliberate overflow past a row's right edge isn't
  // clipped at a narrower ancestor frame (same root cause/fix as the main
  // feed's ScrollView). CollectionsList insets its own controls/rows to
  // match via its own contentContainerStyle/gutter.
  gutter: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
});
