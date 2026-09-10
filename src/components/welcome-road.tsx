import { Image } from 'expo-image';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { BrandColors } from '@/constants/theme';
import { randomFor } from '@/lib/seeded-random';

// Photos drift along three independent lanes rather than one road.
//
// Endpoints are fractions of the screen and deliberately sit OUTSIDE it on
// both ends, so a photo is always entering and leaving off-screen — nothing
// appears or vanishes in view.
//
// The third lane runs upward on purpose. Two streams descending in parallel
// read as one mechanism; a stream crossing them the other way is what makes
// the screen look like several things happening at once rather than a
// single animation with its parts offset.
type Lane = {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  // Card width as a fraction of screen width. Different per lane, which is
  // most of what separates them visually.
  widthRatio: number;
  // One end-to-end trip, in ms. All three are deliberately co-prime-ish, so
  // the lanes never fall into step and repeat as a group.
  travelMs: number;
  // Distance between consecutive cards, as a multiple of card height.
  //
  // Generous. Three lanes at close spacing filled the screen edge to edge
  // and turned the background into a collage the wordmark had to fight; the
  // gaps are what let it read as a few photos drifting past.
  spacing: number;
  // How far back this lane sits, 0 (front) to 1 (furthest). Applied as a
  // wash of the screen colour OVER the photo, never as View opacity.
  //
  // Opacity was the obvious way to do this and it was wrong: a translucent
  // card lets the card behind it show THROUGH, so overlapping photos
  // ghosted into each other and the whole field looked broken. Worse, the
  // welcome screen dimmed the road by animating opacity on their shared
  // parent, which multiplied with each card's own and made the ghosting
  // jump the moment Get started was pressed. A wash keeps every card fully
  // opaque, so cards occlude each other properly and only their colour
  // recedes.
  recede: number;
  // How many times a card speeds up and slows down over one run.
  speedCycles: number;
  // How much, 0..1. At 0.5 a card travels between half and one-and-a-half
  // times its average speed. Must stay under 1 — at 1 the card comes to a
  // dead stop, and past it the warp stops being monotonic and cards would
  // visibly reverse.
  speedVariation: number;
};

// Ordered BACK TO FRONT: later entries paint over earlier ones, so the
// faded, distant lane has to come first. It previously came last, which
// meant the most transparent lane was also the one drawn in front —
// something washed out sitting on top of something solid, which reads as a
// mistake rather than as distance.
// Ordered BACK TO FRONT: later entries paint over earlier ones, so the
// most receded lane has to come first. The faded lane previously came last,
// which meant the most washed-out lane was also the one drawn in front —
// something distant sitting on top of something near, which reads as a
// mistake rather than as depth.
const LANES: Lane[] = [
  {
    // Furthest back, and the only lane that crosses right-to-left. It runs
    // counter to everything else, which is what stops the field reading as
    // one mechanism with its parts offset.
    id: 'crossing-back',
    from: { x: 1.1, y: 1.15 },
    to: { x: -0.1, y: -0.15 },
    widthRatio: 0.18,
    travelMs: 118000,
    spacing: 2.8,
    recede: 0.62,
    speedCycles: 3,
    speedVariation: 0.38,
  },
  {
    id: 'rising-small',
    from: { x: -0.2, y: 1.2 },
    to: { x: 1.2, y: -0.2 },
    widthRatio: 0.22,
    travelMs: 76000,
    spacing: 2.5,
    recede: 0.45,
    // Still the busiest profile, but tamer. Variation MULTIPLIES the base
    // speed, so 0.55 on the quickest lane meant peaks over one and a half
    // times an already-fast pace — which is what read as too quick rather
    // than the base speed itself.
    speedCycles: 3,
    speedVariation: 0.4,
  },
  {
    id: 'descending-wide',
    from: { x: -0.2, y: -0.2 },
    to: { x: 1.2, y: 1.2 },
    widthRatio: 0.32,
    travelMs: 88000,
    spacing: 2.3,
    recede: 0.2,
    speedCycles: 2,
    speedVariation: 0.45,
  },
  {
    id: 'centre-slow',
    from: { x: 0.4, y: -0.2 },
    to: { x: 0.62, y: 1.2 },
    widthRatio: 0.42,
    travelMs: 104000,
    spacing: 2.0,
    recede: 0,
    // Gentlest of the four. This is the lane in front and the one the eye
    // actually tracks, so a heavy surge here would be distracting where the
    // same motion in a back lane is not.
    speedCycles: 2,
    speedVariation: 0.32,
  },
];

const CARD_ASPECT = 4 / 5;
const CORNER_RADIUS = 16;

