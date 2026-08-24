import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { StyleProp, ViewStyle } from 'react-native';

import { Image } from 'expo-image';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VisitCard } from '@/components/visit-card';
import { BrandColors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { FeedVisit, TripDay } from '@/lib/feed';
import { colorForRating } from '@/lib/rating-gradient';
import { ArrowSticker } from '@/components/ui/arrow-sticker';
import { pickStickerVariants } from '@/lib/sticker-shapes';

type TripDayReviewsProps = {
  day: TripDay;
  dayNumber: number;
  // Seeds the sticker artwork — per trip, not per day, so a trip's arrows
  // keep one identity instead of reshuffling between days.
  tripKey: string;
  photoUrls: Record<string, string>;
  photoThumbUrls?: Record<string, string>;
  avatarUrls: Record<string, string>;
  viewerId?: string;
  copiedVisitId: string | null;
  onToggleLike: (visit: FeedVisit) => void;
  onShare: (visit: FeedVisit) => void;
  onVisitDeleted: (visitId: string) => void;
  // Owner-only, and only where removing makes sense (the trip page). Absent
  // in the feed, where a trip is something you're reading, not editing.
  onRemoveFromTrip?: (visitId: string) => void;
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
const SPIN_DEGREES = 180;
// Short and non-looping, matched to the card's own 220ms shuffle: a long
// trip page can show ~20 arrows, and a spin still running when you tap
// again is where repeated taps start to look messy.
const SPIN_MS = 260;

type StepArrowProps = {
  direction: 'prev' | 'next';
  variants: ReturnType<typeof pickStickerVariants>;
  glyphColor: string;
  stickerColor: string;
  onPress: () => void;
  style: StyleProp<ViewStyle>;
};

// Its own component so each arrow owns its animated values — the pressed
// one animates alone, which reads as acknowledging that tap rather than the
// whole row twitching.
function StepArrow({ direction, variants, glyphColor, stickerColor, onPress, style }: StepArrowProps) {
  const spin = useSharedValue(0);
  const pop = useSharedValue(1);
  const wobble = useSharedValue(0);
  const fade = useSharedValue(1);

  function handlePress() {
    // Accumulated rather than reset, so rapid taps keep turning the same
    // way instead of snapping back and re-spinning.
    spin.value = withTiming(spin.value + (direction === 'next' ? SPIN_DEGREES : -SPIN_DEGREES), {
      duration: SPIN_MS,
    });
    // Overshoot then settle on a spring — that's the bounce.
    pop.value = withSequence(
      withTiming(1.35, { duration: 110 }),
      withSpring(1, { damping: 7, stiffness: 220 })
    );
    wobble.value = withSequence(
      withTiming(-10, { duration: 60 }),
      withTiming(10, { duration: 60 }),
      withTiming(0, { duration: 90 })
    );
    // The dip is what sells the colour change: the new tint lands while the
    // glyph is faded, so it reads as a transition rather than a snap.
    fade.value = withSequence(withTiming(0.4, { duration: 90 }), withTiming(1, { duration: 170 }));
    onPress();
  }

  return (
    <Pressable onPress={handlePress} hitSlop={10} style={style}>
      <ArrowSticker
        size={ARROW_SIZE}
        background={variants.background}
        inner={variants.inner}
        arrow={variants.arrow}
        innerColor={stickerColor}
        arrowColor={glyphColor}
        flip={direction === 'prev'}
        spin={spin}
        pop={pop}
        wobble={wobble}
        fade={fade}
      />
    </Pressable>
  );
}

export function TripDayReviews({
  day,
  dayNumber,
  tripKey,
  photoUrls,
  photoThumbUrls,
  avatarUrls,
  viewerId,
  copiedVisitId,
  onToggleLike,
  onShare,
  onVisitDeleted,
  onRemoveFromTrip,
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
  const stickerVariants = useMemo(() => pickStickerVariants(tripKey), [tripKey]);

  // Warm every photo in the day up front. Stepping otherwise hits a cold
  // image each time — the review is already on screen while its photo is
  // still downloading, which is most of why shuffling felt slow.
  useEffect(() => {
    const urls = day.visits
      .flatMap((visit) => visit.photoIds)
      .map((id) => photoUrls[id])
      .filter((url): url is string => url != null);
    if (urls.length > 0) Image.prefetch(urls);
  }, [day, photoUrls]);

  // Each arrow is tinted by the review it leads to. Unrated neighbours fall
  // back to the theme's own text colour rather than an arbitrary hue.
  function neighbourColor(offset: number): string {
    if (reviewCount < 2) return theme.text;
    const neighbour = day.visits[(index + offset + reviewCount) % reviewCount];
    return neighbour?.rating != null ? colorForRating(neighbour.rating) : theme.text;
  }
  // Clamped: a delete can shrink the day out from under the current index.
  const activeIndex = Math.min(index, reviewCount - 1);
  const activeVisit = day.visits[activeIndex];

  function handlePhotoLayout(offsetY: number, height: number) {
    if (height <= 0) return;
    setArrowAnchor((current) => current ?? offsetY + height / 2);
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
              photoThumbUrls={photoThumbUrls}
              avatarUrl={avatarUrls[activeVisit.user_id]}
              isOwner={viewerId === activeVisit.user_id}
              isCopied={copiedVisitId === activeVisit.id}
              onToggleLike={() => onToggleLike(activeVisit)}
              onShare={() => onShare(activeVisit)}
              onDeleted={() => onVisitDeleted(activeVisit.id)}
            />
          </Animated.View>

              {onRemoveFromTrip && (
            <Pressable
              onPress={() => onRemoveFromTrip(activeVisit.id)}
              hitSlop={8}
              style={styles.removeButton}>
              <ThemedText type="small" themeColor="textSecondary">
                Not part of this trip
              </ThemedText>
            </Pressable>
          )}

          {reviewCount > 1 && (
            <>
              <StepArrow
                direction="prev"
                variants={stickerVariants}
                glyphColor={BrandColors.cream}
                stickerColor={neighbourColor(-1)}
                onPress={() => step(-1)}
                style={[
                  styles.arrow,
                  styles.arrowLeft,
                  arrowAnchor != null ? { top: arrowAnchor - ARROW_SIZE / 2, marginTop: 0 } : null,
                ]}
              />
              <StepArrow
                direction="next"
                variants={stickerVariants}
                glyphColor={BrandColors.cream}
                stickerColor={neighbourColor(1)}
                onPress={() => step(1)}
                style={[
                  styles.arrow,
                  styles.arrowRight,
                  arrowAnchor != null ? { top: arrowAnchor - ARROW_SIZE / 2, marginTop: 0 } : null,
                ]}
              />
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
  // Sits under the card rather than on it — destructive-ish actions
  // shouldn't share space with the navigation arrows.
  removeButton: {
    alignSelf: 'flex-end',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
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
