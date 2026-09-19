import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { OwnRatingLine } from '@/components/ui/own-rating-line';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VisitCard } from '@/components/visit-card';
import { Spacing } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import type { BoardVisitItem } from '@/lib/boards';
import { getVisitsByIds, likeVisit, unlikeVisit, type FeedVisit } from '@/lib/feed';
import { getPhotoThumbUrls } from '@/lib/photo-view';
import { shareText } from '@/lib/share';

type FullReviewsViewProps = {
  items: BoardVisitItem[];
  photoUrls: Record<string, string>;
  viewerId?: string;
  // "Your rating: X" read-only overlay for places the viewer has
  // independently reviewed — see src/lib/own-ratings.ts.
  ownRatings?: Record<string, number>;
  // Selection mode, for a picker. The postcard's own surface is spoken for —
  // it turns over, its photograph zooms, two taps like it — so choosing one
  // cannot be a tap on the card. It gets an explicit button underneath
  // instead, which is the only affordance here that does not collide with
  // something the card already does.
  onSelectVisit?: (visitId: string) => void;
  selectedVisitId?: string | null;
};

// One full review per row, as the same postcard the feed draws.
//
// It used to be a hand-assembled lookalike — FeedCardHeaderText over a
// PhotoGrid — which is how a board's reviews and the feed's drifted into two
// different-looking things. There is one review card in this app now, and
// this is it.
//
// The hydration happens HERE rather than in the two screens that use this
// view (board/[id].tsx and reviews.tsx). A BoardVisitItem is a deliberately
// narrow shape — no likes, tags, comments, tagged users or card stock — and
// a postcard needs all of it. Fetching in the view means a board only pays
// for that when someone actually switches to this mode, which is the right
// trade for a view that is one of five and not the default. It also means
// both screens got the new card without either of them changing.
export function FullReviewsView({
  items,
  photoUrls,
  viewerId,
  ownRatings,
  onSelectVisit,
  selectedVisitId,
}: FullReviewsViewProps) {
  const bottomInset = useBottomTabInset();
  const scrollHandler = useHideOnScrollHandler();

  // Keyed by visit id. Rows render as soon as their visit lands rather than
  // waiting for the whole board.
  const [visits, setVisits] = useState<Record<string, FeedVisit>>({});
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [deleted, setDeleted] = useState<Set<string>>(new Set());

  const visitIds = items.map((item) => item.visitId).join(',');

  useEffect(() => {
    if (!viewerId || visitIds.length === 0) return;
    let cancelled = false;
    const ids = visitIds.split(',');

    void (async () => {
      try {
        const hydrated = await getVisitsByIds(ids, viewerId);
        if (cancelled) return;
        setVisits(Object.fromEntries(hydrated.map((visit) => [visit.id, visit])));

        // The small copies, for the reviews that render a grid. Worth having
        // now that the backlog actually has them: before the backfill every
        // photo was a full original and this call returned nothing useful.
        const gridIds = hydrated.flatMap((visit) =>
          visit.photoIds.length > 1 ? visit.photoIds : [],
        );
        if (gridIds.length === 0) return;
        const thumbs = await getPhotoThumbUrls(gridIds);
        if (!cancelled) setThumbUrls(thumbs);
      } catch {
        // A board that cannot hydrate still shows its rows' photographs from
        // the urls the screen already passed down — see the fallback below.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visitIds, viewerId]);

  const handleToggleLike = useCallback(
    async (visit: FeedVisit) => {
      if (!viewerId) return;
      const nowLiked = !visit.isLikedByMe;
      // Optimistic, and reverted on failure — the same bargain the feed
      // makes, so a like feels identical wherever it is pressed.
      setVisits((current) => ({
        ...current,
        [visit.id]: {
          ...visit,
          isLikedByMe: nowLiked,
          likeCount: visit.likeCount + (nowLiked ? 1 : -1),
        },
      }));
      try {
        if (nowLiked) await likeVisit(viewerId, visit.id);
        else await unlikeVisit(viewerId, visit.id);
      } catch {
        setVisits((current) => ({ ...current, [visit.id]: visit }));
      }
    },
    [viewerId],
  );

  const visible = items.filter((item) => !deleted.has(item.visitId));

  return (
    <Animated.FlatList
      data={visible}
      keyExtractor={(item: BoardVisitItem) => item.id}
      style={styles.flex}
      contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
      showsVerticalScrollIndicator={false}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      // Each row draws at least one rating stamp, and every stamp is a Skia
      // canvas holding a GL surface. FlatList's default window is 21
      // screens' worth, which on a long board mounts far more live GL
      // contexts than anything on screen needs — the same load that faulted
      // the host OpenGL driver on the harmony and place screens.
      initialNumToRender={5}
      maxToRenderPerBatch={5}
      windowSize={5}
      renderItem={({ item }: { item: BoardVisitItem }) => {
        const ownRating = ownRatings?.[item.placeId];
        const showOwnRating = ownRating != null && item.authorId !== viewerId;
        const visit = visits[item.visitId];

        return (
          <View style={styles.card}>
            {/* No author line of our own: the card draws its own byline,
                avatar and all, and two of them read as a bug. */}
            {visit ? (
              <VisitCard
                visit={visit}
                photoUrls={photoUrls}
                photoThumbUrls={thumbUrls}
                isOwner={visit.user_id === viewerId}
                isCopied={false}
                onToggleLike={() => void handleToggleLike(visit)}
                onShare={() => {
                  void shareText(`${visit.placeName}\n${visit.note ?? ''}`.trim());
                }}
                onDeleted={() =>
                  setDeleted((current) => new Set(current).add(item.visitId))
                }
              />
            ) : (
              // Before its visit has hydrated. A blank of roughly a card's
              // height, so the list does not jump as rows fill in.
              <View style={styles.placeholder} />
            )}
            {showOwnRating && (
              <View style={styles.ownRating}>
                <OwnRatingLine rating={ownRating} />
              </View>
            )}
            {onSelectVisit && visit && (
              <Pressable onPress={() => onSelectVisit(visit.id)}>
                <ThemedView
                  type={selectedVisitId === visit.id ? 'backgroundSelected' : 'backgroundElement'}
                  style={styles.selectButton}>
                  <ThemedText
                    type="small"
                    themeColor={selectedVisitId === visit.id ? 'text' : 'textSecondary'}>
                    {selectedVisitId === visit.id ? 'Featured ✓' : 'Feature this one'}
                  </ThemedText>
                </ThemedView>
              </Pressable>
            )}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  list: {
    gap: Spacing.four,
    paddingTop: Spacing.three,
  },
  card: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  ownRating: {
    paddingHorizontal: Spacing.one,
  },
  selectButton: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
  },
  // Two thirds of the card's width, which is about what a landscape postcard
  // stands at — near enough that a row settling into place does not shove
  // the list around.
  placeholder: {
    width: '100%',
    aspectRatio: 1.5,
  },
});
