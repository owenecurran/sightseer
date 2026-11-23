import { randomFor } from '@/lib/seeded-random';

// Where tag stickers go on the written side of a postcard: in bare card,
// laid out as a small, deliberate group rather than filed in a wrapping row
// or thrown on at random.
//
// They used to be a wrapping row under the message. On a portrait card that
// column fits one sticker across, so three tags stacked into a tower and
// stretched the back far taller than the front. A free scatter came next, and
// looked messy: stickers piled over each other at odd angles. Now each card
// takes one of four arrangements, lined up with something printed on the
// card. Stickers are spaced by their actual shapes, so the bare card between
// them is even, and they overlap only slightly and only on some cards.

export type Rect = { x: number; y: number; width: number; height: number };

// A strip down the whole area that no sticker may cross or touch: the
// printed line between the message and the address, with its clearance.
// Kept apart from the obstacles because it runs the area's full height, and
// that height is what this file works out.
export type Wall = { x: number; width: number };

// The visible part of one sticker, as it is stuck on: leaning, and with its
// own die-cut (see stickerFootprint). `dx` and `dy` are how far the middle of
// that outline sits from its box's middle.
//
// The box's middle is the sticker's own middle, the one the eye goes by, and
// the outline is not always centred on it: the disco ball's reaches up to the
// end of its cord. So stickers are lined up by their boxes' middles and
// spaced by how far each outline reaches from there, up, down and to each
// side. Lining them up by the outlines' middles sat the ball low in a row.
export type Footprint = { width: number; height: number; dx: number; dy: number };

// How far a footprint reaches from its box's middle, each way.
function reach(foot: Footprint) {
  return {
    left: foot.width / 2 - foot.dx,
    right: foot.width / 2 + foot.dx,
    up: foot.height / 2 - foot.dy,
    down: foot.height / 2 + foot.dy,
  };
}

export type StickerSpot = {
  left: number;
  top: number;
};

type Point = { x: number; y: number };

// The four arrangements:
//  - row: side by side.
//  - column: one above another.
//  - zipper: two staggered columns, the stickers alternating left and right
//    on the way down.
//  - hzipper: two staggered rows, alternating up and down on the way across.
type Pattern = 'row' | 'column' | 'zipper' | 'hzipper';
const PATTERNS: Pattern[] = ['row', 'column', 'zipper', 'hzipper'];

// What the group lines up with: the writing's left edge, the middle of the
// card, or its right edge (the address side).
type Align = 'left' | 'centre' | 'right';
const ALIGNS: Align[] = ['left', 'centre', 'right'];

// The bare card between neighbouring stickers' cut edges, in points. GAP is
// the usual spacing. OVERLAP is the amount neighbours overlap on the cards
// that overlap at all: enough to show, not enough to hide anything.
export const GAP = 6;
const OVERLAP = -5;
// How often a card's stickers overlap.
const OVERLAP_CHANCE = 0.2;
// How far along a zipper each sticker moves past the one before, as a share
// of the two stickers' combined half-lengths. Under 1, so the two lines
// interlock like a zipper's teeth.
const STAGGER = 0.6;
// How finely the search moves the group down the card, in points.
const SCAN = 2;

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function crosses(a: Rect, wall: Wall): boolean {
  return a.x < wall.x + wall.width && wall.x < a.x + a.width;
}

// The stickers' middles (their boxes' middles) in this arrangement, relative
// to each other. `flip` starts a zipper on its other side.
function shape(pattern: Pattern, feet: Footprint[], gap: number, flip: boolean): Point[] {
  const n = feet.length;
  const r = feet.map(reach);
  const points: Point[] = [];
  // Which of the two lines of a zipper sticker i is on: 0 or 1.
  const side = (i: number) => ((i % 2 === 1) !== flip ? 1 : 0);

  switch (pattern) {
    case 'row': {
      let x = 0;
      for (let i = 0; i < n; i++) {
        if (i > 0) x += r[i - 1].right + gap + r[i].left;
        points.push({ x, y: 0 });
      }
      return points;
    }
    case 'column': {
      let y = 0;
      for (let i = 0; i < n; i++) {
        if (i > 0) y += r[i - 1].down + gap + r[i].up;
        points.push({ x: 0, y });
      }
      return points;
    }
    case 'zipper': {
      // Neighbours sit side by side, so the two columns are apart by the
      // widest neighbouring pair: the right edge of the one on the left, the
      // gap, and the left edge of the one on the right.
      let apart = 0;
      for (let i = 1; i < n; i++) {
        const [first, second] = side(i - 1) === 0 ? [i - 1, i] : [i, i - 1];
        apart = Math.max(apart, r[first].right + gap + r[second].left);
      }
      let y = 0;
      for (let i = 0; i < n; i++) {
        if (i > 0) y += STAGGER * (r[i - 1].down + r[i].up);
        // Two down in the same column has to clear the one above it.
        if (i > 1) y = Math.max(y, points[i - 2].y + r[i - 2].down + gap + r[i].up);
        points.push({ x: side(i) * apart, y });
      }
      return points;
    }
    case 'hzipper': {
      let apart = 0;
      for (let i = 1; i < n; i++) {
        const [first, second] = side(i - 1) === 0 ? [i - 1, i] : [i, i - 1];
        apart = Math.max(apart, r[first].down + gap + r[second].up);
      }
      let x = 0;
      for (let i = 0; i < n; i++) {
        if (i > 0) x += STAGGER * (r[i - 1].right + r[i].left);
        if (i > 1) x = Math.max(x, points[i - 2].x + r[i - 2].right + gap + r[i].left);
        points.push({ x, y: side(i) * apart });
      }
      return points;
    }
  }
}