// Every card is knocked off its lane by a little, so the lane reads as a
// drift rather than as a line. Fractions of screen width, applied on both
// axes.
const MAX_DRIFT_X = 0.07;
const MAX_DRIFT_Y = 0.05;

// And tilted, because nothing hand-placed is square. The paths are straight
// so there is no tangent to follow and no curvature to shear by — this
// jitter is the only rotation, and it is what stops a lane looking like a
// conveyor.
const MAX_TILT_DEGREES = 9;

// A slow rotational hover on top of that fixed tilt.
//
// One cycle over HOVER_MS — deliberately long. A short cycle reads as a
// shake or a wobble; at this length it never resolves into a repeat while
// anyone is looking at it, and the card just seems to breathe. Exactly one
// whole cycle per loop keeps it continuous at the wrap.
const HOVER_MS = 30000;
// Peak swing, before each card's own 0.35-1.0 share of it. At 3.2 the
// effect was correctly implemented and simply invisible — a couple of
// degrees spread over 26 seconds is below the threshold anyone notices.
// This is still gentle enough to read as a hover rather than a rock.
const MAX_HOVER_DEGREES = 7;

type RoadCardProps = {
  uri: string;
  // Where this card sits in its lane's queue, 0..1. Added to the lane's
  // shared clock, so a whole lane runs off ONE animation.
  offset: number;
  progress: SharedValue<number>;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  width: number;
  height: number;
  driftX: number;
  driftY: number;
  tilt: number;
  recede: number;
  speedCycles: number;
  speedVariation: number;
  // Its own clock, shared by every card, so the hover is one animation
  // rather than one per photo.
  hover: SharedValue<number>;
  // Where this card sits in that shared cycle, so they do not all lean the
  // same way at the same moment.
  hoverPhase: number;
  hoverAmount: number;
};

function RoadCard({
  uri,
  offset,
  progress,
  fromX,
  fromY,
  toX,
  toY,
  width,
  height,
  driftX,
  driftY,
  tilt,
  recede,
  speedCycles,
  speedVariation,
  hover,
  hoverPhase,
  hoverAmount,
}: RoadCardProps) {
  const animatedStyle = useAnimatedStyle(() => {
    // The modulo recycles a card to the start of its lane the moment it
    // reaches the end, so the lane never runs dry and nothing re-mounts.
    const u = (progress.value + offset) % 1;

    // Variable speed, without touching the clock.
    //
    // The clock stays perfectly linear and this warps POSITION against it:
    //   warp(u) = u - (A / 2πk)·sin(2πk·u)
    // whose derivative is 1 - A·cos(2πk·u) — a speed that oscillates
    // between (1-A) and (1+A) as the card moves along the run.
    //
    // Two properties make it safe. warp(0) = 0 and warp(1) = 1 exactly
    // (sin is zero at both ends for whole k), so the recycle at the end of
    // the lane is still seamless. And the derivative never reaches zero
    // while A < 1, so a card always moves forward and never stalls or
    // backs up.
    //
    // Because the warp is a function of position rather than of time, every
    // card on a lane slows at the SAME PLACES along the path — it reads as
    // the route having character, not as the cards behaving erratically.
    const k = speedCycles * Math.PI * 2;
    const warped = u - (speedVariation / k) * Math.sin(k * u);

    // Straight line from one endpoint to the other, plus this card's own
    // fixed displacement. The drift is added AFTER the interpolation so it
    // stays constant along the run — a card keeps its offset from the lane
    // rather than wandering as it travels.
    const x = fromX + (toX - fromX) * warped + driftX;
    const y = fromY + (toY - fromY) * warped + driftY;

    // The fixed tilt this card was dealt, plus a slow drift around it.
    const lean = tilt + Math.sin(hover.value * Math.PI * 2 + hoverPhase) * hoverAmount;

    return {
      transform: [
        { translateX: x - width / 2 },
        { translateY: y - height / 2 },
        { rotateZ: `${lean}deg` },
      ],
    };
  });

  return (
    <Animated.View style={[styles.card, { width, height }, animatedStyle]} pointerEvents="none">
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={400}
        cachePolicy="memory-disk"
      />
      {/* Distance, painted ON the photo rather than applied as opacity to
          the card. The card stays fully opaque, so it hides whatever is
          behind it instead of ghosting through it. */}
      {recede > 0 && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: BrandColors.background, opacity: recede },
          ]}
          pointerEvents="none"
        />
      )}
    </Animated.View>
  );
}

