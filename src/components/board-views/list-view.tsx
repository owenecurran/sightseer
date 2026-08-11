import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { ConfirmDeleteModal } from '@/components/confirm-delete-modal';
import { FeedRatingStamp, getStampTextReserve } from '@/components/ui/feed-rating-stamp';
import { StretchText } from '@/components/ui/stretch-text';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { BoardItem } from '@/lib/boards';

// Same compact corner-stamp size collections-list.tsx's board/travel-book
// rows use — this row is the same kind of compact list item, so it gets the
// same "postage stamp on a corner" treatment instead of the plain inline
// badge every other board-view component here used to share.
const ROW_STAMP_SIZE = 40;

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
        const hasStamp = isVisit && item.rating != null;
        const stampTextReserve = hasStamp ? getStampTextReserve(item.id, ROW_STAMP_SIZE) : 0;
        const row = (
          <Pressable
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
                <View style={stampTextReserve > 0 && { paddingRight: stampTextReserve }}>
                  <StretchText type="headline" fill>{item.placeName}</StretchText>
                </View>
                {isVisit ? (
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {[item.stateCountry, item.rating == null ? 'Visited' : null, item.note].filter(Boolean).join(' · ')}
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

        return (
          // The stamp lives here, as a sibling of the swipeable/plain row —
          // not nested inside it — specifically because Swipeable (only
          // wrapped around owner rows, for the reveal-to-remove action)
          // clips its children to hide that action offscreen until swiped,
          // which was also silently clipping the stamp's own deliberate
          // overflow past the row's right edge. Confirmed live: non-owner
          // rows (no Swipeable) never had this problem, only "Your reviews"
          // did. position:'relative' here (not on `row` itself anymore) is
          // what the stamp now anchors against.
          <View key={item.id} style={styles.rowWrap}>
            {isOwner ? (
              <Swipeable
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
            ) : (
              row
            )}
            {hasStamp && <FeedRatingStamp rating={item.rating!} seed={item.id} canSeep={false} size={ROW_STAMP_SIZE} />}
          </View>
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
  // position:'relative' — FeedRatingStamp positions itself absolutely
  // against this wrapper's own bottom-right corner (see the map() callback's
  // own comment for why it lives out here, one level above `row`/Swipeable,
  // instead of inside `row` like collections-list.tsx's simpler rows can).
  rowWrap: {
    position: 'relative',
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
