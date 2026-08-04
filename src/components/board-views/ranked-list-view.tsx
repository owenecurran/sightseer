import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';

import { ConfirmDeleteModal } from '@/components/confirm-delete-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { StretchText } from '@/components/ui/stretch-text';
import { Spacing } from '@/constants/theme';
import type { BoardItem } from '@/lib/boards';

type RankedListViewProps = {
  items: BoardItem[];
  photoUrls: Record<string, string>;
  onReorder: (items: BoardItem[]) => void;
  onRemove: (itemId: string) => void;
  isOwner: boolean;
};

// A ranked, numbered variant of ListView, reusing board_items.position (the
// same mechanism every other board view already orders by) — press and hold
// a row to drag it, same interaction as edit-profile.tsx's prompt/section
// reordering. Rows can be visit-backed OR bare places (see BoardItem in
// src/lib/boards.ts) — a curated ranked list doesn't require every entry to
// already be a logged review.
export function RankedListView({ items, photoUrls, onReorder, onRemove, isOwner }: RankedListViewProps) {
  const [confirmingItemId, setConfirmingItemId] = useState<string | null>(null);

  const renderItem = useCallback(
    ({ item, getIndex, drag, isActive }: RenderItemParams<BoardItem>) => {
      const isVisit = item.kind === 'visit';
      const thumbnailUrl = isVisit && item.photoIds[0] ? photoUrls[item.photoIds[0]] : undefined;
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
                    ? `${item.stateCountry ? `${item.stateCountry} · ` : ''}${item.rating != null ? `${item.rating.toFixed(1)} ★` : 'Visited'}`
                    : (item.stateCountry ?? 'No review yet')}
                </ThemedText>
              </View>
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
    [isOwner, photoUrls]
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
