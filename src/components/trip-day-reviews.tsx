import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VisitCard } from '@/components/visit-card';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { FeedVisit, TripDay } from '@/lib/feed';

type TripDayReviewsProps = {
  day: TripDay;
  dayNumber: number;
  photoUrls: Record<string, string>;
  avatarUrls: Record<string, string>;
  viewerId?: string;
  copiedVisitId: string | null;
  onToggleLike: (visit: FeedVisit) => void;
  onShare: (visit: FeedVisit) => void;
  onVisitDeleted: (visitId: string) => void;
};

// How far the incoming card slides from, and how far the cards behind peek
// out. Small on purpose — this is a shuffle, not a page turn.
const SHUFFLE_TRAVEL = 26;
const BEHIND_OFFSET = 8;
const BEHIND_TILT_DEGREES = 2;
const SHUFFLE_MS = 220;
// Arrow buttons sit ON the card's left/right edges rather than under it, so
// stepping through never moves the control you're tapping.
const ARROW_SIZE = 56;
const ARROW_ICON_SIZE = 28;

function formatDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  // Local noon — a bare 'YYYY-MM-DD' parsed directly is UTC midnight, which
  // renders as the previous day west of Greenwich.
  return new Date(year, month - 1, day, 12).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// One day of a trip as a stack of cards you step through with buttons.
