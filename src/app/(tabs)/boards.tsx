import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CollectionsSwitcher } from '@/components/collections-switcher';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/page-loader';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useTabFocusEffect } from '@/hooks/use-tab-pager';
import { useAuth } from '@/lib/auth-context';
import { getLatestReviewPhotoIds, listMyBoards } from '@/lib/boards';
import { getCoverViewUrls } from '@/lib/covers';
import type { Database } from '@/lib/database.types';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { listMyTravelBooks, type TravelBookListItem } from '@/lib/travel-books';

type BoardRow = Database['public']['Tables']['boards']['Row'];
type CollectionMode = 'boards' | 'travel_books';

export default function BoardsScreen() {
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const [mode, setMode] = useState<CollectionMode>('boards');
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [travelBooks, setTravelBooks] = useState<TravelBookListItem[]>([]);
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const scrollHandler = useHideOnScrollHandler();

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
          // Precedence: custom cover_photo_r2_key > explicit cover_photo_id
          // > most-recently-added item's photo.
          const boardsWithoutCover = myBoards.filter((b) => !b.cover_photo_id);
          const latestPhotoIdByBoard = await getLatestReviewPhotoIds(boardsWithoutCover.map((b) => b.id));
          const photoIdByBoard: Record<string, string> = { ...latestPhotoIdByBoard };
          for (const b of myBoards) {
            if (b.cover_photo_id) photoIdByBoard[b.id] = b.cover_photo_id;
          }
          const photoIds = Object.values(photoIdByBoard);
          const [photoUrls, customCoverUrls] = await Promise.all([
            photoIds.length > 0 ? getPhotoViewUrls(photoIds) : Promise.resolve({} as Record<string, string>),
            getCoverViewUrls(
              'boards',
              myBoards.filter((b) => b.cover_photo_r2_key).map((b) => b.id)
            ),
          ]);
          setThumbnailUrls({
            ...Object.fromEntries(
              Object.entries(photoIdByBoard)
                .map(([boardId, photoId]) => [boardId, photoUrls[photoId]])
                .filter(([, url]) => url != null)
            ),
            ...customCoverUrls,
          });
        }),
        listMyTravelBooks(session.user.id).then(async (myBooks) => {
          setTravelBooks(myBooks);
          const coverPhotoIds = myBooks.map((b) => b.cover_photo_id).filter((id): id is string => id != null);
          const [urls, customCoverUrls] = await Promise.all([
            coverPhotoIds.length > 0 ? getPhotoViewUrls(coverPhotoIds) : Promise.resolve({} as Record<string, string>),
            getCoverViewUrls(
              'travel_books',
              myBooks.filter((b) => b.cover_photo_r2_key).map((b) => b.id)
            ),
          ]);
          setCoverUrls({
            ...Object.fromEntries(
              myBooks
                .filter((b) => b.cover_photo_id && urls[b.cover_photo_id])
                .map((b) => [b.id, urls[b.cover_photo_id!]])
            ),
            ...customCoverUrls,
          });
        }),
      ])
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
        <ThemedText type="displaySerif">{mode === 'boards' ? 'Your boards' : 'Your travel books'}</ThemedText>

        <CollectionsSwitcher active={mode} onChange={setMode} />

        <Button
          label={mode === 'boards' ? 'New board' : 'New travel book'}
          onPress={() => router.push(mode === 'boards' ? '/board/new' : '/travel-book/new')}
        />

        {error && (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        )}

        {mode === 'boards' && !isLoading && boards.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            No boards yet. Create one above, or save a visit to a board from the Search tab.
          </ThemedText>
        )}
        {mode === 'travel_books' && !isLoading && travelBooks.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            No travel books yet. Start one to keep a chronological log of a trip.
          </ThemedText>
        )}

        {mode === 'boards' ? (
          <Animated.FlatList
            data={boards}
            keyExtractor={(item: BoardRow) => item.id}
            contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
            showsVerticalScrollIndicator={false}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            renderItem={({ item }: { item: BoardRow }) => (
              <Pressable
                onPress={() => router.push({ pathname: '/board/[id]', params: { id: item.id } })}
                style={({ pressed }) => pressed && styles.pressed}>
                <ThemedView type="backgroundElement" style={styles.boardRow}>
                  <View style={styles.boardRowLeading}>
                    <ThemedText type="headline">{item.name}</ThemedText>
                    {item.is_private && (
                      <ThemedText type="sectionLabel" themeColor="textSecondary">
                        Private
                      </ThemedText>
                    )}
                  </View>
                  <View style={styles.boardRowTrailing}>
                    {thumbnailUrls[item.id] && (
                      <Image source={{ uri: thumbnailUrls[item.id] }} style={styles.thumbnail} />
                    )}
                    <ThemedText type="headline">›</ThemedText>
                  </View>
                </ThemedView>
              </Pressable>
            )}
          />
        ) : (
          <Animated.FlatList
            data={travelBooks}
            keyExtractor={(item: TravelBookListItem) => item.id}
            contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
            showsVerticalScrollIndicator={false}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            renderItem={({ item }: { item: TravelBookListItem }) => (
              <Pressable
                onPress={() => router.push({ pathname: '/travel-book/[id]', params: { id: item.id } })}
                style={({ pressed }) => pressed && styles.pressed}>
                <ThemedView type="backgroundElement" style={styles.boardRow}>
                  <View style={styles.boardRowLeading}>
                    <ThemedText type="headline">{item.title}</ThemedText>
                    {item.locationName && (
                      <ThemedText type="small" themeColor="sage">
                        {item.locationName}
                      </ThemedText>
                    )}
                    {item.description && (
                      <ThemedText type="small" themeColor="textSecondary">
                        {item.description}
                      </ThemedText>
                    )}
                  </View>
                  {coverUrls[item.id] && <Image source={{ uri: coverUrls[item.id] }} style={styles.thumbnail} />}
                </ThemedView>
              </Pressable>
            )}
          />
        )}
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
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
    gap: Spacing.three,
  },
  // paddingBottom belongs on the FlatList's own scrollable content, not the
  // non-scrolling safeArea wrapper — see index.tsx's identical fix/comment.
  list: {
    gap: Spacing.two,
  },
  boardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  boardRowLeading: {
    flex: 1,
    gap: Spacing.half,
  },
  boardRowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
});
