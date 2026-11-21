import { Image } from 'expo-image';
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
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
import { KNOT_WIDTH, TWINE_WIDTH, knotUri, railUri, twineFor, twineUri } from '@/lib/twine';

// Declared above the worklets that read them: a worklet takes its closure
// where it is defined (see unfold.tsx for what happens otherwise).
const TAG_WIDTH = 176;
// How far the string runs up out of the tag's hole to the rail.
export const PLACE_TAG_STRING = 18;
// Where the rail runs, down from the top of the strip.
const RAIL_Y = 8;
// The room a strip of tags needs above them for the rail and their strings.
export const PLACE_TAG_HEADROOM = RAIL_Y + PLACE_TAG_STRING;
// How the strip spaces the tags, which the rail has to match to put a knot
// over each one. DiscoverView lays the strip out with these.
export const PLACE_TAG_GAP = Spacing.three;
export const PLACE_TAG_EDGE = Spacing.four;
const HOLE_TOP = 10;
const HOLE = 12;
const PRINT_RATIO = 1.2;
const STAMP_SIZE = 40;
const INK = '#1c2218';
const INK_SOFT = 'rgba(28, 34, 24, 0.55)';
// A hung tag is never quite straight, and each hangs its own way.
const MAX_TILT = 2.5;
// How much longer than the shortest a tag's string may be, so the tags hang
// at uneven heights rather than in a ruled line.
const MAX_SLACK = 24;
// How far the twine runs on under the tag's top edge, where the knot drawn
// over the tag takes it on into the hole.
const TUCK = 6;
// The knot's image starts this far above the tag's top edge.
const KNOT_RISE = 6;

// The drop: each tag starts this far above where it hangs (enough to begin
// out of sight above the strip), and falls a beat after the one before.
const DROP_FROM = 440;
const DROP_STAGGER_MS = 110;
// Falling and catching on its string: a bouncy spring, overshooting into a
// stretch of the string and back.
const DROP_SPRING = { damping: 11, stiffness: 150, mass: 1 };
// Swinging about where the string is hung. Lightly damped, so a swing dies
// away over three or four passes the way a hung tag's does, at about a
// second a swing.
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
// The rail's dips between tags, and how much they deepen as the page and
// strip move: the twine bouncing with everything hung on it.
const RAIL_SAG_MIN = 5;
const RAIL_SAG_MAX = 11;
const RAIL_GIVE = 0.035;
const RAIL_MAX_GIVE = 0.9;
const RAIL_SPRING = { damping: 5, stiffness: 90, mass: 1 };
// Tall enough for the deepest dip and the knots.
const RAIL_HEIGHT = RAIL_Y + RAIL_SAG_MAX + 8;

