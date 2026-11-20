import { randomFor } from '@/lib/seeded-random';

export type RoutePoint = { x: number; y: number };

export type JourneyRoute = {
  points: RoutePoint[];
  // Distance along the route to each point, for finding where the pen is
  // partway along it.
  lengths: number[];
  length: number;
  // Which way it swings out: 1 to the right, -1 to the left. The words go on
  // the other side.
  side: 1 | -1;
};

// How much of the routes loop the loop. Some, not all: a loop on every one
// stops being a flourish.
const LOOP_SHARE = 0.35;
const STEPS = 72;
const LOOP_STEPS = 28;

// The ways a route bows out between the two cards, as a function of how far
// along it is (0 to 1) giving how far out it is (around 0 to 1). The same
// two ends with a different hand each time.
const BOWS: ((t: number) => number)[] = [
  // An even arc.
  (t) => Math.sin(Math.PI * t),
  // Out early, then a long run in.
  (t) => Math.sin(Math.PI * Math.pow(t, 0.7)),
  // A long run out, then in late.
  (t) => Math.sin(Math.PI * Math.pow(t, 1.45)),
  // Two humps, as if round something in the way.
  (t) => Math.sin(Math.PI * t) * (0.8 + 0.35 * Math.cos(3 * Math.PI * t)),
];

// The road between two postcards stacked in a feed, from the middle of the
// one above to the middle of the one below, each end a little off centre,
// bowing out to one side on the way. Drawn by hand: it wanders slightly, and
// now and then loops the loop.
export function journeyRoute(seed: string, width: number, height: number): JourneyRoute {
  const random = randomFor(`journey-${seed}`);
  const side: 1 | -1 = random() < 0.5 ? -1 : 1;
  const bow = BOWS[Math.floor(random() * BOWS.length)];
  const reach = width * (0.14 + random() * 0.12);
  const startX = width * (0.5 + (random() - 0.5) * 0.1);
  const endX = width * (0.5 + (random() - 0.5) * 0.1);
  const loopAt = random() < LOOP_SHARE ? 0.38 + random() * 0.2 : null;
  const loopRadius = 11 + random() * 6;

  const along = (t: number): RoutePoint => ({
    x: startX + (endX - startX) * t + side * reach * bow(t),
    y: height * t,
  });

  const points: RoutePoint[] = [];
  let drift = 0;
  const wobble = (t: number) => {
    // None at the ends, so the route meets the cards exactly.
    drift = drift * 0.75 + (random() * 2 - 1) * 0.25;
    return drift * 2 * Math.sin(Math.PI * t);
  };
  for (let step = 0; step <= STEPS; step++) {
    const t = step / STEPS;
    const point = along(t);
    points.push({ x: point.x + wobble(t), y: point.y });
    if (loopAt != null && step === Math.round(loopAt * STEPS)) {
      // Round a circle sitting above where the route is, out the way it is
      // bowing, over the top, and back down, carried on a little as it
      // goes, so it closes the way a hand closes one: not quite on itself.
      for (let turn = 1; turn <= LOOP_STEPS; turn++) {
        const a = (turn / LOOP_STEPS) * Math.PI * 2;
        points.push({
          x: point.x + side * loopRadius * Math.sin(a),
          y: point.y - loopRadius * (1 - Math.cos(a)) + (turn / LOOP_STEPS) * 4,
        });
      }
    }
  }

  const lengths = [0];
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
    lengths.push(lengths[index - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return { points, lengths, length: lengths[lengths.length - 1], side };
}

// Where the pen is, a share of the way along the route.
export function pointAlong(route: { points: RoutePoint[]; lengths: number[]; length: number }, share: number) {
  'worklet';
  const { points, lengths, length } = route;
  const target = Math.min(1, Math.max(0, share)) * length;
  for (let index = 1; index < points.length; index++) {
    if (lengths[index] >= target) {
      const span = lengths[index] - lengths[index - 1] || 1;
      const t = (target - lengths[index - 1]) / span;
      return {
        x: points[index - 1].x + (points[index].x - points[index - 1].x) * t,
        y: points[index - 1].y + (points[index].y - points[index - 1].y) * t,
      };
    }
  }
  return points[points.length - 1];
}
