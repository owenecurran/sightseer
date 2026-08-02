import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import {
  createBoard,
  getBoardIdsContainingVisit,
  listMyBoards,
  removeVisitFromBoard,
  saveVisitToBoard,
} from '@/lib/boards';
import type { Database } from '@/lib/database.types';
import {
  addVisitToTravelBook,
  getTravelBookIdsContainingVisit,
  listMyTravelBooks,
  removeVisitFromTravelBookByVisit,
  type TravelBookListItem,
} from '@/lib/travel-books';

type BoardRow = Database['public']['Tables']['boards']['Row'];

type SaveToBoardProps = {
  visitId: string;
  // Travel books are only offered when the viewer owns this visit or is
  // tagged in it — the same eligibility rule travel_book_items' insert RLS
  // enforces (see getEligibleVisitsForTravelBook).
  isOwnerOrTagged: boolean;
};

export function SaveToBoard({ visitId, isOwnerOrTagged }: SaveToBoardProps) {
  const theme = useTheme();
  const { session } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [savedBoardIds, setSavedBoardIds] = useState<Set<string>>(new Set());
  const [newBoardName, setNewBoardName] = useState('');
  const [travelBooks, setTravelBooks] = useState<TravelBookListItem[]>([]);
  const [savedTravelBookIds, setSavedTravelBookIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !session) return;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const myBoards = await listMyBoards(session.user.id);
        setBoards(myBoards);
        setSavedBoardIds(await getBoardIdsContainingVisit(myBoards.map((b) => b.id), visitId));

        if (isOwnerOrTagged) {
          const myTravelBooks = await listMyTravelBooks(session.user.id);
          setTravelBooks(myTravelBooks);
          setSavedTravelBookIds(await getTravelBookIdsContainingVisit(myTravelBooks.map((b) => b.id), visitId));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load your boards.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isOpen, session, visitId, isOwnerOrTagged]);

  async function handleToggleBoard(boardId: string) {
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

  async function handleToggleTravelBook(bookId: string) {
    setError(null);
    const isSaved = savedTravelBookIds.has(bookId);
    try {
      if (isSaved) {
        await removeVisitFromTravelBookByVisit(bookId, visitId);
        setSavedTravelBookIds((prev) => {
          const next = new Set(prev);
          next.delete(bookId);
          return next;
        });
      } else {
        if (!session) return;
        await addVisitToTravelBook(bookId, visitId, session.user.id);
        setSavedTravelBookIds((prev) => new Set(prev).add(bookId));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update that travel book.');
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

  return (
    <>
      <Pressable
        onPress={() => setIsOpen(true)}
        hitSlop={12}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}>
        <Ionicons name="add-circle-outline" size={26} color={theme.text} />
      </Pressable>

      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
        <View style={styles.overlay}>
          <ThemedView type="background" style={styles.sheet}>
            <View style={styles.header}>
              <ThemedText type="headline">Add to</ThemedText>
              <Pressable onPress={() => setIsOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>

            {error && (
              <ThemedText type="small" themeColor="textSecondary">
                {error}
              </ThemedText>
            )}

            <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
              <View style={styles.section}>
                <ThemedText type="sectionLabel">Boards</ThemedText>
                {boards.map((board) => {
                  const isSaved = savedBoardIds.has(board.id);
                  return (
                    <Pressable key={board.id} onPress={() => handleToggleBoard(board.id)}>
                      <ThemedView type="backgroundSelected" style={styles.row}>
                        <ThemedText type="default">{board.name}</ThemedText>
                        <ThemedText type="small" themeColor={isSaved ? 'text' : 'textSecondary'}>
                          {isSaved ? 'Saved ✓' : 'Save'}
                        </ThemedText>
                      </ThemedView>
                    </Pressable>
                  );
                })}

                <View style={styles.newBoardRow}>
                  <TextField
                    placeholder="New board name"
                    value={newBoardName}
                    onChangeText={setNewBoardName}
                    style={styles.newBoardInput}
                  />
                  <Button label="Create" onPress={handleCreateAndSave} disabled={!newBoardName.trim()} />
                </View>
              </View>

              {isOwnerOrTagged && (
                <View style={styles.section}>
                  <ThemedText type="sectionLabel">Travel books</ThemedText>
                  {travelBooks.length === 0 && (
                    <ThemedText type="small" themeColor="textSecondary">
                      You don't have any travel books yet.
                    </ThemedText>
                  )}
                  {travelBooks.map((book) => {
                    const isSaved = savedTravelBookIds.has(book.id);
                    return (
                      <Pressable key={book.id} onPress={() => handleToggleTravelBook(book.id)}>
                        <ThemedView type="backgroundSelected" style={styles.row}>
                          <ThemedText type="default">{book.title}</ThemedText>
                          <ThemedText type="small" themeColor={isSaved ? 'text' : 'textSecondary'}>
                            {isSaved ? 'Added ✓' : 'Add'}
                          </ThemedText>
                        </ThemedView>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {isLoading && <ThemedText type="small">Loading…</ThemedText>}
            </ScrollView>
          </ThemedView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    alignSelf: 'flex-start',
  },
  pressed: {
    opacity: 0.5,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    padding: Spacing.four,
    borderRadius: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scroll: {
    flexGrow: 0,
  },
  section: {
    gap: Spacing.two,
    marginBottom: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  newBoardRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  newBoardInput: {
    flex: 1,
  },
});
