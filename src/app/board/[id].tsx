import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackLink } from '@/components/ui/back-link';
import { BoardMapView } from '@/components/board-views/map-view';
import { FullReviewsView } from '@/components/board-views/full-reviews-view';
import { ImagesGridView } from '@/components/board-views/images-grid-view';
import { ListView } from '@/components/board-views/list-view';
import { RankedListView } from '@/components/board-views/ranked-list-view';
import { SaveCollectionButton } from '@/components/save-collection-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LoadableImage } from '@/components/ui/loadable-image';
import { PageLoader } from '@/components/ui/page-loader';
import { StretchText } from '@/components/ui/stretch-text';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import {
  checkBoardItem,
  getBoardItems,
  getMyCheckedItemIds,
  reorderBoardItems,
  setBoardCoverPhoto,
  uncheckBoardItem,
  type BoardItem,
  type BoardVisitItem,
} from '@/lib/boards';
import { getCoverViewUrls, uploadCoverPhoto } from '@/lib/covers';
import type { Database } from '@/lib/database.types';
import { pickImageFromLibrary } from '@/lib/image-picker';
import { getOwnRatingsForPlaces } from '@/lib/own-ratings';
import { getPhotoViewUrls } from '@/lib/photo-view';
import {
  getSavedBoardState,
  saveBoardForUpdates,
  setSavedBoardNotify,
  unsaveBoardForUpdates,
} from '@/lib/saved-collections';
import { supabase } from '@/lib/supabase';

type BoardRow = Database['public']['Tables']['boards']['Row'];

type ViewMode = 'list' | 'ranked' | 'full' | 'images' | 'map';

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: 'list', label: 'List' },
  { key: 'ranked', label: 'Ranked' },
  { key: 'full', label: 'Full reviews' },
  { key: 'images', label: 'Images' },
  { key: 'map', label: 'Map' },
];

