import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { LoadableImage } from '@/components/ui/loadable-image';
import { Spacing } from '@/constants/theme';
import type { BoardVisitItem } from '@/lib/boards';

type ImagesGridViewProps = {
  items: BoardVisitItem[];
  photoUrls: Record<string, string>;
};

const COLUMNS = 3;
const GAP = 2;

// "Grid-like structure that can be used to give a vibe of what the person
// is looking for" — a uniform Instagram-Explore-style grid (not variable-
// height masonry, which Instagram's own grid isn't either), flattening
// every item's photos into one continuous scroll.
export function ImagesGridView({ items, photoUrls }: ImagesGridViewProps) {
  const tiles = items.flatMap((item) =>
    item.photoIds
      .map((photoId) => photoUrls[photoId])
      .filter((url): url is string => url != null)
      .map((url) => ({ url, visitId: item.visitId, key: `${item.id}-${url}` }))
  );

  if (tiles.length === 0) {
    return (
      <View style={styles.empty}>
        <ThemedText type="small" themeColor="textSecondary">
          None of these reviews have photos yet.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {tiles.map((tile) => (
        <Pressable
          key={tile.key}
          style={styles.tile}
          onPress={() => router.push({ pathname: '/visit/[id]', params: { id: tile.visitId } })}>
          <LoadableImage source={{ uri: tile.url }} style={styles.image} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  tile: {
    width: `${100 / COLUMNS}%`,
    aspectRatio: 1,
    padding: GAP / 2,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
