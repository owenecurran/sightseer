import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LoadableImage } from '@/components/ui/loadable-image';
import { Fold } from '@/components/ui/unfold';
import { Spacing } from '@/constants/theme';
import type { BoardVisitItem } from '@/lib/boards';

type ImagesGridViewProps = {
  items: BoardVisitItem[];
  photoUrls: Record<string, string>;
  // Selection mode, for a picker — see ListView's own pair.
  onSelectVisit?: (visitId: string) => void;
  isOwner?: boolean;
  coverPhotoId?: string | null;
  onSetCover?: (photoId: string) => void;
};

const COLUMNS = 3;
const GAP = 2;

// "Grid-like structure that can be used to give a vibe of what the person
// is looking for" — a uniform Instagram-Explore-style grid (not variable-
// height masonry, which Instagram's own grid isn't either), flattening
// every item's photos into one continuous scroll.
export function ImagesGridView({
  items,
  photoUrls,
  isOwner,
  coverPhotoId,
  onSetCover,
  onSelectVisit,
}: ImagesGridViewProps) {
  const tiles = items.flatMap((item) =>
    item.photoIds
      .filter((photoId) => photoUrls[photoId] != null)
      .map((photoId) => ({ photoId, url: photoUrls[photoId], visitId: item.visitId, key: `${item.id}-${photoId}` }))
  );

  if (tiles.length === 0) {
    return (
      <View style={styles.empty}>
        <ThemedText type="caption">
          None of these reviews have photos yet.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {tiles.map((tile) => (
        <Fold key={tile.key} style={styles.tileSlot}>
          <Pressable
            style={styles.tile}
            onPress={
              onSelectVisit
                ? () => onSelectVisit(tile.visitId)
                : () => router.push({ pathname: '/visit/[id]', params: { id: tile.visitId } })
            }>
            <LoadableImage source={{ uri: tile.url }} style={styles.image} />
            {isOwner && onSetCover && (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  onSetCover(tile.photoId);
                }}
                hitSlop={4}
                style={styles.coverButton}>
                <ThemedView type={coverPhotoId === tile.photoId ? 'backgroundSelected' : 'backgroundElement'} style={styles.coverBadge}>
                  <ThemedText type="small">{coverPhotoId === tile.photoId ? 'Cover ✓' : 'Set as cover'}</ThemedText>
                </ThemedView>
              </Pressable>
            )}
          </Pressable>
        </Fold>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // NO `gap` HERE, deliberately. The gutter is the tiles' own padding, and
    // a gap as well is not a doubled gutter but a broken grid: three tiles at
    // 100/3% each already come to exactly 100%, so any gap between them puts
    // the row over the line width and the third tile wraps. The symptom is a
    // three-column grid rendering two across, which is what it did.
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  // The grid item is the tile's fold (a panel of the review picker's
  // unfold, a plain View anywhere else), so its share of the row is on that.
  tileSlot: {
    // Percent, so the row divides exactly however wide the screen is. Half a
    // gutter on every side of every tile makes a full GAP between neighbours
    // and half of one against the grid's own edges, which is the usual
    // Instagram-grid trade: the alternative keeps the outer edge flush but
    // needs the container measured first, for one pixel nobody can see.
    width: `${100 / COLUMNS}%`,
  },
  tile: {
    aspectRatio: 1,
    padding: GAP / 2,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  coverButton: {
    position: 'absolute',
    bottom: Spacing.one,
    left: Spacing.one,
    right: Spacing.one,
  },
  coverBadge: {
    paddingVertical: 2,
    paddingHorizontal: Spacing.one,
    borderRadius: Spacing.one,
    alignItems: 'center',
  },
});
