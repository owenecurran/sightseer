import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';

import { ConfirmDeleteModal } from '@/components/confirm-delete-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { RatingGlassBadgeGated } from '@/components/ui/rating-glass-badge-gated';
import { StretchText } from '@/components/ui/stretch-text';
import { OwnRatingLine } from '@/components/ui/own-rating-line';
import { Spacing } from '@/constants/theme';
import type { BoardItem } from '@/lib/boards';

type RankedListViewProps = {
  items: BoardItem[];
  photoUrls: Record<string, string>;
  onReorder: (items: BoardItem[]) => void;
  onRemove: (itemId: string) => void;
  isOwner: boolean;
  // Personal progress checklist — only rendered when both are provided (the
  // viewer owns or has saved this board, see board/[id].tsx). Read-only
  // order is preserved for non-owners regardless — checking off an item
  // never lets it be dragged.
  viewerId?: string;
  checkedItemIds?: Set<string>;
  onToggleCheck?: (item: BoardItem) => void;
  // "Your rating: X" read-only overlay for places the viewer has
  // independently reviewed — see src/lib/own-ratings.ts.
  ownRatings?: Record<string, number>;
};

// A ranked, numbered variant of ListView, reusing board_items.position (the
// same mechanism every other board view already orders by) — press and hold
// a row to drag it, same interaction as edit-profile.tsx's prompt/section
// reordering. Rows can be visit-backed OR bare places (see BoardItem in
// src/lib/boards.ts) — a curated ranked list doesn't require every entry to
// already be a logged review.
export function RankedListView({
  items,
  photoUrls,
  onReorder,
  onRemove,
  isOwner,
  viewerId,
  checkedItemIds,
  onToggleCheck,
  ownRatings,
}: RankedListViewProps) {
  const [confirmingItemId, setConfirmingItemId] = useState<string | null>(null);

  const renderItem = useCallback(
    ({ item, getIndex, drag, isActive }: RenderItemParams<BoardItem>) => {
      const isVisit = item.kind === 'visit';
      const thumbnailUrl = isVisit && item.photoIds[0] ? photoUrls[item.photoIds[0]] : undefined;
      const isChecked = checkedItemIds?.has(item.id) ?? false;
      const ownRating = ownRatings?.[item.placeId];
      const showOwnRating = ownRating != null && !(isVisit && item.authorId === viewerId);
      return (
        <ScaleDecorator>
          <Pressable
            onPress={() =>
              isVisit
                ? router.push({ pathname: '/visit/[id]', params: { id: item.visitId } })
                : router.push({ pathname: '/place/[id]', params: { id: item.placeId } })
            }
            onLongPress={isOwner ? drag : undefined}
            disabled={isActive}
            delayLongPress={150}>
            <ThemedView type={isActive ? 'backgroundSelected' : 'backgroundElement'} style={styles.row}>
              <ThemedText type="headline" style={styles.rank}>
                {(getIndex() ?? 0) + 1}
              </ThemedText>
              {onToggleCheck && (
                <Pressable onPress={() => onToggleCheck(item)} hitSlop={8}>
                  <ThemedView type={isChecked ? 'backgroundSelected' : 'backgroundElement'} style={styles.checkbox}>
                    {isChecked && <ThemedText type="smallBold">✓</ThemedText>}
                  </ThemedView>
                </Pressable>
              )}
              {thumbnailUrl ? (
                <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} />
              ) : (
                <View style={styles.thumbnailPlaceholder} />
              )}
              <View style={styles.info}>
                <StretchText type="headline" fill>
                  {item.placeName}
                </StretchText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {isVisit
                    ? [item.stateCountry, item.rating == null ? 'Visited' : null].filter(Boolean).join(' · ')
                    : (item.stateCountry ?? 'No review yet')}
                </ThemedText>
                {showOwnRating && (
                  <OwnRatingLine rating={ownRating} />
                )}
              </View>
              {isVisit && item.rating != null && <RatingGlassBadgeGated rating={item.rating} size={32} />}
              {isOwner && (
                <Pressable onPress={() => setConfirmingItemId(item.id)} hitSlop={8}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Remove
                  </ThemedText>
                </Pressable>
              )}
            </ThemedView>
          </Pressable>
        </ScaleDecorator>
      );
    },
    [isOwner, photoUrls, viewerId, checkedItemIds, onToggleCheck, ownRatings]
  );

  return (
    <View style={styles.list}>
      {isOwner && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Press and hold a row to drag it into a new rank.
        </ThemedText>
      )}
      <DraggableFlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onDragEnd={({ data }) => onReorder(data)}
        scrollEnabled={false}
        contentContainerStyle={styles.list}
      />

      <ConfirmDeleteModal
        visible={confirmingItemId != null}
        message="Remove this from the ranked list?"
        confirmLabel="Remove"
        onConfirm={() => {
          if (confirmingItemId) onRemove(confirmingItemId);
          setConfirmingItemId(null);
        }}
        onCancel={() => setConfirmingItemId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  hint: {
    marginBottom: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  rank: {
    minWidth: 32,
    textAlign: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: Spacing.one,
    borderWidth: 1.5,
    borderColor: 'rgba(234,231,207,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: Spacing.two,
  },
  thumbnailPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(234,231,207,0.08)',
  },
  info: {
    flex: 1,
    gap: Spacing.half,
  },
});
