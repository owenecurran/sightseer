import { Skia, type SkPath } from '@shopify/react-native-skia';

// Real geometry from assets/brand-source/loading-icon.svg (NOT approximated
// — an earlier attempt at this hand-typed a bezier curve for the second
// shape that doesn't match; the source SVG uses a <polyline> there, straight
// segments, not curves). viewBox is 0 0 1475.53 1751.56, but fitPath below
// scales off the path's own computed bounds, not the nominal viewBox, so
// that's not needed here.
//
// Shared by liquid-glass-track.tsx (the rating slider's own icon) and
// rating-glass-badge.tsx (the static rating display reusing the same mark)
// — moved here so both draw from one source of truth instead of two copies
// silently drifting apart.
const HEAD_PATH_SVG =
  'M804.97,286.72c0,90.67-42.66,171.51-109.26,224.05-49.71,39.22-112.76,62.67-181.37,62.67-160.51,0-290.62-128.37-290.62-286.72S353.84,0,514.34,0s290.62,128.37,290.62,286.72Z';
const MARK_POLYLINE_POINTS =
  '963.02 592.81 1141.14 560 1321.88 305.31 1475.53 393.75 1141.14 758.44 850.52 827.19 947.39 1333.44 1358.33 1545.94 1128.64 1694.38 703.66 1378.12 591.16 1379.69 428.66 1751.56 136.47 1721.88 355.22 1342.19 416.16 896.88 39.59 1379.69 0 1158.44 281.78 779.69 467.72 635.94 789.58 586.56';

function parsePolylinePoints(raw: string): { x: number; y: number }[] {
  const nums = raw.trim().split(/\s+/).map(Number);
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < nums.length; i += 2) points.push({ x: nums[i], y: nums[i + 1] });
  return points;
}

export function buildBrandMarkPath(): SkPath {
  const path = Skia.Path.MakeFromSVGString(HEAD_PATH_SVG)!;
  const mark = Skia.Path.Make();
  mark.addPoly(parsePolylinePoints(MARK_POLYLINE_POINTS), true);
  path.addPath(mark);
  return path;
}

// Scales+centers a copy of `src` to fit within a `size` x `size` box, at
// `fill` fraction of that box (so it doesn't touch the edges) — same
// transform math for any consumer, not just the slider's own canvas size.
export function fitBrandMarkPath(src: SkPath, size: number, fill = 0.72): SkPath {
  const path = src.copy();
  const b = path.computeTightBounds();
  const s = (size * fill) / Math.max(b.width, b.height);
  const m = Skia.Matrix();
  m.translate(size / 2, size / 2);
  m.scale(s, s);
  m.translate(-(b.x + b.width / 2), -(b.y + b.height / 2));
  path.transform(m);
  return path;
}
