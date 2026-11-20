import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';

import { ThemedText } from '@/components/themed-text';
import { LoadableImage } from '@/components/ui/loadable-image';
import { RatingGlassBadgeGated } from '@/components/ui/rating-glass-badge-gated';
import { SurfaceWearLayer } from '@/components/ui/surface-wear-layer';
import { BrandColors, Spacing, StickerAccents } from '@/constants/theme';
import { randomFor } from '@/lib/seeded-random';
import { buildSurfaceWear } from '@/lib/surface-wear';

// Declared above the worklets that read them: a worklet takes its closure
// where it is defined (see unfold.tsx for what happens otherwise).
const TAG_WIDTH = 176;
// How far the string runs up out of the tag's hole, to its pin on the rail.
export const PLACE_TAG_STRING = 18;
const HOLE_TOP = 10;
const HOLE = 12;
const PRINT_RATIO = 1.2;
const STAMP_SIZE = 40;
const INK = '#1c2218';
const INK_SOFT = 'rgba(28, 34, 24, 0.55)';
// A hung tag is never quite straight, and each hangs its own way.
const MAX_TILT = 2.5;
// The string, from its pin to the middle of the hole.
const STRING_LENGTH = PLACE_TAG_STRING + HOLE_TOP + HOLE / 2;

// The drop: each tag starts this far above where it hangs (enough to begin
// out of sight above the strip), and falls a beat after the one before.
const DROP_FROM = 440;
const DROP_STAGGER_MS = 110;
// Falling and catching on its string: a bouncy spring, overshooting into a
// stretch of the string and back.
const DROP_SPRING = { damping: 11, stiffness: 150, mass: 1 };
// Swinging about the pin. Lightly damped, so a swing dies away over three or
// four passes the way a hung tag's does, at about a second a swing.
const SWING_SPRING = { damping: 2.4, stiffness: 30, mass: 1 };
// The string stretching and springing back.
const BOB_SPRING = { damping: 6, stiffness: 120, mass: 1 };
// How much a scroll moves them. The strip's sideways movement swings them
// (degrees per point moved in a frame), the page's movement stretches the
// strings (points per point) with a little swing each way.
const SWING_PER_STRIP = 1.1;
const SWING_PER_PAGE = 0.25;
const STRETCH_PER_PAGE = 0.7;
const MAX_SWING = 26;

// How the strip and the page are moving, in points per frame, for the tags
// to swing and bob with. See DiscoverView.
export type PlaceTagMotion = {
  strip: SharedValue<number>;
  page: SharedValue<number>;
};

type PlaceTagProps = {
  // Anything stable per place: decides its colour, its lean and its wear.
  seed: string;
  // Its place along the strip, which decides when it drops.
  index: number;
  motion: PlaceTagMotion;
  name: string;
  // The distance, or failing that where it is.
  subtitle: string;
  photoUrl: string | undefined;
  rating: number | null;
  onPress: () => void;
};