export default function BoardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const [board, setBoard] = useState<BoardRow | null>(null);
  const [items, setItems] = useState<BoardItem[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [customCoverUrl, setCustomCoverUrl] = useState<string | undefined>();
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [savedState, setSavedState] = useState<{ notifyOnNewItems: boolean } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [checkedItemIds, setCheckedItemIds] = useState<Set<string>>(new Set());
  const [ownRatings, setOwnRatings] = useState<Record<string, number>>({});
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
        // Default the view mode from the board's own list_style on first
        // load only — a later re-fetch (e.g. session identity change)
        // shouldn't stomp a manual view switch the viewer already made. But
        // if the board isn't (or no longer is) ranked, the Ranked chip isn't
        // shown at all (see VIEW_MODES filtering below) — always fall back
        // off of it regardless of hasLoadedOnce, so a board switched back to
        // 'collection' from settings never gets stuck showing a view with no
        // way to reach via the now-hidden chip.
        if (!hasLoadedOnce) {
          setViewMode(boardData.list_style === 'ranked' ? 'ranked' : 'list');
        } else {
          setViewMode((prev) => (prev === 'ranked' && boardData.list_style !== 'ranked' ? 'list' : prev));
        }

        const photoIds = boardItems.flatMap((item) => (item.kind === 'visit' ? item.photoIds : []));
        if (photoIds.length > 0) {
          setPhotoUrls(await getPhotoViewUrls(photoIds));
        }
        if (boardData.cover_photo_r2_key) {
          const urls = await getCoverViewUrls('boards', [boardData.id]);
          setCustomCoverUrl(urls[boardData.id]);
        }

        let currentSavedState: { notifyOnNewItems: boolean } | null = null;
        if (session && session.user.id !== boardData.user_id) {
          currentSavedState = await getSavedBoardState(session.user.id, boardData.id);
          setSavedState(currentSavedState);
        }

        // Checklist is only for boards saved from someone else — a board's
        // own owner already knows what's on it, and the "your rating"
        // indicator below covers the "have I actually done this?" signal on
        // their own board instead.
        if (session && currentSavedState != null) {
          setCheckedItemIds(await getMyCheckedItemIds(session.user.id, boardData.id));
        }
        if (session) {
          const placeIds = boardItems.map((item) => item.placeId);
          setOwnRatings(await getOwnRatingsForPlaces(session.user.id, placeIds));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load this board.');
      } finally {
        setHasLoadedOnce(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session]);

  async function handleRemove(itemId: string) {
    setError(null);
    const { error: deleteError } = await supabase.from('board_items').delete().eq('id', itemId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  }

  // Optimistic reorder — DraggableFlatList's own onDragEnd already gives the
  // final order immediately, no need to wait on the round-trip before
  // reflecting it.
  async function handleReorder(orderedItems: BoardItem[]) {
    setItems(orderedItems);
    setError(null);
    try {
      await reorderBoardItems(orderedItems.map((item) => item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that order.');
    }
  }

  async function handleSave() {
    if (!session || !board) return;
    setIsSaving(true);
    setError(null);
    try {
      await saveBoardForUpdates(session.user.id, board.id, false);
      setSavedState({ notifyOnNewItems: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that board.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUnsave() {
    if (!session || !board) return;
    setIsSaving(true);
    setError(null);
    try {
      await unsaveBoardForUpdates(session.user.id, board.id);
      setSavedState(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unsave that board.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleNotify() {
    if (!session || !board || !savedState) return;
    const next = !savedState.notifyOnNewItems;
    setSavedState({ notifyOnNewItems: next });
    try {
      await setSavedBoardNotify(session.user.id, board.id, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update notifications.');
    }
  }

  async function handleToggleCheck(item: BoardItem) {
    if (!session || !board) return;
    const isChecked = checkedItemIds.has(item.id);
    setCheckedItemIds((prev) => {
      const next = new Set(prev);
      if (isChecked) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
    try {
      if (isChecked) await uncheckBoardItem(session.user.id, item.id);
      else await checkBoardItem(session.user.id, board.id, item.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update that checklist item.');
      setCheckedItemIds((prev) => {
        const next = new Set(prev);
        if (isChecked) next.add(item.id);
        else next.delete(item.id);
        return next;
      });
    }
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

  async function handleUploadCover() {
    if (!board) return;
    const result = await pickImageFromLibrary();
    if (result === 'denied') {
      setError('Photo library permission is required.');
      return;
    }
    if (!result) return;
    setError(null);
    setIsUploadingCover(true);
    try {
      const r2Key = await uploadCoverPhoto({ table: 'boards', id: board.id, uri: result.uri, mimeType: result.mimeType });
      setBoard({ ...board, cover_photo_r2_key: r2Key });
      const urls = await getCoverViewUrls('boards', [board.id]);
      setCustomCoverUrl(urls[board.id]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that cover photo.');
    } finally {
      setIsUploadingCover(false);
    }
  }

  const isOwner = Boolean(session && board && session.user.id === board.user_id);
  const visitItems = items.filter((item): item is BoardVisitItem => item.kind === 'visit');
  // Checklist only applies to boards saved from someone else — see the load
  // effect's matching comment.
  const canCheck = savedState != null;

  if (!hasLoadedOnce) return <PageLoader />;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <BackLink seed="[id]" />

          {customCoverUrl && (
            <View style={styles.coverWrap}>
              <LoadableImage source={{ uri: customCoverUrl }} style={styles.cover} />
            </View>
          )}

          <StretchText type="headline">{board?.name ?? 'Board'}</StretchText>
          {board?.description && (
            <ThemedText type="small" themeColor="textSecondary">
              {board.description}
            </ThemedText>
          )}

          {isOwner && (
            <Pressable onPress={handleUploadCover} disabled={isUploadingCover}>
              <ThemedText type="small" themeColor="sage">
                {isUploadingCover ? 'Uploading…' : customCoverUrl ? 'Change cover photo' : 'Add a cover photo'}
              </ThemedText>
            </Pressable>
          )}

          {isOwner && board && (
            <Pressable onPress={() => router.push({ pathname: '/board/[id]/settings', params: { id: board.id } })}>
              <ThemedText type="small" themeColor="sage">
                Board settings
              </ThemedText>
            </Pressable>
          )}

          {!isOwner && session && (
            <SaveCollectionButton
              isSaved={savedState != null}
              notifyOnNewItems={savedState?.notifyOnNewItems ?? false}
              isLoading={isSaving}
              onSave={handleSave}
              onUnsave={handleUnsave}
              onToggleNotify={handleToggleNotify}
            />
          )}

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          <View style={styles.modeRow}>
            {VIEW_MODES.filter((mode) => mode.key !== 'ranked' || board?.list_style === 'ranked').map((mode) => (
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
          <FullReviewsView items={visitItems} photoUrls={photoUrls} viewerId={session?.user.id} ownRatings={ownRatings} />
        ) : viewMode === 'map' ? (
          <BoardMapView items={visitItems} />
        ) : (
          <Animated.ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
            showsVerticalScrollIndicator={false}
            onScroll={scrollHandler}
            scrollEventThrottle={16}>
            {viewMode === 'images' ? (
              <ImagesGridView
                items={visitItems}
                photoUrls={photoUrls}
                isOwner={isOwner}
                coverPhotoId={board?.cover_photo_id}
                onSetCover={handleSetCover}
              />
            ) : viewMode === 'ranked' ? (
              <RankedListView
                items={items}
                photoUrls={photoUrls}
                onReorder={handleReorder}
                onRemove={handleRemove}
                isOwner={isOwner}
                viewerId={session?.user.id}
                checkedItemIds={canCheck ? checkedItemIds : undefined}
                onToggleCheck={canCheck ? handleToggleCheck : undefined}
                ownRatings={ownRatings}
              />
            ) : (
              <ListView
                items={items}
                photoUrls={photoUrls}
                isOwner={isOwner}
                onRemove={handleRemove}
                removeMessage="Remove this from the board?"
                viewerId={session?.user.id}
                checkedItemIds={canCheck ? checkedItemIds : undefined}
                onToggleCheck={canCheck ? handleToggleCheck : undefined}
                ownRatings={ownRatings}
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
  coverWrap: {
    width: '100%',
    height: 160,
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  cover: {
    width: '100%',
    height: '100%',
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
