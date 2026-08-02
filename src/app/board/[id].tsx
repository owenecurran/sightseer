import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BoardMapView } from '@/components/board-views/map-view';
import { FullReviewsView } from '@/components/board-views/full-reviews-view';
import { ImagesGridView } from '@/components/board-views/images-grid-view';
import { ListView } from '@/components/board-views/list-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PageLoader } from '@/components/ui/page-loader';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { getBoardItems, setBoardCoverPhoto, type BoardVisitItem } from '@/lib/boards';
import type { Database } from '@/lib/database.types';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { supabase } from '@/lib/supabase';

type BoardRow = Database['public']['Tables']['boards']['Row'];

type ViewMode = 'list' | 'full' | 'images' | 'map';

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: 'list', label: 'List' },
  { key: 'full', label: 'Full reviews' },
  { key: 'images', label: 'Images' },
  { key: 'map', label: 'Map' },
];

export default function BoardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const [board, setBoard] = useState<BoardRow | null>(null);
  const [items, setItems] = useState<BoardVisitItem[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const scrollHandler = useHideOnScrollHandler();

  useEffect(() => {
    if (!id) return;
    (async () => {
      setError(null);
      try {
        const [{ data: boardData, error: boardError }, boardItems] = await Promise.all([
          supabase.from('boards').select('*').eq('id', id).single(),
          getBoardItems(id),
        ]);
        if (boardError) throw boardError;
        setBoard(boardData);
        setItems(boardItems);

        const photoIds = boardItems.flatMap((item) => item.photoIds);
        if (photoIds.length > 0) {
          setPhotoUrls(await getPhotoViewUrls(photoIds));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load this board.');
      } finally {
        setHasLoadedOnce(true);
      }
    })();
  }, [id]);

  async function handleRemove(itemId: string) {
    setError(null);
    const { error: deleteError } = await supabase.from('board_items').delete().eq('id', itemId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  }

  async function handleSetCover(photoId: string) {
    if (!board) return;
    setError(null);
    try {
      await setBoardCoverPhoto(board.id, photoId);
      setBoard({ ...board, cover_photo_id: photoId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set that cover photo.');
    }
  }

  const isOwner = Boolean(session && board && session.user.id === board.user_id);

  if (!hasLoadedOnce) return <PageLoader />;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <ThemedText type="link">← Back</ThemedText>
          </Pressable>

          <ThemedText type="headline">{board?.name ?? 'Board'}</ThemedText>
          {board?.description && (
            <ThemedText type="small" themeColor="textSecondary">
              {board.description}
            </ThemedText>
          )}

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          <View style={styles.modeRow}>
            {VIEW_MODES.map((mode) => (
              <Pressable key={mode.key} onPress={() => setViewMode(mode.key)}>
                <ThemedView type={viewMode === mode.key ? 'backgroundSelected' : 'backgroundElement'} style={styles.modeChip}>
                  <ThemedText type="small" themeColor={viewMode === mode.key ? 'text' : 'textSecondary'}>
                    {mode.label}
                  </ThemedText>
                </ThemedView>
              </Pressable>
            ))}
          </View>
        </View>

        {items.length === 0 ? (
          <View style={styles.emptyState}>
            <ThemedText type="small" themeColor="textSecondary">
              No reviews saved to this board yet.
            </ThemedText>
          </View>
        ) : viewMode === 'full' ? (
          <FullReviewsView items={items} photoUrls={photoUrls} />
        ) : viewMode === 'map' ? (
          <BoardMapView items={items} />
        ) : (
          <Animated.ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
            showsVerticalScrollIndicator={false}
            onScroll={scrollHandler}
            scrollEventThrottle={16}>
            {viewMode === 'images' ? (
              <ImagesGridView
                items={items}
                photoUrls={photoUrls}
                isOwner={isOwner}
                coverPhotoId={board?.cover_photo_id}
                onSetCover={handleSetCover}
              />
            ) : (
              <ListView
                items={items}
                photoUrls={photoUrls}
                isOwner={isOwner}
                onRemove={handleRemove}
                removeMessage="Remove this from the board?"
              />
            )}
          </Animated.ScrollView>
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
    width: '100%',
    paddingTop: Spacing.four + TopTabInset,
  },
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  modeChip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  scrollContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
});
