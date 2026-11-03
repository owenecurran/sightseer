import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDeleteModal } from '@/components/confirm-delete-modal';
import { BackLink } from '@/components/ui/back-link';
import { ThemedText } from '@/components/themed-text';
import { CheckboxRow } from '@/components/ui/checkbox-row';
import { ThemedView } from '@/components/themed-view';
import { PageLoader } from '@/components/ui/page-loader';
import { SettingsRow } from '@/components/ui/settings-row';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { deleteBoard, setBoardFeatured, updateBoardListStyle, updateBoardPrivacy } from '@/lib/boards';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

type BoardRow = Database['public']['Tables']['boards']['Row'];
type ListStyle = 'collection' | 'ranked';

const LIST_STYLES: { key: ListStyle; label: string; description: string }[] = [
  { key: 'collection', label: 'Collection', description: 'A regular saved list, in whatever order items were added.' },
  { key: 'ranked', label: 'Ranked', description: 'A numbered ranking you can drag to reorder. Opens to the ranked view.' },
];

export default function BoardSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile } = useAuth();
  const [board, setBoard] = useState<BoardRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      setError(null);
      (async () => {
        try {
          const { data, error: boardError } = await supabase.from('boards').select('*').eq('id', id).single();
          if (boardError) throw boardError;
          setBoard(data);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not load this board.');
        } finally {
          setHasLoadedOnce(true);
        }
      })();
    }, [id])
  );

  async function handleSetListStyle(listStyle: ListStyle) {
    if (!board) return;
    const previous = board.list_style;
    setBoard({ ...board, list_style: listStyle });
    try {
      await updateBoardListStyle(board.id, listStyle);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the ranking type.');
      setBoard((prev) => (prev ? { ...prev, list_style: previous } : prev));
    }
  }

  async function handleTogglePrivate() {
    if (!board) return;
    const next = !board.is_private;
    setBoard({ ...board, is_private: next });
    try {
      await updateBoardPrivacy(board.id, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update privacy.');
      setBoard((prev) => (prev ? { ...prev, is_private: !next } : prev));
    }
  }

  async function handleToggleFeatured() {
    if (!board) return;
    const next = !board.is_featured;
    setBoard({ ...board, is_featured: next });
    try {
      await setBoardFeatured(board.id, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update featured status.');
      setBoard((prev) => (prev ? { ...prev, is_featured: !next } : prev));
    }
  }

  async function handleDelete() {
    if (!board) return;
    setIsDeleting(true);
    try {
      await deleteBoard(board.id);
      setIsConfirmingDelete(false);
      // Out past the board's own page as well as this one, which has nothing
      // behind it now, to whichever tab this was opened from.
      //
      // Not then switched to the Boards tab. Doing that as well left the
      // pager showing Home with the Boards icon lit (seen on Android), and
      // from there tapping Boards did nothing, because a tap on the lit icon
      // counts as a re-tap. Without it the pager stays where it was.
      if (router.canDismiss()) router.dismissAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this board.');
      setIsConfirmingDelete(false);
      setIsDeleting(false);
    }
  }

  if (!hasLoadedOnce) return <PageLoader />;

  const isOwner = Boolean(session && board && session.user.id === board.user_id);
  const isAdmin = Boolean(profile?.is_admin);

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <BackLink seed="settings" />

          <ThemedText type="displaySerif">Board settings</ThemedText>

          {!isOwner && !isAdmin ? (
            <ThemedText type="caption">
              Only this board's owner can change its settings.
            </ThemedText>
          ) : (
            <>
              {isOwner && (
                <>
                  <View style={styles.group}>
                    <ThemedText type="sectionLabel">Ranking</ThemedText>
                    {LIST_STYLES.map((style) => (
                      <Pressable key={style.key} onPress={() => handleSetListStyle(style.key)}>
                        <ThemedView
                          type={board?.list_style === style.key ? 'backgroundSelected' : 'backgroundElement'}
                          style={styles.option}>
                          <ThemedText type="headline">{style.label}</ThemedText>
                          <ThemedText type="caption">
                            {style.description}
                          </ThemedText>
                        </ThemedView>
                      </Pressable>
                    ))}
                  </View>

                  <CheckboxRow
                    accentIndex={3}
                    checked={board?.is_private ?? false}
                    label="Private: only visible to people who can already see my content"
                    onPress={handleTogglePrivate}
                  />

                  {/* There was no way to delete a board anywhere in the app.
                      Owner only: an admin can feature a board but it is not
                      theirs to remove. */}
                  <SettingsRow
                    label="Delete board"
                    description="Removes the board. The reviews saved to it stay where they are."
                    tone="danger"
                    onPress={() => setIsConfirmingDelete(true)}
                  />
                </>
              )}

              {isAdmin && (
                <CheckboxRow
                  accentIndex={1}
                  checked={board?.is_featured ?? false}
                  label="Featured: shown on everyone's Discover page"
                  onPress={handleToggleFeatured}
                />
              )}
            </>
          )}

          {error && (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          )}
        </View>
      </SafeAreaView>

      <ConfirmDeleteModal
        visible={isConfirmingDelete}
        message="Delete this board? The reviews saved to it are not deleted, only the board. This cannot be undone."
        isConfirming={isDeleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setIsConfirmingDelete(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    width: '100%',
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
  },
  group: {
    gap: Spacing.two,
  },
  option: {
    gap: Spacing.half,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
});
