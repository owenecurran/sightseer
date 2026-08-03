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
import type { BoardVisitItem } from '@/lib/boards';

type ListViewProps = {
  items: BoardVisitItem[];
  photoUrls: Record<string, string>;
  isOwner: boolean;
  onRemove: (itemId: string) => void;
  removeMessage?: string;
};

// Today's only-ever-shipped board-detail layout, restyled from a full-width
// cover photo down to a compact row (small thumbnail + place + snippet) per
// the "list view" requirement — same data, denser presentation. Removal used
// to be a persistent three-dot button in this row, but its fixed width was
// squeezing the title's available space, forcing StretchText to compress it
// more aggressively than necessary. Swipe-left-to-reveal instead: same
// capability, no permanently-reserved row space.
export function ListView({ items, photoUrls, isOwner, onRemove, removeMessage }: ListViewProps) {
  const [confirmingItemId, setConfirmingItemId] = useState<string | null>(null);

  return (
    <View style={styles.list}>
      {items.map((item) => {
        const thumbnailUrl = item.photoIds[0] ? photoUrls[item.photoIds[0]] : undefined;
        const row = (
          <Pressable
            key={item.id}
            onPress={() => router.push({ pathname: '/visit/[id]', params: { id: item.visitId } })}>
            <ThemedView type="backgroundElement" style={styles.row}>
              {thumbnailUrl ? (
                <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} />
              ) : (
                <View style={styles.thumbnailPlaceholder} />
              )}
              <View style={styles.info}>
                <StretchText type="headline" fill>{item.placeName}</StretchText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {item.rating.toFixed(1)} ★{item.note ? ` · ${item.note}` : ''}
                </ThemedText>
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