//
// Deliberately no swipe gesture: a horizontal scroller nested inside the
// tab PagerView kept handing the drag back to it at the ends (which threw
// you onto the Search tab), and any fix for that competed with the feed's
// own vertical scrolling. Buttons have neither problem.
//
// Nothing here clips: each card is the real feed VisitCard at its own
// natural height, so tall reviews aren't cropped and the rating stamp is
// free to lean off the card's corner the way it does everywhere else.
export function TripDayReviews({
  day,
  dayNumber,
  photoUrls,
  avatarUrls,
  viewerId,
  copiedVisitId,
  onToggleLike,
  onShare,
  onVisitDeleted,
}: TripDayReviewsProps) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  // Where to pin the arrows vertically: the centre of the ACTIVE card's
  // photo block. Tracked per card rather than captured once — with the
  // container height no longer locked the box already resizes to each
  // review, so freezing the arrows at the first card's photo position would
  // just strand them off-centre on every other one. Null until a card with
  // photos lays out, in which case they centre on the card instead.
  const [arrowAnchor, setArrowAnchor] = useState<number | null>(null);
  const travel = useSharedValue(0);
  const fade = useSharedValue(1);

  const reviewCount = day.visits.length;
  // Clamped: a delete can shrink the day out from under the current index.
  const activeIndex = Math.min(index, reviewCount - 1);
  const activeVisit = day.visits[activeIndex];

  function handlePhotoLayout(offsetY: number, height: number) {
    if (height <= 0) return;
    const next = offsetY + height / 2;
    setArrowAnchor((current) => (current != null && Math.abs(current - next) < 1 ? current : next));
  }

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: travel.value }],
    opacity: fade.value,
  }));

  // The new card is swapped in immediately and animated *in* from the side,
  // rather than animating the old one out first and swapping at the
  // midpoint — one timing per property, no sequencing or callbacks to get
  // out of step if it's tapped rapidly.
  function step(delta: number) {
    if (reviewCount < 2) return;
    setIndex((current) => (current + delta + reviewCount) % reviewCount);
    travel.value = delta * SHUFFLE_TRAVEL;
    travel.value = withTiming(0, { duration: SHUFFLE_MS });
    fade.value = 0.4;
    fade.value = withTiming(1, { duration: SHUFFLE_MS });
  }

  if (!activeVisit) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.dayHeader}>
        <ThemedText type="small" themeColor="textSecondary">
          Day {dayNumber} · {formatDate(day.date)}
        </ThemedText>
        {reviewCount > 1 && (
          <ThemedText type="small" themeColor="textSecondary">
            {activeIndex + 1} / {reviewCount}
          </ThemedText>
        )}
      </View>

      {/* The cards behind are plain tinted rectangles, not real reviews —
          they only ever show as a sliver of edge, so rendering extra live
          VisitCards to produce that sliver would be pure waste.

          Height is deliberately NOT locked: reviews differ in height (a wide
          single photo is far shorter than a 2x2 grid), and pinning the box
          to the tallest left visible dead space under the short ones. The
          trade is that the box resizes as you step through. */}
      <View style={styles.stack}>
        <View style={styles.cardLayer}>
          {reviewCount > 2 && <ThemedView type="backgroundElement" style={[styles.behind, styles.behindFar]} />}
          {reviewCount > 1 && <ThemedView type="backgroundElement" style={[styles.behind, styles.behindNear]} />}

          <Animated.View style={cardStyle}>
            <VisitCard
              onPhotoLayout={handlePhotoLayout}
              visit={activeVisit}
              photoUrls={photoUrls}
              avatarUrl={avatarUrls[activeVisit.user_id]}
              isOwner={viewerId === activeVisit.user_id}
              isCopied={copiedVisitId === activeVisit.id}
              onToggleLike={() => onToggleLike(activeVisit)}
              onShare={() => onShare(activeVisit)}
              onDeleted={() => onVisitDeleted(activeVisit.id)}
            />
          </Animated.View>

          {reviewCount > 1 && (
            <>
              <Pressable
                onPress={() => step(-1)}
                hitSlop={10}
                style={[
                  styles.arrow,
                  { backgroundColor: theme.backgroundElement },
                  styles.arrowLeft,
                  arrowAnchor != null
                    ? { top: arrowAnchor - ARROW_SIZE / 2, marginTop: 0 }
                    : null,
                ]}>
                <Ionicons name="chevron-back" size={ARROW_ICON_SIZE} color={theme.text} />
              </Pressable>
              <Pressable
                onPress={() => step(1)}
                hitSlop={10}
                style={[
                  styles.arrow,
                  { backgroundColor: theme.backgroundElement },
                  styles.arrowRight,
                  arrowAnchor != null
                    ? { top: arrowAnchor - ARROW_SIZE / 2, marginTop: 0 }
                    : null,
                ]}>
                <Ionicons name="chevron-forward" size={ARROW_ICON_SIZE} color={theme.text} />
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.two,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.one,
  },
  // position:'relative' anchors the cards behind; no overflow:'hidden', so
  // the rating stamp still leans past the card's own corner.
  stack: {
    position: 'relative',
  },
  // Hugs the card, so backgrounds and arrows track the review's real height
  // rather than the locked outer box.
  cardLayer: {
    position: 'relative',
  },
  behind: {
    ...StyleSheet.absoluteFill,
    borderRadius: Spacing.three,
    opacity: 0.5,
  },
  behindNear: {
    transform: [
      { translateX: BEHIND_OFFSET },
      { translateY: -BEHIND_OFFSET },
      { rotate: `${BEHIND_TILT_DEGREES}deg` },
    ],
  },
  behindFar: {
    transform: [
      { translateX: BEHIND_OFFSET * 2 },
      { translateY: -BEHIND_OFFSET * 2 },
      { rotate: `${BEHIND_TILT_DEGREES * 2}deg` },
    ],
    opacity: 0.3,
  },
  // Overlaid on the card, vertically centred, so they hold still while the
  // card behind them changes. Small enough to leave the review itself
  // tappable everywhere else.
  arrow: {
    position: 'absolute',
    top: '50%',
    width: ARROW_SIZE,
    height: ARROW_SIZE,
    marginTop: -ARROW_SIZE / 2,
    borderRadius: ARROW_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  arrowLeft: {
    left: -ARROW_SIZE / 3,
  },
  arrowRight: {
    right: -ARROW_SIZE / 3,
  },
});
