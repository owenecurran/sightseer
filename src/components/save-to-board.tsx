import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import {
  createBoard,
  getBoardIdsContainingVisit,
  listMyBoards,
  removeVisitFromBoard,
  saveVisitToBoard,
} from '@/lib/boards';
import type { Database } from '@/lib/database.types';

type BoardRow = Database['public']['Tables']['boards']['Row'];

export function SaveToBoard({ visitId }: { visitId: string }) {
  const { session } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [savedBoardIds, setSavedBoardIds] = useState<Set<string>>(new Set());
  const [newBoardName, setNewBoardName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isExpanded || !session) return;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const myBoards = await listMyBoards(session.user.id);
        setBoards(myBoards);
        setSavedBoardIds(await getBoardIdsContainingVisit(myBoards.map((b) => b.id), visitId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load boards.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isExpanded, session, visitId]);

  async function handleToggle(boardId: string) {
    setError(null);
    const isSaved = savedBoardIds.has(boardId);
    try {
      if (isSaved) {
        await removeVisitFromBoard(boardId, visitId);
        setSavedBoardIds((prev) => {
          const next = new Set(prev);
          next.delete(boardId);
          return next;
        });
      } else {
        await saveVisitToBoard(boardId, visitId);
        setSavedBoardIds((prev) => new Set(prev).add(boardId));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update that board.');
    }
  }

  async function handleCreateAndSave() {
    if (!session || !newBoardName.trim()) return;
    setError(null);
    setIsLoading(true);
    try {
      const board = await createBoard({ userId: session.user.id, name: newBoardName.trim() });
      await saveVisitToBoard(board.id, visitId);
      setBoards((prev) => [board, ...prev]);
      setSavedBoardIds((prev) => new Set(prev).add(board.id));
      setNewBoardName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that board.');
    } finally {
      setIsLoading(false);
    }
  }

  if (!isExpanded) {
    return (
      <Button label="Save to a board" variant="secondary" onPress={() => setIsExpanded(true)} />
    );
  }

  return (
    <ThemedView style={styles.container}>
      {error && (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      )}

      {boards.map((board) => {
        const isSaved = savedBoardIds.has(board.id);
        return (
          <Pressable key={board.id} onPress={() => handleToggle(board.id)}>
            <ThemedView type="backgroundSelected" style={styles.boardRow}>
              <ThemedText type="default">{board.name}</ThemedText>
              <ThemedText type="small" themeColor={isSaved ? 'text' : 'textSecondary'}>
                {isSaved ? 'Saved ✓' : 'Save'}
              </ThemedText>
            </ThemedView>
          </Pressable>
        );
      })}

      {isLoading && <ThemedText type="small">Loading…</ThemedText>}

      <ThemedView style={styles.newBoardRow}>
        <TextField
          placeholder="New board name"
          value={newBoardName}
          onChangeText={setNewBoardName}
          style={styles.newBoardInput}
        />
        <Button label="Create & save" onPress={handleCreateAndSave} disabled={!newBoardName.trim()} />
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  boardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  newBoardRow: {
    gap: Spacing.two,
  },
  newBoardInput: {
    flex: 1,
  },
});
