import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { BoardMapView } from '@/components/board-views/map-view';
import { FullReviewsView } from '@/components/board-views/full-reviews-view';
import { ImagesGridView } from '@/components/board-views/images-grid-view';
import { ListView } from '@/components/board-views/list-view';
import {
  DEFAULT_REVIEW_SORT,
  ReviewsSortControl,
  sortReviewItems,
  type ReviewSortMode,
} from '@/components/reviews-sort-control';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import type { BoardVisitItem } from '@/lib/boards';
import { useCollectionViewMode, type CollectionViewMode } from '@/lib/view-mode';

const VIEW_MODES: { key: CollectionViewMode; label: string }[] = [
  { key: 'full', label: 'Postcards' },
  { key: 'list', label: 'List' },
  { key: 'images', label: 'Images' },
  { key: 'map', label: 'Map' },
];

// Selecting from a map is not a thing this offers: a pin is a place, not one
// particular review, and a map with no way to pick from it is worse than a
// map that is simply not on the menu while picking.
const PICKER_MODES = VIEW_MODES.filter((mode) => mode.key !== 'map');

type ReviewBrowserProps = {
  items: BoardVisitItem[];
  photoUrls: Record<string, string>;
  viewerId?: string;
  isOwner: boolean;
  onRemove?: (visitId: string) => void;
  removeMessage?: string;
  // Turns the whole thing into a picker: the same four ways of looking at the
  // same reviews, with each one choosing rather than navigating.
  onSelectVisit?: (visitId: string) => void;
  selectedVisitId?: string | null;
  contentPaddingBottom?: number;
};

// One way of looking at a set of reviews, wherever they came from.
//
// This is the "Latest reviews" screen's body, lifted out so the prompt editor
// can feature a review by browsing the same thing rather than by picking from
// a row of name chips. The chips had no ordering, no photographs and no way
// to see what you were about to put on your profile, which for a screen whose
// entire job is choosing something to SHOW is the wrong end of the trade.
//
// Which mode it opens on is remembered across the app and defaults to
// postcards — see view-mode.ts.
export function ReviewBrowser({
  items,
  photoUrls,
  viewerId,
  isOwner,
  onRemove,
  removeMessage,
  onSelectVisit,
  selectedVisitId,
  contentPaddingBottom = 0,
}: ReviewBrowserProps) {
  const picking = onSelectVisit != null;
  const modes = picking ? PICKER_MODES : VIEW_MODES;
  const [viewMode, setViewMode] = useCollectionViewMode(modes.map((mode) => mode.key));
  const [sortMode, setSortMode] = useState<ReviewSortMode>(DEFAULT_REVIEW_SORT);
  const scrollHandler = useHideOnScrollHandler();

  // Sorted here rather than by each view, so every way of looking at these
  // reviews is looking at the SAME order — a list and a grid that disagree
  // about what comes first are two different answers to one question.
  //
  // The map is left out of that: it has no order to express, and re-sorting
  // the pins would just rebuild the markers for nothing.
  const ordered = useMemo(() => sortReviewItems(items, sortMode), [items, sortMode]);

  const chips = (
    <View style={styles.controlsRow}>
      <View style={styles.modeRow}>
        {modes.map((mode) => (
          <Pressable key={mode.key} onPress={() => setViewMode(mode.key)}>
            <ThemedView
              type={viewMode === mode.key ? 'backgroundSelected' : 'backgroundElement'}
              style={styles.modeChip}>
              <ThemedText
                type="small"
                themeColor={viewMode === mode.key ? 'text' : 'textSecondary'}>
                {mode.label}
              </ThemedText>
            </ThemedView>
          </Pressable>
        ))}
      </View>
      {/* Not offered on the map, which has no order to sort into. */}
      {viewMode !== 'map' && <ReviewsSortControl active={sortMode} onChange={setSortMode} />}
    </View>
  );

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <ThemedText type="small" themeColor="textSecondary">
          No reviews yet.
        </ThemedText>
      </View>
    );
  }

  // FullReviewsView and BoardMapView bring their own scrolling — a FlatList
  // and a map respectively — so they are handed the chips above and left to
  // fill the rest themselves rather than being put inside another scroller.
  if (viewMode === 'full') {
    return (
      <View style={styles.flex}>
        {chips}
        <FullReviewsView
          items={ordered}
          photoUrls={photoUrls}
          viewerId={viewerId}
          onSelectVisit={onSelectVisit}
          selectedVisitId={selectedVisitId}
        />
      </View>
    );
  }

  if (viewMode === 'map') {
    return (
      <View style={styles.flex}>
        {chips}
        <BoardMapView items={items} />
      </View>
    );
  }

  const body =
    viewMode === 'images' ? (
      <ImagesGridView items={ordered} photoUrls={photoUrls} onSelectVisit={onSelectVisit} />
    ) : (
      <ListView
        items={ordered}
        photoUrls={photoUrls}
        isOwner={isOwner && !picking}
        onRemove={onRemove ?? (() => {})}
        removeMessage={removeMessage}
        onSelectItem={
          onSelectVisit
            ? (item) => {
                // A board can hold bare places as well as reviews; only a
                // review has something to feature.
                if (item.kind === 'visit') onSelectVisit(item.visitId);
              }
            : undefined
        }
        selectedItemId={
          // ListView keys selection on its own item id; the caller only knows
          // the visit. Matched back through the items it was given.
          selectedVisitId != null
            ? (ordered.find((item) => item.visitId === selectedVisitId)?.id ?? null)
            : null
        }
      />
    );

  return (
    <View style={styles.flex}>
      {chips}
      <Animated.ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: contentPaddingBottom }]}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}>
        {body}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    flexShrink: 1,
  },
  modeChip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
  },
  scrollContent: {
    paddingTop: Spacing.one,
  },
  empty: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
  },
});
