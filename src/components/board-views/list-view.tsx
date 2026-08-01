import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { BoardVisitItem } from '@/lib/boards';

type ListViewProps = {
  items: BoardVisitItem[];
  photoUrls: Record<string, string>;
  isOwner: boolean;
  onRemove: (itemId: string) => void;
};

// Today's only-ever-shipped board-detail layout, restyled from a full-width
// cover photo down to a compact row (small thumbnail + place + snippet) per
// the "list view" requirement — same data, denser presentation.
export function ListView({ items, photoUrls, isOwner, onRemove }: ListViewProps) {
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
                <ThemedText type="headline" numberOfLines={1}>
                  {item.placeName}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {item.rating.toFixed(1)} ★{item.note ? ` · ${item.note}` : ''}
                </ThemedText>
              </View>
              {isOwner && (
                <Pressable onPress={() => onRemove(item.id)} hitSlop={8}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Remove
                  </ThemedText>
                </Pressable>
              )}
            </ThemedView>
          </Pressable>
        );
      })}
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
});
