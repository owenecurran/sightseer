import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ActionSticker } from '@/components/ui/action-sticker';
import { ThemedView } from '@/components/themed-view';
import { Fold, Unfold } from '@/components/ui/unfold';
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
  // Lets VisitActionsRow size this to match the row's other icons exactly
  // — standalone call sites (review-form.tsx, after saving a visit) keep
  // Shared with the rest of the action row — see ActionSticker.
  accentIndex?: number;
};

export function SaveToBoard({
  visitId,
  isOwnerOrTagged,
  accentIndex = 0,
}: SaveToBoardProps) {
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
      <ActionSticker
        icon="bookmark-outline"
        accentIndex={accentIndex}
        onPress={() => setIsOpen(true)}
        accessibilityLabel="Save to a board"
      />

      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
        <View style={styles.overlay}>
          <Unfold style={styles.sheet}>
            <Fold style={styles.header}>
              <ThemedText type="displaySerif">Add to</ThemedText>
              <Pressable onPress={() => setIsOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </Fold>

            {error && (
              <Fold>
                <ThemedText type="small" themeColor="danger">
                  {error}
                </ThemedText>
              </Fold>
            )}

            <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
              <View style={styles.section}>
                <Fold>
                  <ThemedText type="meta">Boards</ThemedText>
                </Fold>
                {boards.map((board) => {
                  const isSaved = savedBoardIds.has(board.id);
                  return (
                    <Fold key={board.id}>
                      <Pressable onPress={() => handleToggleBoard(board.id)}>
                        <ThemedView type="backgroundSelected" style={styles.row}>
                          <ThemedText type="small">{board.name}</ThemedText>
                          <ThemedText type="action" themeColor={isSaved ? 'text' : 'textSecondary'}>
                            {isSaved ? 'Saved ✓' : 'Save'}
                          </ThemedText>
                        </ThemedView>
                      </Pressable>
                    </Fold>
                  );
                })}

                <Fold style={styles.newBoardRow}>
                  <TextField
                    placeholder="New board name"
                    value={newBoardName}
                    onChangeText={setNewBoardName}
                    style={styles.newBoardInput}
                  />
                  <Button label="Create" onPress={handleCreateAndSave} disabled={!newBoardName.trim()} />
                </Fold>
              </View>

              {isOwnerOrTagged && (
                <View style={styles.section}>
                  <Fold>
                    <ThemedText type="meta">Travel books</ThemedText>
                  </Fold>
                  {travelBooks.length === 0 && (
                    <Fold>
                      <ThemedText type="caption">
                        You don't have any travel books yet.
                      </ThemedText>
                    </Fold>
                  )}
                  {travelBooks.map((book) => {
                    const isSaved = savedTravelBookIds.has(book.id);
                    return (
                      <Fold key={book.id}>
                        <Pressable onPress={() => handleToggleTravelBook(book.id)}>
                          <ThemedView type="backgroundSelected" style={styles.row}>
                            <ThemedText type="small">{book.title}</ThemedText>
                            <ThemedText type="action" themeColor={isSaved ? 'text' : 'textSecondary'}>
                              {isSaved ? 'Added ✓' : 'Add'}
                            </ThemedText>
                          </ThemedView>
                        </Pressable>
                      </Fold>
                    );
                  })}
                </View>
              )}

              {isLoading && (
                <Fold>
                  <ThemedText type="small">Loading…</ThemedText>
                </Fold>
              )}
            </ScrollView>
          </Unfold>
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
  // A percentage cap works here because the overlay this sits in has a
  // definite height to take it of; the scroll view inside shrinks to it.
  sheet: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    padding: Spacing.four,
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
