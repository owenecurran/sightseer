import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ConfirmDeleteModal } from '@/components/confirm-delete-modal';
import { StretchText } from '@/components/ui/stretch-text';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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
// the "list view" requirement — same data, denser presentation.
export function ListView({ items, photoUrls, isOwner, onRemove, removeMessage }: ListViewProps) {
  const theme = useTheme();
  const [confirmingItemId, setConfirmingItemId] = useState<string | null>(null);

  return (
    <View style={styles.list}>
      {items.map((item) => {
        const thumbnailUrl = item.photoIds[0] ? photoUrls[item.photoIds[0]] : undefined;
        return (
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
                <StretchText type="headline">{item.placeName}</StretchText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {item.rating.toFixed(1)} ★{item.note ? ` · ${item.note}` : ''}
                </ThemedText>
              </View>
              {isOwner && (
                <Pressable
                  onPress={() => setConfirmingItemId(item.id)}
                  hitSlop={12}
                  style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}>
                  <Ionicons name="ellipsis-horizontal" size={20} color={theme.textSecondary} />
                </Pressable>
              )}
            </ThemedView>
          </Pressable>
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
  menuButton: {
    padding: Spacing.two,
  },
  pressed: {
    opacity: 0.5,
  },
});