function LaneCards({
  lane,
  images,
  laneIndex,
  screenWidth,
  screenHeight,
  hover,
}: {
  lane: Lane;
  images: string[];
  laneIndex: number;
  screenWidth: number;
  screenHeight: number;
  hover: SharedValue<number>;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    // One clock per lane. Linear because a lane moves at a constant speed;
    // easing would make its whole stream surge and stall together, which
    // reads as dropped frames rather than as motion.
    progress.value = withRepeat(
      withTiming(1, { duration: lane.travelMs, easing: Easing.linear }),
      -1,
      false
    );
  }, [progress, lane.travelMs]);

  const cards = useMemo(() => {
    const width = screenWidth * lane.widthRatio;
    const height = width / CARD_ASPECT;

    const fromX = lane.from.x * screenWidth;
    const fromY = lane.from.y * screenHeight;
    const toX = lane.to.x * screenWidth;
    const toY = lane.to.y * screenHeight;

    // How many fit along the lane at the requested spacing. Cards are then
    // placed at even fractions of the run, so the recycle at the end lands
    // exactly where the next card would have been.
    const runLength = Math.hypot(toX - fromX, toY - fromY);
    const count = Math.max(2, Math.round(runLength / (height * lane.spacing)));

    // Deterministic, so a card keeps its displacement and tilt across
    // re-renders instead of jumping on every frame React re-runs this.
    const next = randomFor(`lane:${lane.id}`);

    return Array.from({ length: count }, (_, index) => ({
      // Offset per lane as well as per card, so the same photo is not in
      // the same position in all three lanes at once.
      uri: images[(index + laneIndex * 2) % images.length],
      offset: index / count,
      fromX,
      fromY,
      toX,
      toY,
      width,
      height,
      driftX: (next() - 0.5) * 2 * MAX_DRIFT_X * screenWidth,
      driftY: (next() - 0.5) * 2 * MAX_DRIFT_Y * screenWidth,
      tilt: (next() - 0.5) * 2 * MAX_TILT_DEGREES,
      // Anywhere in the cycle, so a lane never leans as a block.
      hoverPhase: next() * Math.PI * 2,
      // And not all by the same amount — a card that barely moves next to
      // one that drifts noticeably is what keeps it from looking applied.
      hoverAmount: MAX_HOVER_DEGREES * (0.35 + next() * 0.65),
    }));
  }, [lane, images, laneIndex, screenWidth, screenHeight]);

  return (
    <>
      {cards.map((card, index) => (
        <RoadCard
          key={`${lane.id}:${index}`}
          uri={card.uri}
          offset={card.offset}
          progress={progress}
          fromX={card.fromX}
          fromY={card.fromY}
          toX={card.toX}
          toY={card.toY}
          width={card.width}
          height={card.height}
          driftX={card.driftX}
          driftY={card.driftY}
          tilt={card.tilt}
          recede={lane.recede}
          speedCycles={lane.speedCycles}
          speedVariation={lane.speedVariation}
          hover={hover}
          hoverPhase={card.hoverPhase}
          hoverAmount={card.hoverAmount}
        />
      ))}
    </>
  );
}

// Photos drifting across the welcome screen on three separate lanes.
//
// Reanimated rather than Skia, deliberately. Skia has never worked on this
// project's web target, and a canvas per card is exactly the GL-surface
// load that repeatedly faulted the host driver — see rating-stamp-svg.tsx.
// Everything here is a transform on a plain View.
//
// Renders nothing without images. The screen behind it is designed to stand
// on its own, so an empty pool is a quieter landing rather than a broken
// one.
export function WelcomeRoad({ images }: { images: string[] }) {
  const { width, height } = useWindowDimensions();

  // One clock for every card's hover, rather than one per photo. Exactly a
  // whole cycle per loop, so the sine is continuous where it wraps and no
  // card ever snaps back to its starting lean.
  const hover = useSharedValue(0);
  useEffect(() => {
    hover.value = withRepeat(
      withTiming(1, { duration: HOVER_MS, easing: Easing.linear }),
      -1,
      false
    );
  }, [hover]);

  if (images.length === 0) return null;

  return (
    <View style={styles.road} pointerEvents="none">
      {LANES.map((lane, laneIndex) => (
        <LaneCards
          key={lane.id}
          lane={lane}
          laneIndex={laneIndex}
          images={images}
          screenWidth={width}
          screenHeight={height}
          hover={hover}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  road: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  card: {
    position: 'absolute',
    // Positioned from the origin and moved entirely by transform, so the
    // animation never touches layout.
    left: 0,
    top: 0,
    borderRadius: CORNER_RADIUS,
    // Clips the photo to the rounded card. Without it the image paints its
    // own square corners over the radius.
    overflow: 'hidden',
  },
});