type Layout = {
  pattern: Pattern;
  align: Align;
  gap: number;
  flip: boolean;
  centres: Point[];
  // How tall the area has to be for this layout: the bottom of its lowest
  // sticker.
  bottom: number;
};

// The highest place on the card this arrangement fits, lined up as asked, or
// null when it is too wide. Searched from the top down, so the group sits
// just under whatever is printed above it.
function fit(
  pattern: Pattern,
  align: Align,
  gap: number,
  flip: boolean,
  feet: Footprint[],
  width: number,
  obstacles: Rect[],
  walls: Wall[],
): Layout | null {
  const points = shape(pattern, feet, gap, flip);
  const r = feet.map(reach);
  const minX = Math.min(...points.map((p, i) => p.x - r[i].left));
  const maxX = Math.max(...points.map((p, i) => p.x + r[i].right));
  const minY = Math.min(...points.map((p, i) => p.y - r[i].up));
  const maxY = Math.max(...points.map((p, i) => p.y + r[i].down));
  const groupWidth = maxX - minX;
  if (groupWidth > width) return null;

  // Lined up by the stickers' visible edges, so a group set "left" starts
  // exactly where the writing starts.
  const left = align === 'left' ? 0 : align === 'centre' ? (width - groupWidth) / 2 : width - groupWidth;
  // The visible outline of sticker i with its middle at c.
  const rectAt = (c: Point, i: number) => ({
    x: c.x - r[i].left,
    y: c.y - r[i].up,
    width: feet[i].width,
    height: feet[i].height,
  });
  // A wall runs the whole height, so a group across one fits nowhere.
  const across = points.map((p) => ({ x: left + (p.x - minX), y: 0 }));
  if (across.some((c, i) => walls.some((wall) => crosses(rectAt(c, i), wall)))) return null;
  // Below every obstacle the group always fits, so the search never needs to
  // go further than that.
  const lowest = Math.max(0, ...obstacles.map((o) => o.y + o.height));

  for (let top = 0; top <= lowest + SCAN; top += SCAN) {
    const centres = points.map((p) => ({ x: left + (p.x - minX), y: top + (p.y - minY) }));
    const clear = centres.every((c, i) => !obstacles.some((o) => intersects(rectAt(c, i), o)));
    if (clear) return { pattern, align, gap, flip, centres, bottom: top + (maxY - minY) };
  }
  return null;
}

function allFits(
  feet: Footprint[],
  width: number,
  obstacles: Rect[],
  walls: Wall[],
  gaps: number[],
  flips: boolean[],
): Layout[] {
  const layouts: Layout[] = [];
  for (const gap of gaps)
    for (const flip of flips)
      for (const pattern of PATTERNS)
        for (const align of ALIGNS) {
          const layout = fit(pattern, align, gap, flip, feet, width, obstacles, walls);
          if (layout) layouts.push(layout);
        }
  return layouts;
}

// How tall the area has to be for the stickers to fit somewhere around what
// is already printed in it. It is never less than `floor`. This is the
// cheapest layout's height, so the card grows no more than it must.
//
// It depends only on the width and on where the writing, the postmark and
// the walls are, and none of those depend on the area's height. That is what
// lets the caller feed it back as a minHeight without a layout loop.
export function stickerRoomFor(
  feet: Footprint[],
  width: number,
  obstacles: Rect[],
  walls: Wall[],
  floor: number,
): number {
  if (feet.length === 0) return floor;
  const layouts = allFits(feet, width, obstacles, walls, [GAP], [false, true]);
  if (layouts.length === 0) return floor;
  return Math.max(floor, Math.ceil(Math.min(...layouts.map((l) => l.bottom))));
}

// Where each sticker goes, as the top-left of its `box`-square. Seeded, so a
// card keeps the same arrangement every time it is drawn.
export function arrangeStickers(
  feet: Footprint[],
  box: number,
  width: number,
  height: number,
  obstacles: Rect[],
  walls: Wall[],
  seed: string,
): StickerSpot[] {
  const random = randomFor(`sticker-arrangement:${seed}`);
  const gap = random() < OVERLAP_CHANCE ? OVERLAP : GAP;
  const flip = random() < 0.5;
  const pattern = PATTERNS[Math.floor(random() * PATTERNS.length)];
  const align = ALIGNS[Math.floor(random() * ALIGNS.length)];

  // Everything that fits in the height the area actually has.
  const fits = allFits(feet, width, obstacles, walls, [gap, gap === GAP ? OVERLAP : GAP], [flip, !flip]).filter(
    (layout) => layout.bottom <= height + 0.5,
  );
  const pick = (layouts: Layout[]) =>
    layouts.length > 0 ? layouts[Math.floor(random() * layouts.length)] : undefined;

  // This card's own choice if it fits; otherwise the closest to it: the same
  // pattern lined up differently, then another pattern at this card's
  // spacing, then anything.
  const chosen =
    fits.find((l) => l.pattern === pattern && l.align === align && l.gap === gap && l.flip === flip) ??
    pick(fits.filter((l) => l.pattern === pattern && l.gap === gap)) ??
    pick(fits.filter((l) => l.gap === gap)) ??
    fits[0];

  // Nothing fits at all, such as before the writing has been measured
  // properly: a row along the bottom.
  const centres =
    chosen?.centres ??
    feet.map((foot, i) => ({ x: (width * (i + 1)) / (feet.length + 1), y: height - reach(foot).down }));

  // The layout placed each sticker's middle, which is its box's middle.
  return centres.map((c) => ({ left: c.x - box / 2, top: c.y - box / 2 }));
}
