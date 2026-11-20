import { Canvas, Circle, DashPathEffect, Path, Skia } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { FeedDivider } from '@/components/ui/feed-divider';
import { JourneyLabel } from '@/components/ui/journey-label';
import { useStagedFrame } from '@/components/ui/scroll-stage';
import { hapticTick } from '@/lib/haptics';
import { legBetween, type JourneyLeg, type JourneyStop } from '@/lib/journey';
import { journeyRoute, pointAlong } from '@/lib/journey-route';

// Declared above the worklets that read them: a worklet takes its closure
// where it is defined (see unfold.tsx for what happens otherwise).
export const ROUTE_HEIGHT = 140;
// Room at each end for the ring it sets out from and the pen it arrives as.
export const ROUTE_INSET = 6;
// The route draws itself while its top travels from here (a share of the
// screen's height down from the top, at the tab bar)...
const DRAW_FROM = 0.95;
// ...this far up the screen: done with the next post still in the lower
// half, so the route has reached it by the time you look at it.
const DRAW_SPAN = 0.33;
// How near the screen a route has to be to have a canvas at all, in screen
// heights past either edge.
const NEAR = 0.6;
// One dash, the same on every route.
const DASH = [10, 8];
// One tick of haptics per dash drawn or taken back, but never closer
// together than this: a fast flick draws a whole route in a tenth of a
// second, and a tick per dash then is a buzz.
const TICK_GAP_MS = 35;
const INK = 'rgba(234, 231, 207, 0.85)';
const PEN = '#eae7cf';

type JourneyLineProps = {
  from: JourneyStop | null;
  to: JourneyStop | null;
  // Anything stable for the pair: decides the route's course.
  seed: string;
  // For the caller to pull it flush against the posts either side, past
  // the list's own gaps.
  style?: StyleProp<ViewStyle>;
};

// What goes between two postcards in a feed: a road drawn by hand from the
// middle of the post above to the middle of the next, and beside it where
// from and to, how far, and how many days between. It draws itself out
// along its length as you scroll down to it, pen first, and takes itself
// back as you scroll up, so moving down the feed is following a journey
// rather than passing blocks.
//
// Drawn with Skia, because a route that loops the loop has to be drawn
// along its length rather than wiped on from the top. But only while it is
// near the screen: there is one of these between every pair of posts, and a
// live canvas for each is the load that faulted the GPU driver when every
// rating stamp had one (see rating-stamp-svg). Two or three exist at once.
//
// With nothing to say (neither place has coordinates, neither post a date),
// it is the plain tear line instead. Placed by the list's scroll stage (see
// scroll-stage); outside a list that has one, it is simply drawn.
export function JourneyLine({ from, to, seed, style }: JourneyLineProps) {
  const leg = useMemo(() => legBetween(from, to), [from, to]);
  const [width, setWidth] = useState(0);
  if (!leg) return <FeedDivider />;
  return (
    <View
      style={[styles.frame, style]}
      onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}>
      {width > 0 && <Route leg={leg} width={width} seed={seed} />}
    </View>
  );
}

function Route({ leg, width, seed }: { leg: JourneyLeg; width: number; seed: string }) {
  const reduceMotion = useReducedMotion();
  const { height: screenHeight } = useWindowDimensions();
  const { stage, ref, onLayout, contentY } = useStagedFrame();
  const scrollY = stage?.scrollY;
  const viewportTop = stage?.viewportTop;
  const [isNear, setIsNear] = useState(!stage);

  const route = useMemo(() => {
    const drawn = journeyRoute(seed, width, ROUTE_HEIGHT - ROUTE_INSET * 2);
    const points = drawn.points.map((point) => ({ x: point.x, y: point.y + ROUTE_INSET }));
    const path = Skia.Path.Make();
    path.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) path.lineTo(point.x, point.y);
    return { ...drawn, points, path };
  }, [seed, width]);
  const { points, lengths, length, side } = route;
  const start = points[0];

  // Where its top is on screen, or null until that is known.
  const top = useDerivedValue(() => {
    if (!scrollY || !viewportTop || contentY.value < 0) return null;
    return viewportTop.value + contentY.value - scrollY.value;
  });

  // How much of the route is drawn: 0 to 1.
  const progress = useDerivedValue(() => {
    if (reduceMotion || !scrollY) return 1;
    if (top.value == null) return 0;
    return Math.min(1, Math.max(0, (screenHeight * DRAW_FROM - top.value) / (screenHeight * DRAW_SPAN)));
  });

  useAnimatedReaction(
    () => top.value != null && top.value < screenHeight * (1 + NEAR) && top.value + ROUTE_HEIGHT > -screenHeight * NEAR,
    (near, wasNear) => {
      if (near !== wasNear) scheduleOnRN(setIsNear, near);
    },
  );

  // A tick each time the pen passes another dash, either way. Not on the
  // first reading, which is where the route already was when the screen
  // opened, not the pen moving.
  const dashes = Math.max(1, Math.floor(length / (DASH[0] + DASH[1])));
  const lastTickAt = useSharedValue(0);
  useAnimatedReaction(
    () => Math.floor(progress.value * dashes),
    (dash, previous) => {
      if (previous == null || dash === previous || !scrollY) return;
      const now = Date.now();
      if (now - lastTickAt.value < TICK_GAP_MS) return;
      lastTickAt.value = now;
      scheduleOnRN(hapticTick);
    },
  );

  // The pen: as far along the route as it has been drawn.
  const pen = useDerivedValue(() => pointAlong({ points, lengths, length }, progress.value));
  const penX = useDerivedValue(() => pen.value.x);
  const penY = useDerivedValue(() => pen.value.y);
  const penOpacity = useDerivedValue(() => (progress.value > 0.01 ? 1 : 0));

  // The words arrive once the route is most of the way past them.
  const labelStyle = useAnimatedStyle(() => {
    const shown = Math.min(1, Math.max(0, (progress.value - 0.3) / 0.3));
    return { opacity: shown, transform: [{ translateX: (1 - shown) * 12 * -side }] };
  });

  // On the side the route is not bowing out to, set against the middle.
  const labelSide = side === 1 ? { left: 0, right: width / 2 + 14 } : { left: width / 2 + 14, right: 0 };

  return (
    <View ref={ref} collapsable={false} style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {isNear && (
        <Canvas style={{ width, height: ROUTE_HEIGHT }}>
          <Path
            path={route.path}
            style="stroke"
            strokeWidth={3}
            strokeCap="round"
            strokeJoin="round"
            color={INK}
            start={0}
            end={progress}>
            <DashPathEffect intervals={DASH} />
          </Path>
          {/* Where it set out from, under the post above. */}
          <Circle cx={start.x} cy={start.y} r={4.5} style="stroke" strokeWidth={2} color={INK} />
          <Circle cx={penX} cy={penY} r={5} color={PEN} opacity={penOpacity} />
        </Canvas>
      )}
      <Animated.View style={[styles.label, labelSide, labelStyle]}>
        <JourneyLabel leg={leg} align={side === 1 ? 'right' : 'left'} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: ROUTE_HEIGHT,
  },
  label: {
    position: 'absolute',
    top: ROUTE_HEIGHT / 2 - 38,
  },
});
