import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { ConfirmDeleteModal } from '@/components/confirm-delete-modal';
import { StretchText } from '@/components/ui/stretch-text';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { BoardItem } from '@/lib/boards';

type ListViewProps = {
  items: BoardItem[];
  photoUrls: Record<string, string>;
  isOwner: boolean;
  onRemove: (itemId: string) => void;
  removeMessage?: string;
  // Personal progress checklist — only rendered when both are provided (the
  // viewer owns or has saved this board, see board/[id].tsx).
  viewerId?: string;
  checkedItemIds?: Set<string>;
  onToggleCheck?: (item: BoardItem) => void;
  // "Your rating: X" read-only overlay for places the viewer has
  // independently reviewed — see src/lib/own-ratings.ts.
  ownRatings?: Record<string, number>;
};

// Today's only-ever-shipped board-detail layout, restyled from a full-width
// cover photo down to a compact row (small thumbnail + place + snippet) per
// the "list view" requirement — same data, denser presentation. Removal used
// to be a persistent three-dot button in this row, but its fixed width was
// squeezing the title's available space, forcing StretchText to compress it
// more aggressively than necessary. Swipe-left-to-reveal instead: same
// capability, no permanently-reserved row space.
export function ListView({
  items,
  photoUrls,
  isOwner,
  onRemove,
  removeMessage,
  viewerId,
  checkedItemIds,
  onToggleCheck,
  ownRatings,
}: ListViewProps) {
  const [confirmingItemId, setConfirmingItemId] = useState<string | null>(null);

  return (
    <View style={styles.list}>
      {items.map((item) => {
        const isVisit = item.kind === 'visit';
        const thumbnailUrl = isVisit && item.photoIds[0] ? photoUrls[item.photoIds[0]] : undefined;
        const isChecked = checkedItemIds?.has(item.id) ?? false;
        const ownRating = ownRatings?.[item.placeId];
        const showOwnRating = ownRating != null && !(isVisit && item.authorId === viewerId);
        const row = (
          <Pressable
            key={item.id}
            onPress={() =>
              isVisit
                ? router.push({ pathname: '/visit/[id]', params: { id: item.visitId } })
                : router.push({ pathname: '/place/[id]', params: { id: item.placeId } })
            }>
            <ThemedView type="backgroundElement" style={styles.row}>
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
                <StretchText type="headline" fill>{item.placeName}</StretchText>
                {isVisit ? (
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {item.stateCountry ? `${item.stateCountry} · ` : ''}
                    {item.rating != null ? `${item.rating.toFixed(1)} ★` : 'Visited'}
                    {item.note ? ` · ${item.note}` : ''}
                  </ThemedText>
                ) : (
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {item.stateCountry ?? 'No review yet'}
                  </ThemedText>
                )}
                {showOwnRating && (
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    Your rating: {ownRating.toFixed(1)} ★
                  </ThemedText>
                )}
              </View>
            </ThemedView>
          </Pressable>
        );

        if (!isOwner) return row;

        return (
          <Swipeable
            key={item.id}
            renderRightActions={() => (
              <Pressable onPress={() => setConfirmingItemId(item.id)} style={styles.removeAction}>
                <ThemedText type="smallBold" themeColor="background">
                  Remove
                </ThemedText>
              </Pressable>
            )}
            overshootRight={false}>
            {row}
          </Swipeable>
        );
      })}

      <ConfirmDeleteModal
        visible={confirmingItemId != null}
        message={removeMessage ?? 'Remove this?'}
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
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
  removeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    backgroundColor: '#c0392b',
    borderRadius: Spacing.three,
    marginLeft: Spacing.two,
  },
});