// A place in Discover's "Places to go", as a luggage tag: cream card stock
// with a punched hole and its string, the place mounted on it as a print,
// its name in the postcards' heavy condensed face, and the distance on a
// coloured band along the foot, the way a destination is printed on a real
// label. It was a plain rounded box with a photo in it, the one thing on the
// screen that did not look like it had travelled anywhere.
//
// Each tag hangs on its string from a pin on a rail, takes its band from the
// same accents as the stickers and tickets, and is its own piece of card
// (see SurfaceWearLayer).
//
// And it moves like one. When the strip first appears the tags drop in from
// above, one after another, catch on their strings with a stretch and a
// bounce, and swing about their pins until they settle. Scrolling the strip
// sideways swings them, lagging behind and swinging back when it stops;
// scrolling the page stretches their strings and sets them bobbing. All of
// it is springs, so it settles and stops on its own. Not for anyone who has
// asked the system for less motion: they get the tags simply hanging.
export function PlaceTag({ seed, index, motion, name, subtitle, photoUrl, rating, onPress }: PlaceTagProps) {
  const reduceMotion = useReducedMotion();
  const look = useMemo(() => {
    const random = randomFor(`place-tag-${seed}`);
    return {
      tilt: (random() * 2 - 1) * MAX_TILT,
      accent: StickerAccents[Math.floor(random() * StickerAccents.length)],
      stampTurn: -12 + random() * 24,
      // How far it is swung out as it falls, and which way the page's
      // movement swings it.
      throwAngle: (random() < 0.5 ? -1 : 1) * (12 + random() * 12),
      shimmy: random() < 0.5 ? -1 : 1,
      wear: buildSurfaceWear(`place-tag-${seed}`, { count: 7, maxOpacity: 0.12 }),
    };
  }, [seed]);
  const { tilt, throwAngle, shimmy } = look;

  // Above where it hangs (negative), or past it on the bounce (positive,
  // which is the string stretching).
  const drop = useSharedValue(reduceMotion ? 0 : -DROP_FROM);
  const swing = useSharedValue(reduceMotion ? 0 : throwAngle);
  const bob = useSharedValue(0);
  const hasDropped = useSharedValue(reduceMotion);

  useEffect(() => {
    if (reduceMotion) return;
    const delay = index * DROP_STAGGER_MS;
    // Started on the UI thread, where the animation runs, as Unfold starts
    // its own.
    scheduleOnUI(() => {
      'worklet';
      drop.value = withDelay(
        delay,
        withSpring(0, DROP_SPRING, (finished) => {
          'worklet';
          if (finished) hasDropped.value = true;
        }),
      );
      swing.value = withDelay(delay, withSpring(0, SWING_SPRING));
    });
  }, [reduceMotion, index, drop, swing, hasDropped]);

  // Retargeted on every frame of a scroll, which keeps each spring's speed,
  // so the tags lag behind the movement and swing back past rest when it
  // stops. Held off until the drop has landed, so a scroll during it does
  // not cut the fall short.
  useAnimatedReaction(
    () => [motion.strip.value, motion.page.value],
    ([strip, page]) => {
      if (!hasDropped.value) return;
      const target = -strip * SWING_PER_STRIP + page * SWING_PER_PAGE * shimmy;
      swing.set(withSpring(Math.max(-MAX_SWING, Math.min(MAX_SWING, target)), SWING_SPRING));
      bob.set(withSpring(Math.max(-6, Math.min(14, page * STRETCH_PER_PAGE)), BOB_SPRING));
    },
  );

  // The whole of it turns about the pin. On the way down it falls whole;
  // once it reaches the rail, anything further is the string stretching,
  // and the pin stays put.
  const hangStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.min(drop.value, 0) }, { rotate: `${tilt + swing.value}deg` }],
  }));
  const stretch = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(drop.value, 0) + bob.value }],
  }));
  const stringStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: (STRING_LENGTH + Math.max(drop.value, 0) + bob.value) / STRING_LENGTH }],
  }));

  return (
    <Animated.View style={[styles.hang, hangStyle]}>
      <Animated.View style={[styles.string, stringStyle]} />
      <View style={styles.pin} />
      <Animated.View style={stretch}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${name}, ${subtitle}`}
          style={({ pressed }) => [styles.tag, pressed && styles.pressed]}>
          <SurfaceWearLayer wear={look.wear} tone="paper" />
          {/* The punched hole, and the reinforcing ring stuck round it. */}
          <View style={[styles.ring, { backgroundColor: look.accent }]} />
          <View style={styles.hole} />

          <View style={styles.print}>
            {/* LoadableImage covers both waits (the url, then the bytes) with
                the same walking icon as the postcards below. */}
            <LoadableImage source={photoUrl ? { uri: photoUrl } : undefined} style={styles.photo} contentFit="cover" />
          </View>

          <View style={styles.words}>
            <ThemedText type="meta" style={styles.kicker}>
              Destination
            </ThemedText>
            {/* Two lines, not one. At one line every long name came out as
                "GOLDEN GAT…", which cannot be told from Golden Gate Park. */}
            <ThemedText
              type="headline"
              style={styles.name}
              numberOfLines={2}
              // Shrinks a little before it cuts: "ZION NATIONA..." was the
              // first long name on the screen.
              adjustsFontSizeToFit
              minimumFontScale={0.75}>
              {name}
            </ThemedText>
          </View>

          <View style={[styles.band, { backgroundColor: look.accent }]}>
            <ThemedText type="meta" style={styles.bandText} numberOfLines={1}>
              {subtitle}
            </ThemedText>
          </View>
        </Pressable>

        {/* Stuck over the print's corner, past the tag's edge, so it sits
            outside the tag's clip. */}
        {rating != null && (
          <View style={[styles.stamp, { transform: [{ rotate: `${look.stampTurn}deg` }] }]} pointerEvents="none">
            <RatingGlassBadgeGated rating={rating} size={STAMP_SIZE} seed={seed} />
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const PRINT_TOP = HOLE_TOP + HOLE + Spacing.two;
const PRINT_HEIGHT = (TAG_WIDTH - Spacing.two * 2 - 8) / PRINT_RATIO + 8;

const styles = StyleSheet.create({
  hang: {
    width: TAG_WIDTH,
    // Turned about the pin its string hangs from.
    transformOrigin: [TAG_WIDTH / 2, -PLACE_TAG_STRING, 0],
  },
  pressed: {
    opacity: 0.85,
  },
  string: {
    position: 'absolute',
    top: -PLACE_TAG_STRING,
    left: TAG_WIDTH / 2 - 1,
    width: 2,
    height: STRING_LENGTH,
    borderRadius: 1,
    backgroundColor: 'rgba(234, 231, 207, 0.55)',
    // Stretches downward from the pin.
    transformOrigin: 'top',
  },
  pin: {
    position: 'absolute',
    top: -PLACE_TAG_STRING - 3,
    left: TAG_WIDTH / 2 - 3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(234, 231, 207, 0.8)',
  },
  tag: {
    backgroundColor: BrandColors.cream,
    borderRadius: Spacing.three,
    overflow: 'hidden',
    paddingTop: PRINT_TOP,
  },
  ring: {
    position: 'absolute',
    top: HOLE_TOP - 5,
    left: TAG_WIDTH / 2 - (HOLE + 10) / 2,
    width: HOLE + 10,
    height: HOLE + 10,
    borderRadius: (HOLE + 10) / 2,
    opacity: 0.85,
  },
  hole: {
    position: 'absolute',
    top: HOLE_TOP,
    left: TAG_WIDTH / 2 - HOLE / 2,
    width: HOLE,
    height: HOLE,
    borderRadius: HOLE / 2,
    // The page showing through.
    backgroundColor: BrandColors.background,
  },
  // A print with its own white border, mounted on the card.
  print: {
    marginHorizontal: Spacing.two,
    padding: 4,
    backgroundColor: '#f7f5ea',
    borderRadius: 3,
  },
  photo: {
    width: '100%',
    aspectRatio: PRINT_RATIO,
    borderRadius: 2,
  },
  words: {
    paddingHorizontal: Spacing.two + 2,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    gap: Spacing.half,
  },
  kicker: {
    color: INK_SOFT,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  name: {
    color: INK,
    fontSize: 20,
    lineHeight: 21,
  },
  band: {
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 2,
  },
  bandText: {
    color: INK,
  },
  stamp: {
    position: 'absolute',
    top: PRINT_TOP + PRINT_HEIGHT - STAMP_SIZE * 0.8,
    right: -Spacing.one,
  },
});
