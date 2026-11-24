import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useStagedFrame } from '@/components/ui/scroll-stage';
import { hapticStamp } from '@/lib/haptics';
import { randomFor } from '@/lib/seeded-random';

// Declared above the worklets that read them: a worklet takes its closure
// where it is defined (see unfold.tsx for what happens otherwise).
//
// How far up the screen a card travels, as a share of the screen's height,
// between coming into view and settling. Nearly half: the bottom tenth is
// under the floating tab bar, so a short span spent most of the deal where
// nobody could see it.
const DEAL_SPAN = 0.45;
// Where it starts from: this much lower, and turned this much further than
// it will rest.
const DEAL_DROP = 40;
const DEAL_TILT = 2;
// How a card lies once it has settled. A pile of real postcards is never
// squared up, and a column of perfectly straight ones is what made the feed
// read as a list rather than a pile. Kept under a degree: enough to see,
// not enough to read as a card that slipped.
const PILE_TILT_MIN = 0.35;
const PILE_TILT_MAX = 0.9;
const PILE_SHIFT = 4;
// How far above the screen's bottom edge, as a share of its height, a card's
// own bottom edge has to be for it to count as settled: just clear of the
// floating tab bar.
const SETTLED_CLEARANCE = 0.15;
// How far up the screen a card has to have come before its stamps land.
const LAND_AT = 0.9;
// The stamp's press: a bouncy spring, so it overshoots into a squash and
// settles, the way a rubber stamp comes down.
const LAND_SPRING = { damping: 9, stiffness: 190, mass: 0.6 };
const STAMP_LIFT = 8;
const STAMP_GROW = 0.3;
const STAMP_TURN = 6;

type DealInProps = {
  // Anything stable per card: decides how it lies on the pile.

  seed: string;
  children: ReactNode;
};

// 0 while a card's stamps are still lifted, 1 once they have come down.
const LandingContext = createContext<SharedValue<number> | null>(null);

// A card in a feed, dealt onto the pile as it scrolls into view: it comes in
// from the bottom edge a little low and turned, and settles to its own
// slight lean on the pile as it rises. Tied to the scroll rather than played
// on a timer, so it runs back the other way when you scroll back. The first
// time it settles, the stamps on it land (see StampLanding).
//
// Movement and a turn only. Never a scale: scaled text is resampled on iOS
// and comes out soft. And never a fade: Android applies a parent's opacity
// to each layer of the card separately rather than to the card as a whole,
// so a half-faded postcard showed the lines printed under its photo through
// the photo, and the paper through its stamp.
//
// Placed by the list's scroll stage (see scroll-stage), so it needs to be in
// a list that has one; anywhere else it lies at its rest.
export function DealIn({ seed, children }: DealInProps) {
  const { stage, ref, onLayout, contentY, height } = useStagedFrame();
  const scrollY = stage?.scrollY;
  const viewportTop = stage?.viewportTop;
  const { height: screenHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const pile = useMemo(() => {
    const random = randomFor(`pile-${seed}`);
    const side = random() < 0.5 ? -1 : 1;
    return {
      tilt: side * (PILE_TILT_MIN + random() * (PILE_TILT_MAX - PILE_TILT_MIN)),
      shift: (random() * 2 - 1) * PILE_SHIFT,
      // Arrives leaning the way it will rest, only further.
      lean: side * (0.6 + random() * 0.4),
    };
  }, [seed]);
  const { tilt, shift, lean } = pile;

  // How far up the screen the card has come: 0 at the bottom edge, 1 once
  // settled, and -1 while that is not known yet.
  const risen = useDerivedValue(() => {
    if (!scrollY || !viewportTop || contentY.value < 0) return -1;
    const top = viewportTop.value + contentY.value - scrollY.value;
    const byTop = (screenHeight - top) / (screenHeight * DEAL_SPAN);
    // Or by its bottom edge clearing the tab bar: a short card at the end of
    // a list can be wholly in view without its top ever rising that far,
    // and would otherwise sit there half dealt, its stamp never landing.
    const byBottom = (screenHeight - top - height.value) / (screenHeight * SETTLED_CLEARANCE);
    return Math.min(1, Math.max(0, byTop, byBottom));
  });

  const landed = useSharedValue(reduceMotion ? 1 : 0);
  const hasLanded = useSharedValue(reduceMotion ? 1 : 0);
  useAnimatedReaction(
    () => risen.value,
    (now) => {
      if (hasLanded.value === 1 || now < LAND_AT) return;
      hasLanded.value = 1;
      landed.value = withSpring(1, LAND_SPRING);
      // Felt only for a card you scrolled to. Every card already on screen
      // lands as the feed opens, and a burst of knocks on opening reads as
      // something going wrong.
      if (scrollY && scrollY.value > 0) scheduleOnRN(hapticStamp);
    },
  );

  const dealtStyle = useAnimatedStyle(() => {
    const left = reduceMotion || risen.value < 0 ? 0 : Math.pow(1 - risen.value, 2);
    return {
      transform: [
        { translateX: shift },
        { translateY: left * DEAL_DROP },
        { rotate: `${tilt + left * lean * DEAL_TILT}deg` },
      ],
    };
  });

  // The outer view is what gets measured, and it never moves.
  return (
    <LandingContext.Provider value={landed}>
      <View ref={ref} collapsable={false} onLayout={onLayout}>
        <Animated.View style={dealtStyle}>{children}</Animated.View>
      </View>
    </LandingContext.Provider>
  );
}

// A stamp on a dealt card: held a little above the card while it is dealt,
// and pressed down onto it, with a bounce, the first time the card settles.
// Anywhere else (a card that is not dealt in) it is just its children.
export function StampLanding({ children }: { children: ReactNode }) {
  const landed = useContext(LandingContext);
  if (!landed) return <>{children}</>;
  return <LandingStamp landed={landed}>{children}</LandingStamp>;
}

function LandingStamp({ landed, children }: { landed: SharedValue<number>; children: ReactNode }) {
  // A grow and a lift, so this one transform does scale, against the rule
  // above. It is only ever in flight for a moment and finishes at exactly 1,
  // where nothing is resampled, so what iOS softens is a stamp in motion.
  const pressStyle = useAnimatedStyle(() => {
    // Past 1 on the overshoot, which is the squash.
    const lift = 1 - landed.value;
    return {
      transform: [
        { translateY: -STAMP_LIFT * Math.max(0, lift) },
        { scale: 1 + STAMP_GROW * lift },
        { rotate: `${-STAMP_TURN * lift}deg` },
      ],
    };
  });
  return <Animated.View style={pressStyle}>{children}</Animated.View>;
}
