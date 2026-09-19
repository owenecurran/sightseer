import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { ConfirmDeleteModal } from '@/components/confirm-delete-modal';
import { RatingGlassBadgeGated } from '@/components/ui/rating-glass-badge-gated';
import { StretchText } from '@/components/ui/stretch-text';
import { ThemedText } from '@/components/themed-text';
import { InkBlot } from '@/components/ui/ink-blot';
import { OwnRatingLine } from '@/components/ui/own-rating-line';
import { TicketCard } from '@/components/ui/ticket-card';
import { Spacing, StickerAccents } from '@/constants/theme';
import { hashSeed } from '@/lib/seeded-random';
import type { BoardItem } from '@/lib/boards';

// The rating, printed in the ticket's torn-off stub.
//
// It used to hang off the row's bottom-right corner as a loose stamp, which
// needed the row to reserve text width for it (getStampTextReserve) and
// needed the stamp to escape the Swipeable that was clipping it. A ticket
// already has a place for exactly this: the stub behind the perforation is
// the part of a real ticket that carries the printed value.
const ROW_STAMP_SIZE = 44;

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
  // Selection mode, for a picker. When set, pressing a row CHOOSES it rather
  // than navigating to it — the same rows, doing the other obvious thing.
  onSelectItem?: (item: BoardItem) => void;
  selectedItemId?: string | null;
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
  onSelectItem,
  selectedItemId,
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
        const row = (
          <TicketCard
            seed={`board-item-${item.id}`}
            // Spread over the accent set by the item's own id, so a board is
            // a mixed stack of tickets rather than a column of one colour.
            // Hashed here — unlike the creation flow's four fixed cards,
            // which are a short list where a collision is visible — because
            // a board holds an arbitrary number of these and no hand-picked
            // order would survive the next thing added to it.
            accentIndex={hashSeed(`board-accent-${item.id}`) % StickerAccents.length}
            compact
            selected={selectedItemId != null && selectedItemId === item.id}
            onPress={
              onSelectItem
                ? () => onSelectItem(item)
                : () =>
                    isVisit
                      ? router.push({ pathname: '/visit/[id]', params: { id: item.visitId } })
                      : router.push({ pathname: '/place/[id]', params: { id: item.placeId } })
            }
            contentStyle={styles.rowBody}
            stub={
              hasStamp ? (
                <RatingGlassBadgeGated
                  rating={item.rating!}
                  size={ROW_STAMP_SIZE}
                  seed={item.id}
                />
              ) : undefined
            }>
            {onToggleCheck && (
              <Pressable onPress={() => onToggleCheck(item)} hitSlop={8}>
                <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
                  {isChecked && (
                    <InkBlot size={13} seed={`list-check-${item.id}`} color={StickerAccents[0]} />
                  )}
                </View>
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
                  {[item.stateCountry, item.rating == null ? 'Visited' : null, item.note].filter(Boolean).join(' · ')}
                </ThemedText>
              ) : (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {item.stateCountry ?? 'No review yet'}
                </ThemedText>
              )}
              {showOwnRating && (
                <OwnRatingLine rating={ownRating} />
              )}
            </View>
          </TicketCard>
        );

        return (
          // The stamp used to live out here, as a sibling of the row, because
          // Swipeable (wrapped around owner rows for the reveal-to-remove
          // action) clips its children — and it was clipping the stamp's
          // deliberate overflow past the row's right edge. Inside the ticket's
          // stub there is nothing to clip: the stub is part of the ticket.
          <View key={item.id}>
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
  // The ticket's own body, laid out as a row. The ticket supplies the
  // padding and the space the stub needs; this only decides the direction.
  rowBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  checkbox: {
    width: 24,
    height: 24,
    // Round and stamped, like every other "chosen" mark in the app.
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(234,231,207,0.35)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: StickerAccents[0],
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
