import { BrandColors } from '@/constants/theme';
import { randomFor } from '@/lib/seeded-random';
import { STAMP_WINDOW_RECT } from '@/lib/stamp-shape';

// Age and wear on a rating stamp — speckling, scuffs, corner rub and
// fading, varying per stamp so no two look alike.
//
// Built entirely from plain shapes with opacity. The obvious way to do
// grain is an SVG filter (feTurbulence), and that renders beautifully in a
// browser — but this artwork is an SVG data URI decoded by three different
// engines, and Android's does not implement filters. It does not skip the
// element either: a filtered rect paints as a flat black block, which is
// how it appeared on device. So everything here is geometry, which every
// renderer draws the same way.
//
// The wear colour is the frame's own cream rather than white or grey. What
// physically happens to a used stamp is that ink lifts and the paper shows
// through, so the paper colour is the correct one and it ties the window to
// the frame around it.

// Cream over the print (ink lifted, paper showing) and a dark tone for
// grime in the low spots. Both stay translucent — this is meant to read at
// a glance as texture, not as a pattern of dots.
const PAPER = BrandColors.cream;
const GRIME = '#2b1e0f';

// Coordinates are viewBox units, and one stamp's worth of these is
// concatenated into a data URI that lives in memory per rating/size/seed on
// screen. One decimal place is well below a pixel at any size the stamp is
// drawn and keeps the string roughly a third shorter than raw floats.
function n(value: number): string {
  return value.toFixed(1);
}

// How worn this particular stamp is, 0 (nearly mint) to 1 (battered).
//
// Squared rather than uniform, so most stamps land lightly worn and a
// heavily distressed one is uncommon. A uniform spread made the feed look
// uniformly grubby — the variation only reads as variation when a clean
// stamp is the norm and a beaten one is the exception.
function wearLevelFrom(next: () => number): number {
  return next() ** 2;
}

// Ink flaked off the print. The dominant effect, and the one that carries
// the "old paper" read at small sizes where nothing else survives.
function speckles(next: () => number, wear: number): string {
  const w = STAMP_WINDOW_RECT;
  const count = Math.round(18 + wear * 80);
  let out = '';
  for (let i = 0; i < count; i++) {
    const cx = w.x + next() * w.width;
    const cy = w.y + next() * w.height;
    // A few large flakes among many small ones. Cubing the radius draw
    // makes big ones rare, which is how real flaking looks — an even
    // spread of sizes reads as a halftone pattern instead.
    const r = 2 + next() ** 3 * 16;
    const isGrime = next() < 0.25;
    const opacity = 0.12 + next() * (isGrime ? 0.2 : 0.45);
    out += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${
      isGrime ? GRIME : PAPER
    }" opacity="${opacity.toFixed(2)}"/>`;
  }
  return out;
}

// Scratches. Thin rotated rectangles rather than strokes: a stroked line
// scales its width with the rest of the drawing, so at a small stamp size
// it either vanishes or turns into a hairline that aliases badly, while a
// filled shape stays proportionate.
function scratches(next: () => number, wear: number): string {
  const w = STAMP_WINDOW_RECT;
  const count = Math.round(next() * wear * 5);
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = w.x + next() * w.width;
    const y = w.y + next() * w.height;
    const length = 60 + next() * 420;
    const thickness = 2 + next() * 5;
    const angle = -70 + next() * 140;
    const opacity = 0.1 + next() * 0.25;
    out +=
      `<rect x="${n(x)}" y="${n(y)}" width="${n(length)}" height="${n(thickness)}" ` +
      `fill="${PAPER}" opacity="${opacity.toFixed(2)}" ` +
      `transform="rotate(${n(angle)} ${n(x)} ${n(y)})"/>`;
  }
  return out;
}

// Rub at the corners, where a stamp in a pocket or an album wears first.
// An irregular quad rather than a circle so the edge reads as torn rather
// than as a drawn arc.
function cornerRub(next: () => number, wear: number): string {
  const w = STAMP_WINDOW_RECT;
  const corners: [number, number][] = [
    [w.x, w.y],
    [w.x + w.width, w.y],
    [w.x, w.y + w.height],
    [w.x + w.width, w.y + w.height],
  ];
  let out = '';
  for (const [cx, cy] of corners) {
    // Each corner independently, so a stamp can be rubbed on one and clean
    // on the rest — wear on all four at once looks like a vignette.
    if (next() > wear * 0.8) continue;
    const reach = 60 + next() * 190;
    const towardX = cx === w.x ? 1 : -1;
    const towardY = cy === w.y ? 1 : -1;
    const p1 = `${n(cx)},${n(cy + towardY * reach * (0.6 + next() * 0.8))}`;
    const p2 = `${n(cx + towardX * reach * (0.5 + next() * 0.6))},${n(
      cy + towardY * reach * (0.4 + next() * 0.5)
    )}`;
    const p3 = `${n(cx + towardX * reach * (0.6 + next() * 0.8))},${n(cy)}`;
    const opacity = 0.18 + next() * 0.4;
    out += `<polygon points="${n(cx)},${n(cy)} ${p1} ${p2} ${p3}" fill="${PAPER}" opacity="${opacity.toFixed(
      2
    )}"/>`;
  }
  return out;
}

// Overall sun-fading, as a flat wash. Capped low: past about 0.12 it stops
// looking like age and starts looking like the rating colour is simply
// wrong, which matters because that colour is carrying meaning.
function fade(wear: number): string {
  const w = STAMP_WINDOW_RECT;
  const opacity = wear * 0.12;
  if (opacity < 0.01) return '';
  return `<rect x="${n(w.x)}" y="${n(w.y)}" width="${n(w.width)}" height="${n(
    w.height
  )}" fill="${PAPER}" opacity="${opacity.toFixed(2)}"/>`;
}

// The wear overlay for one stamp. Sits above the design and below the
// rating number — the number is a real text node in the component, so it
// stays on top for free and never gets speckled into illegibility.
//
// Its own PRNG stream, keyed off the seed with a distinct prefix, so
// changing how wear is drawn cannot shift which design a stamp picks.
export function buildWearSvg(seed: string): string {
  const next = randomFor(`wear:${seed}`);
  const wear = wearLevelFrom(next);
  return fade(wear) + speckles(next, wear) + scratches(next, wear) + cornerRub(next, wear);
}
