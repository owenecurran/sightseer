import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
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
import { createBoard, listMyBoards } from '@/lib/boards';
import type { Database } from '@/lib/database.types';

type BoardRow = Database['public']['Tables']['boards']['Row'];

export default function BoardsScreen() {
  const { session } = useAuth();
  const [boards, setBoards] = useState<BoardRow[]>([]);
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
        .then(setBoards)
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
                <ThemedText type="headline">{item.name}</ThemedText>
                {item.is_private && (
                  <ThemedText type="sectionLabel" themeColor="textSecondary">
                    Private
                  </ThemedText>
                )}
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
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
