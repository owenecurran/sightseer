import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/page-loader';
import { TextField } from '@/components/ui/text-field';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useTabFocusEffect } from '@/hooks/use-tab-pager';
import { useAuth } from '@/lib/auth-context';
import { createBoard, getLatestReviewPhotoIds, listMyBoards } from '@/lib/boards';
import type { Database } from '@/lib/database.types';
import { getPhotoViewUrls } from '@/lib/photo-view';

type BoardRow = Database['public']['Tables']['boards']['Row'];

export default function BoardsScreen() {
  const { session } = useAuth();
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [newBoardName, setNewBoardName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const scrollHandler = useHideOnScrollHandler();

  useTabFocusEffect(
    3,
    useCallback(() => {
      if (!session) return;
      setIsLoading(true);
      setError(null);
      listMyBoards(session.user.id)
        .then(async (myBoards) => {
          setBoards(myBoards);
          const latestPhotoIdByBoard = await getLatestReviewPhotoIds(myBoards.map((b) => b.id));
          const photoIds = Object.values(latestPhotoIdByBoard);
          const photoUrls = photoIds.length > 0 ? await getPhotoViewUrls(photoIds) : {};
          setThumbnailUrls(
            Object.fromEntries(
              Object.entries(latestPhotoIdByBoard)
                .map(([boardId, photoId]) => [boardId, photoUrls[photoId]])
                .filter(([, url]) => url != null)
            )
          );
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not load boards.'))
        .finally(() => {
          setIsLoading(false);
          setHasLoadedOnce(true);
        });
    }, [session])
  );

  async function handleCreate() {
    if (!session || !newBoardName.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      const board = await createBoard({ userId: session.user.id, name: newBoardName.trim() });
      setBoards((prev) => [board, ...prev]);
      setNewBoardName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that board.');
    } finally {
      setIsCreating(false);
    }
  }

  if (!hasLoadedOnce) return <PageLoader />;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="displaySerif">Your boards</ThemedText>

        <Pressable onPress={() => router.push('/travel-books')}>
          <ThemedText type="small" themeColor="sage">
            Travel books ›
          </ThemedText>
        </Pressable>

        <ThemedView style={styles.newBoardRow}>
          <TextField
            placeholder="New board name"
            value={newBoardName}
            onChangeText={setNewBoardName}
            style={styles.newBoardInput}
          />
          <Button
            label="Create"
            onPress={handleCreate}
            loading={isCreating}
            disabled={!newBoardName.trim()}
          />
        </ThemedView>

        {error && (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        )}

        {!isLoading && boards.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            No boards yet. Create one above, or save a visit to a board from the Search tab.
          </ThemedText>
        )}

        <Animated.FlatList
          data={boards}
          keyExtractor={(item: BoardRow) => item.id}
          contentContainerStyle={styles.list}
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
  newBoardRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  newBoardInput: {
    flex: 1,
  },
  // paddingBottom belongs on the FlatList's own scrollable content, not the
  // non-scrolling safeArea wrapper — see index.tsx's identical fix/comment.
  list: {
    gap: Spacing.two,
    paddingBottom: BottomTabInset,
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