// How the strip and the page are moving, in points per frame, for the tags
// to swing and bob with. See DiscoverView.
export type PlaceTagMotion = {
  strip: SharedValue<number>;
  page: SharedValue<number>;
  // How far the strip is scrolled, for each tag to tell whether it is in
  // view: only those that are swing.
  offset: SharedValue<number>;
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
      // Drawn after everything above, so each tag keeps the colour, lean and
      // wear it already had.
      twine: twineFor(random),
      slack: Math.round(random() * MAX_SLACK),
    };
  }, [seed]);
  const { tilt, throwAngle, shimmy, slack } = look;
  // From its knot on the rail to just under the tag's top edge. The slack
  // lowers the tag rather than the knot.
  const reach = PLACE_TAG_STRING + slack;
  const stringLength = reach + TUCK;
  const twine = useMemo(
    () => ({
      length: twineUri(look.twine, stringLength),
      knot: knotUri(look.twine, KNOT_RISE, KNOT_RISE + HOLE_TOP + 1),
    }),
    [look.twine, stringLength],
  );

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
  //
  // Only while it is in view, or near it. Each tag's swing, stretch and
  // string are three animated views, and Reanimated, as this app builds it,
  // commits the whole page for every animated frame (its
  // ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS flag is off), so ten tags all
  // springing on every scroll frame was the heaviest thing on the page.
  const { width: screenWidth } = useWindowDimensions();
  const tagLeft = PLACE_TAG_EDGE + index * (TAG_WIDTH + PLACE_TAG_GAP);
  useAnimatedReaction(
    () => [motion.strip.value, motion.page.value],
    ([strip, page]) => {
      if (!hasDropped.value) return;
      const onScreen = tagLeft - motion.offset.value;
      if (onScreen < -TAG_WIDTH * 1.3 || onScreen > screenWidth + TAG_WIDTH * 0.3) return;
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
    transform: [{ scaleY: (stringLength + Math.max(drop.value, 0) + bob.value) / stringLength }],
  }));

  return (
    <Animated.View
      style={[
        styles.hang,
        // Lower by its slack, and turned about its knot on the rail.
        { marginTop: slack, transformOrigin: [TAG_WIDTH / 2, -reach, 0] },
        hangStyle,
      ]}>
      <Animated.View style={[styles.string, { top: -reach, height: stringLength }, stringStyle]}>
        <Image source={{ uri: twine.length }} style={{ width: TWINE_WIDTH, height: stringLength }} />
      </Animated.View>
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
            <ThemedText type="meta" style={styles.bandText} numberOfLines={2}>
              {subtitle}
            </ThemedText>
          </View>
        </Pressable>

        {/* The twine over the tag's top edge, knotted, and into the hole. */}
        <Image source={{ uri: twine.knot }} style={styles.knot} pointerEvents="none" />

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

// The rail along the top of a strip of tags: a length of twine strung across,
// dipping between each pair of tags, with each tag's string knotted to it.
// It was a straight rule, which under tags that swung read as static and
// drawn; this one sags, and gives when things move, its dips deepening as
// the page or the strip moves and springing back as they settle.
export function PlaceTagRail({ count, motion }: { count: number; motion: PlaceTagMotion }) {
  const reduceMotion = useReducedMotion();
  const width = PLACE_TAG_EDGE * 2 + count * TAG_WIDTH + Math.max(0, count - 1) * PLACE_TAG_GAP;
  const drawing = useMemo(() => {
    const random = randomFor(`place-tag-rail-${count}`);
    const anchors = Array.from({ length: count }, (_, index) => PLACE_TAG_EDGE + index * (TAG_WIDTH + PLACE_TAG_GAP) + TAG_WIDTH / 2);
    const sags = Array.from({ length: count + 1 }, () => RAIL_SAG_MIN + random() * (RAIL_SAG_MAX - RAIL_SAG_MIN));
    return railUri(twineFor(random), width, RAIL_HEIGHT, RAIL_Y, anchors, sags);
  }, [count, width]);

  const give = useSharedValue(0);
  useAnimatedReaction(
    () => Math.abs(motion.strip.value) + Math.abs(motion.page.value),
    (moving) => {
      if (reduceMotion) return;
      give.set(withSpring(Math.min(RAIL_MAX_GIVE, moving * RAIL_GIVE), RAIL_SPRING));
    },
  );
  // Deepened from the knots' line down, so the knots, and the strings tied
  // to them, stay where they are.
  const railStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: 1 + give.value }] }));

  return (
    <Animated.View pointerEvents="none" style={[styles.rail, { width }, railStyle]}>
      <Image source={{ uri: drawing }} style={{ width, height: RAIL_HEIGHT }} />
    </Animated.View>
  );
}

const PRINT_TOP = HOLE_TOP + HOLE + Spacing.two;
const PRINT_HEIGHT = (TAG_WIDTH - Spacing.two * 2 - 8) / PRINT_RATIO + 8;

const styles = StyleSheet.create({
  hang: {
    width: TAG_WIDTH,
  },
  pressed: {
    opacity: 0.85,
  },
  rail: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: RAIL_HEIGHT,
    transformOrigin: [0, RAIL_Y, 0],
  },
  string: {
    position: 'absolute',
    left: TAG_WIDTH / 2 - TWINE_WIDTH / 2,
    width: TWINE_WIDTH,
    // Stretches downward from the pin.
    transformOrigin: 'top',
  },

  knot: {
    position: 'absolute',
    top: -KNOT_RISE,
    left: TAG_WIDTH / 2 - KNOT_WIDTH / 2,
    width: KNOT_WIDTH,
    height: KNOT_RISE + HOLE_TOP + 1 + 3,
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
