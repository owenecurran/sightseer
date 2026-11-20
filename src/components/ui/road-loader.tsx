import { Canvas, DashPathEffect, Group, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { randomFor } from '@/lib/seeded-random';

// Declared above the worklets that read them: a worklet takes its closure
// where it is defined (see unfold.tsx for what happens otherwise).
const WIDTH = 240;
const HEIGHT = 120;
const MARGIN = 14;
// How far the road climbs on its way across, and how far it bends either
// side of that.
const CLIMB = 40;
const SWING = 16;
const HALF_WIDTH = 13;
// Points along the road, in points apart. Close enough that the curve reads
// as drawn rather than joined up.
const STEP = 5;
// How far a hand-drawn line wanders off its true course, roughly in points.
const WOBBLE = 3;
const DASH = 9;
const GAP = 8;
const DRAW_IN_MS = 900;
// One dash length travelled per cycle, so the loop has no seam.
const DASH_CYCLE_MS = 520;
// Each line is drawn three times, a little differently each time, and the
// loader steps between them: the "boiling" a hand-drawn animation has, where
// every frame is traced again. About eight steps a second.
const VARIANTS = 3;
const BOIL_STEP_MS = 125;

const PENCIL = 'rgba(234, 231, 207, 0.85)';
const PENCIL_ECHO = 'rgba(234, 231, 207, 0.35)';
const ROAD_FILL = 'rgba(234, 231, 207, 0.07)';
const CENTRE_LINE = 'rgba(234, 231, 207, 0.9)';

type Point = { x: number; y: number };

type Variant = {
  fill: SkPath;
  edges: SkPath[];
  // A second, fainter pass beside each edge, the way a pencil line gets
  // gone over.
  echoes: SkPath[];
  centre: SkPath;
};

// The full-page loader: a road, sketched in pencil, that draws itself across
// and then keeps its centre line moving, as if you were on your way.
export function RoadLoader() {
  const reduceMotion = useReducedMotion();
  const variants = useMemo(() => buildVariants(), []);
  const drawn = useSharedValue(reduceMotion ? 1 : 0);
  const phase = useSharedValue(0);
  const boil = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    drawn.value = withTiming(1, { duration: DRAW_IN_MS, easing: Easing.out(Easing.cubic) });
    // Phase falling, so the dashes travel the way the road was drawn.
    phase.value = withDelay(
      DRAW_IN_MS * 0.6,
      withRepeat(withTiming(-(DASH + GAP), { duration: DASH_CYCLE_MS, easing: Easing.linear }), -1, false),
    );
    boil.value = withRepeat(
      withTiming(VARIANTS, { duration: VARIANTS * BOIL_STEP_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(drawn);
      cancelAnimation(phase);
      cancelAnimation(boil);
    };
  }, [reduceMotion, drawn, phase, boil]);

  // Which drawing is showing: one at a time, stepping rather than fading.
  const shown0 = useDerivedValue(() => (Math.floor(boil.value) % VARIANTS === 0 ? 1 : 0));
  const shown1 = useDerivedValue(() => (Math.floor(boil.value) % VARIANTS === 1 ? 1 : 0));
  const shown2 = useDerivedValue(() => (Math.floor(boil.value) % VARIANTS === 2 ? 1 : 0));
  const shown = [shown0, shown1, shown2];
  const fillOpacity = useDerivedValue(() => drawn.value);

  return (
    <View style={styles.container} pointerEvents="none">
      <Canvas style={styles.canvas}>
        {variants.map((variant, index) => (
          <Group key={index} opacity={shown[index]}>
            {/* The surface fades in as the road is drawn. */}
            <Path path={variant.fill} color={ROAD_FILL} opacity={fillOpacity} />
            {variant.echoes.map((echo, side) => (
              <Path
                key={`echo-${side}`}
                path={echo}
                style="stroke"
                strokeWidth={1}
                strokeCap="round"
                strokeJoin="round"
                color={PENCIL_ECHO}
                start={0}
                end={drawn}
              />
            ))}
            {variant.edges.map((edge, side) => (
              <Path
                key={`edge-${side}`}
                path={edge}
                style="stroke"
                strokeWidth={1.6}
                strokeCap="round"
                strokeJoin="round"
                color={PENCIL}
                start={0}
                end={drawn}
              />
            ))}
            <Path
              path={variant.centre}
              style="stroke"
              strokeWidth={2.2}
              strokeCap="round"
              color={CENTRE_LINE}
              start={0}
              end={drawn}>
              <DashPathEffect intervals={[DASH, GAP]} phase={phase} />
            </Path>
          </Group>
        ))}
      </Canvas>
    </View>
  );
}

function buildVariants(): Variant[] {
  const road = centreline();
  return Array.from({ length: VARIANTS }, (_, index) => {
    const left = beside(road, -HALF_WIDTH, `road-left-${index}`, WOBBLE);
    const right = beside(road, HALF_WIDTH, `road-right-${index}`, WOBBLE);
    return {
      fill: band(left, right),
      edges: [smooth(left), smooth(right)],
      echoes: [
        smooth(beside(road, -HALF_WIDTH + 0.8, `road-left-echo-${index}`, WOBBLE * 1.4)),
        smooth(beside(road, HALF_WIDTH - 0.8, `road-right-echo-${index}`, WOBBLE * 1.4)),
      ],
      centre: smooth(beside(road, 0, `road-centre-${index}`, WOBBLE * 0.6)),
    };
  });
}

// The road's true course: an S that climbs from bottom left to top right,
// with the direction square to it at every point, to offset the edges along.
function centreline(): { points: Point[]; normals: Point[] } {
  const points: Point[] = [];
  for (let x = MARGIN; x <= WIDTH - MARGIN; x += STEP) {
    const t = (x - MARGIN) / (WIDTH - 2 * MARGIN);
    points.push({ x, y: HEIGHT / 2 - CLIMB * (t - 0.5) + SWING * Math.sin(t * Math.PI * 2) });
  }
  const normals = points.map((_, index) => {
    const before = points[Math.max(0, index - 1)];
    const after = points[Math.min(points.length - 1, index + 1)];
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: -dy / length, y: dx / length };
  });
  return { points, normals };
}

// A line drawn by hand alongside the road's course. The wander is smoothed
// from point to point, so it drifts like a hand rather than buzzing.
function beside(road: { points: Point[]; normals: Point[] }, offset: number, seed: string, wobble: number): Point[] {
  const random = randomFor(seed);
  let drift = 0;
  return road.points.map((point, index) => {
    drift = drift * 0.7 + (random() * 2 - 1) * 0.3;
    const distance = offset + drift * wobble;
    return {
      x: point.x + road.normals[index].x * distance,
      y: point.y + road.normals[index].y * distance,
    };
  });
}

// Through the points with a curve rather than straight segments, so the
// sketch has no corners.
function smooth(points: Point[]): SkPath {
  const path = Skia.Path.Make();
  path.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index];
    const next = points[index + 1];
    path.quadTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
  }
  const last = points[points.length - 1];
  path.lineTo(last.x, last.y);
  return path;
}

// The road's surface: out along one edge and back along the other.
function band(left: Point[], right: Point[]): SkPath {
  const path = Skia.Path.Make();
  path.moveTo(left[0].x, left[0].y);
  for (const point of left.slice(1)) path.lineTo(point.x, point.y);
  for (const point of [...right].reverse()) path.lineTo(point.x, point.y);
  path.close();
  return path;
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    width: WIDTH,
    height: HEIGHT,
  },
});
