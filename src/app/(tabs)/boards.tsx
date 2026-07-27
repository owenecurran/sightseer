import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
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
  const [isCreating, setIsCreating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      setIsLoading(true);
      setError(null);
      listMyBoards(session.user.id)
        .then(setBoards)
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not load boards.'))
        .finally(() => setIsLoading(false));
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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">Your boards</ThemedText>

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

        <FlatList
          data={boards}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/board/[id]', params: { id: item.id } })}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="backgroundElement" style={styles.boardRow}>
                <ThemedText type="default">{item.name}</ThemedText>
                {item.is_private && (
                  <ThemedText type="small" themeColor="textSecondary">
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
    paddingBottom: BottomTabInset,
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
  list: {
    gap: Spacing.two,
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
