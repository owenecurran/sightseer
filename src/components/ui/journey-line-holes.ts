import { useMemo, useState } from 'react';

import { useClearZones } from '@/components/ui/scroll-stage';

// Shared by journey-line.tsx (Skia) and journey-line.web.tsx (SVG): where a
// road is left out so it passes under a byline instead of through it.

// How far round a clear zone (a byline's avatar and name) the road is left
// out, so it stops a little short of the letters rather than at them.
const ZONE_MARGIN = 4;

export type RouteHole = { x: number; y: number; width: number; height: number };

// The clear zones on the stage (see ClearZoneView in scroll-stage.tsx) that
// fall on this route, in the route's own coordinates. Only the avatar and
// name themselves, wherever they sit: a band across the whole row also took
// the road out where it ran beside a short name, with nothing in the way.
export function routeHoles(
  frame: { x: number; y: number } | null,
  zones: { x: number; y: number; width: number; height: number }[],
  width: number,
  height: number,
): RouteHole[] {
  if (!frame) return [];
  return zones
    .map((zone) => ({
      x: zone.x - frame.x - ZONE_MARGIN,
      y: zone.y - frame.y - ZONE_MARGIN,
      width: zone.width + ZONE_MARGIN * 2,
      height: zone.height + ZONE_MARGIN * 2,
    }))
    .filter((hole) => hole.x < width && hole.x + hole.width > 0 && hole.y < height && hole.y + hole.height > 0);
}

function sameHoles(a: RouteHole[], b: RouteHole[]) {
  if (a.length !== b.length) return false;
  return a.every(
    (hole, i) =>
      Math.abs(hole.x - b[i].x) < 0.5 &&
      Math.abs(hole.y - b[i].y) < 0.5 &&
      Math.abs(hole.width - b[i].width) < 0.5 &&
      Math.abs(hole.height - b[i].height) < 0.5,
  );
}

// For a route: put `ref` and `onLayout` on its frame View (collapsable
// false) and leave `holes` out of the drawing.
//
// The holes keep their identity while their numbers do not change. Every
// byline on the screen registering or moving tells every route, and a feed
// loading thirty cards would otherwise redraw every canvas thirty times
// over for holes that are nowhere near most of them.
export function useRouteHoles(width: number, height: number) {
  const { ref, onLayout, frame, zones } = useClearZones();
  const next = useMemo(() => routeHoles(frame, zones, width, height), [frame, zones, width, height]);
  const [held, setHeld] = useState(next);
  const changed = held !== next && !sameHoles(held, next);
  if (changed) setHeld(next);
  return { ref, onLayout, holes: changed ? next : held };
}
