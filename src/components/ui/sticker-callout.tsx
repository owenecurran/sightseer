import { Image } from 'expo-image';
import { useMemo } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { BrandFonts } from '@/constants/theme';
import { svgDataUri } from '@/lib/base64';

// The name that appears beside a tag sticker when it is tapped: written on a
// small label stuck to the card, with a pen arrow from the label to the
// sticker.
//
// It used to be the name written straight onto the card in cream with an
// arrow curling down to the sticker, always up and to one side. Two things
// were wrong with that. Cream lettering on a dark card, over a map or another
// sticker, was hard to read even with a halo; and up-and-to-one-side ran off
// the card for any sticker near its top. Now the name sits on its own label,
// and the label can go on any of six sides, so the card can put it wherever
// there is room (see chooseCalloutSide).

export type CalloutSide = 'above-right' | 'above-left' | 'below-right' | 'below-left' | 'right' | 'left';

// The label's text, and the label round it.
const FONT_SIZE = 16;
const LINE = 19;
const PAD_X = 9;
const PAD_Y = 4;
const BORDER = 2;
const MAX_WIDTH = 136;
// The hand face's advance widths, in ems (from PatrickHand-Regular.ttf's
// hmtx table), for working out how big a label will be before it is laid
// out. It used to be a flat 7.6 points a character, which made "Young
// people" a fifth wider than it is: the label was turned away from a side it
// fitted on, and put over the card's action row instead.
const HAND_ADVANCES: Record<string, number> = {
  ' ': 0.23, '!': 0.247, '&': 0.53, "'": 0.164, '(': 0.334, ')': 0.364, ',': 0.202, '-': 0.404, '.': 0.214,
  '/': 0.423, '0': 0.448, '1': 0.363, '2': 0.468, '3': 0.448, '4': 0.375, '5': 0.423, '6': 0.399,
  '7': 0.495, '8': 0.433, '9': 0.367, ':': 0.232, '?': 0.368, A: 0.488, B: 0.507, C: 0.548, D: 0.475,
  E: 0.442, F: 0.375, G: 0.48, H: 0.468, I: 0.235, J: 0.37, K: 0.523, L: 0.372, M: 0.595, N: 0.532,
  O: 0.556, P: 0.481, Q: 0.655, R: 0.454, S: 0.459, T: 0.468, U: 0.55, V: 0.562, W: 0.616, X: 0.601,
  Y: 0.442, Z: 0.507, a: 0.392, b: 0.412, c: 0.388, d: 0.39, e: 0.398, f: 0.359, g: 0.445, h: 0.42,
  i: 0.224, j: 0.235, k: 0.415, l: 0.266, m: 0.68, n: 0.452, o: 0.403, p: 0.428, q: 0.463, r: 0.385,
  s: 0.385, t: 0.344, u: 0.4, v: 0.4, w: 0.463, x: 0.448, y: 0.423, z: 0.428,
};
// Anything not in the table counts as a wide character, so a guess can only
// make a label bigger than it is.
const UNKNOWN_ADVANCE = 0.65;

function handWidth(text: string): number {
  let width = 0;
  for (const char of text) width += HAND_ADVANCES[char] ?? UNKNOWN_ADVANCE;
  return width * FONT_SIZE;
}
// The arrow: how far it runs from the label to the sticker, how far it bows,
// and its head.
const REACH_X = 22;
const REACH_Y = 26;
const SIDE_REACH = 30;
const BOW = 0.3;
const HEAD = 6;
const HEAD_ANGLE = 0.5;
// Clear card between the arrow's point and the sticker's edge.
const TIP_GAP = 3;
const INK = '#2b2320';
const CREAM = '#f6f1df';

type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

// What the arrow points at: the sticker's visible shape, upright, and its
// lean (see stickerBody). Declared here rather than imported, so this file
// does not depend on the sticker's.
export type CalloutTarget = { width: number; height: number; dx: number; dy: number; round: boolean; tilt: number };

// Which way from the sticker's middle each side's arrow comes in.
const DIRECTIONS: Record<CalloutSide, Point> = {
  'above-right': { x: 0.51, y: -0.86 },
  'above-left': { x: -0.51, y: -0.86 },
  'below-right': { x: 0.51, y: 0.86 },
  'below-left': { x: -0.51, y: 0.86 },
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
};

// Where the arrow ends (just off the sticker's edge) and where it starts (the
// label's corner or edge), in the sticker box's own coordinates.
//
// The point is worked out from the sticker's own shape, as it leans: the edge
// of a curve for a drawing or a stamp, the edge of a box for lettering or a
// label. It used to be a fixed point on a circle most of the box across,
// which suits a round sticker; lettering is short and wide, so the arrow on
// BUZZING ended 16 points above its letters, pointing at bare card, and on
// the left or right it ran into the end of a long label.
function anchors(side: CalloutSide, box: number, target: CalloutTarget): { tip: Point; tail: Point } {
  const d = DIRECTIONS[side];
  const a = target.width / 2;
  const b = target.height / 2;
  // How far along `d` the edge is from the shape's middle.
  const edge = target.round
    ? 1 / Math.hypot(d.x / a, d.y / b)
    : Math.min(d.x !== 0 ? a / Math.abs(d.x) : Infinity, d.y !== 0 ? b / Math.abs(d.y) : Infinity);
  // Upright, from the box's middle; then turned with the sticker about it.
  const px = target.dx + d.x * (edge + TIP_GAP);
  const py = target.dy + d.y * (edge + TIP_GAP);
  const t = (target.tilt * Math.PI) / 180;
  const tip = {
    x: box / 2 + px * Math.cos(t) - py * Math.sin(t),
    y: box / 2 + px * Math.sin(t) + py * Math.cos(t),
  };
  const across = Math.sign(d.x);
  const tail =
    d.y === 0
      ? { x: tip.x + across * SIDE_REACH, y: tip.y - 4 }
      : { x: tip.x + across * REACH_X, y: tip.y + Math.sign(d.y) * REACH_Y };
  return { tip, tail };
}

// How big the label will come out: its width and height, broken into lines
// at spaces the way the text will be, two lines at most. A couple of points
// over, for rounding.
export function estimateLabelSize(label: string): { width: number; height: number } {
  const inner = MAX_WIDTH - (PAD_X + BORDER) * 2;
  let lines = 1;
  let line = '';
  let widest = 0;
  for (const word of label.split(' ')) {
    const longer = line ? `${line} ${word}` : word;
    if (line === '' || handWidth(longer) <= inner) {
      line = longer;
    } else {
      widest = Math.max(widest, handWidth(line));
      lines += 1;
      line = word;
    }
  }
  widest = Math.max(widest, handWidth(line));
  return {
    width: Math.min(MAX_WIDTH, widest + 2 + (PAD_X + BORDER) * 2),
    height: Math.min(lines, 2) * LINE + (PAD_Y + BORDER) * 2,
  };
}

// Where the label goes for this side, as a style relative to the sticker's
// box. Anchored by its corner or edge nearest the sticker, so the arrow meets
// it wherever its text ends: a label that wraps grows away from the sticker
// rather than over it. The arrow's start tucks a few points under the label.
function labelPlacement(side: CalloutSide, box: number, target: CalloutTarget): ViewStyle {
  const { tail } = anchors(side, box, target);
  switch (side) {
    case 'above-right':
      return { left: tail.x - 6, bottom: box - tail.y - 4 };
    case 'above-left':
      return { right: box - tail.x - 6, bottom: box - tail.y - 4 };
    case 'below-right':
      return { left: tail.x - 6, top: tail.y - 4 };
    case 'below-left':
      return { right: box - tail.x - 6, top: tail.y - 4 };
    case 'right':
      return { left: tail.x - 4, top: tail.y - (LINE + (PAD_Y + BORDER) * 2) / 2 };
    case 'left':
      return { right: box - tail.x - 4, top: tail.y - (LINE + (PAD_Y + BORDER) * 2) / 2 };
  }
}

// The label's own rectangle for this side, relative to the sticker's box,
// given its size.
function labelRect(side: CalloutSide, box: number, target: CalloutTarget, label: { width: number; height: number }): Rect {
  const place = labelPlacement(side, box, target);
  const x = place.left != null ? (place.left as number) : box - (place.right as number) - label.width;
  const y = place.top != null ? (place.top as number) : box - (place.bottom as number) - label.height;
  return { x, y, width: label.width, height: label.height };
}

// The space the label and its arrow take for this side, relative to the
// sticker's box, given the label's size. What chooseCalloutSide checks
// against the card.
export function calloutBounds(
  side: CalloutSide,
  box: number,
  target: CalloutTarget,
  label: { width: number; height: number },
): Rect {
  const { tip, tail } = anchors(side, box, target);
  const rect = labelRect(side, box, target, label);
  const minX = Math.min(rect.x, tip.x, tail.x);
  const minY = Math.min(rect.y, tip.y, tail.y);
  const maxX = Math.max(rect.x + rect.width, tip.x, tail.x);
  const maxY = Math.max(rect.y + rect.height, tip.y, tail.y);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

// The pen arrow from the label to the sticker, as an image placed in the
// sticker box's coordinates. A curve that bows away from the sticker, so it
// swoops in rather than sitting as a straight stick, with an open head at the
// sticker end. Cream for the card, over a dark edge so it shows over a map,
// a photograph or another sticker as well as over bare card.
function arrowImage(side: CalloutSide, box: number, target: CalloutTarget) {
  const { tip, tail } = anchors(side, box, target);
  const mid = { x: (tip.x + tail.x) / 2, y: (tip.y + tail.y) / 2 };
  const dx = tip.x - tail.x;
  const dy = tip.y - tail.y;
  const length = Math.hypot(dx, dy);
  const normal = { x: -dy / length, y: dx / length };
  // Of the two ways it could bow, the one away from the sticker's middle.
  const centre = { x: box / 2, y: box / 2 };
  const bowA = { x: mid.x + normal.x * length * BOW, y: mid.y + normal.y * length * BOW };
  const bowB = { x: mid.x - normal.x * length * BOW, y: mid.y - normal.y * length * BOW };
  const control =
    Math.hypot(bowA.x - centre.x, bowA.y - centre.y) > Math.hypot(bowB.x - centre.x, bowB.y - centre.y) ? bowA : bowB;
  // The head, back along the curve's direction at the tip.
  const back = { x: control.x - tip.x, y: control.y - tip.y };
  const backLength = Math.hypot(back.x, back.y);
  const unit = { x: back.x / backLength, y: back.y / backLength };
  const barb = (angle: number) => ({
    x: tip.x + HEAD * (unit.x * Math.cos(angle) - unit.y * Math.sin(angle)),
    y: tip.y + HEAD * (unit.x * Math.sin(angle) + unit.y * Math.cos(angle)),
  });
  const left = barb(HEAD_ANGLE);
  const right = barb(-HEAD_ANGLE);

  const pad = 4;
  const xs = [tip.x, tail.x, control.x, left.x, right.x];
  const ys = [tip.y, tail.y, control.y, left.y, right.y];
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const width = Math.max(...xs) + pad - minX;
  const height = Math.max(...ys) + pad - minY;
  const at = (p: Point) => `${(p.x - minX).toFixed(1)} ${(p.y - minY).toFixed(1)}`;
  const path = `M${at(tail)} Q${at(control)} ${at(tip)} M${at(left)} L${at(tip)} L${at(right)}`;
  const stroke = (color: string, w: number) =>
    `<path d="${path}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  return {
    uri: svgDataUri(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(1)}" height="${height.toFixed(1)}" ` +
        `viewBox="0 0 ${width.toFixed(1)} ${height.toFixed(1)}">` +
        stroke('rgba(14, 24, 18, 0.85)', 4.4) +
        stroke(CREAM, 2) +
        `</svg>`,
    ),
    style: { position: 'absolute' as const, left: minX, top: minY, width, height },
  };
}

// Which side to put a sticker's name on: the first, in an order that points
// toward the middle of the card, where its label and arrow fit inside
// `limits` (the card's usable area, in the same coordinates as `sticker`, the
// sticker's box) and the label covers none of `avoid` (the writing, the
// stamp and postmark, the other stickers). Failing that, the side whose label
// stays inside and covers least of them; failing that, the side that sticks
// out least.
//
// Staying inside the card comes first: a label cut off by the card's edge is
// unreadable, one over the end of a line of writing only for a few seconds.
export function chooseCalloutSide(
  sticker: { left: number; top: number; box: number; target: CalloutTarget },
  label: string,
  limits: Rect,
  avoid: Rect[] = [],
): CalloutSide {
  const size = estimateLabelSize(label);
  const centreX = sticker.left + sticker.box / 2 + sticker.target.dx;
  const centreY = sticker.top + sticker.box / 2 + sticker.target.dy;
  const across: 'right' | 'left' = centreX < limits.x + limits.width / 2 ? 'right' : 'left';
  const other = across === 'right' ? 'left' : 'right';
  const vertical: 'above' | 'below' = centreY > limits.y + limits.height / 2 ? 'above' : 'below';
  const otherVertical = vertical === 'above' ? 'below' : 'above';
  const order: CalloutSide[] = [
    `${vertical}-${across}`,
    across,
    `${otherVertical}-${across}`,
    `${vertical}-${other}`,
    other,
    `${otherVertical}-${other}`,
  ];

  let best = order[0];
  let bestOverflow = Infinity;
  let bestCovered = Infinity;
  for (const side of order) {
    const b = calloutBounds(side, sticker.box, sticker.target, size);
    const x0 = sticker.left + b.x;
    const y0 = sticker.top + b.y;
    const overflow =
      Math.max(0, limits.x - x0) +
      Math.max(0, x0 + b.width - (limits.x + limits.width)) +
      Math.max(0, limits.y - y0) +
      Math.max(0, y0 + b.height - (limits.y + limits.height));
    const own = labelRect(side, sticker.box, sticker.target, size);
    const placed = { ...own, x: sticker.left + own.x, y: sticker.top + own.y };
    const covered = avoid.reduce((sum, rect) => sum + overlapArea(placed, rect), 0);
    if (overflow === 0 && covered === 0) return side;
    if (overflow < bestOverflow || (overflow === bestOverflow && covered < bestCovered)) {
      best = side;
      bestOverflow = overflow;
      bestCovered = covered;
    }
  }
  return best;
}

type StickerCalloutProps = {
  side: CalloutSide;
  // The sticker's box, which everything here is placed against.
  box: number;
  // The sticker's visible shape in that box, which the arrow points at.
  target: CalloutTarget;
  label: string;
  // The sticker's own colours: the label's border, and its ink.
  border: string;
  ink: string;
  // A slight lean, as a label stuck on by hand has.
  tilt: number;
};

// The arrow and the label, placed around a sticker's box. Drawn inside the
// sticker's own view, which must not clip it.
//
// The label sits in a holder MAX_WIDTH wide, pinned at its anchor and
// aligned toward it. Positioned by itself, the label was measured against
// the sticker's box, about 73 points, not its own maximum, and "Kid-friendly"
// came out broken mid-word over two lines.
export function StickerCallout({ side, box, target, label, border, ink, tilt }: StickerCalloutProps) {
  const arrow = useMemo(() => arrowImage(side, box, target), [side, box, target]);
  const growsLeft = side === 'above-left' || side === 'below-left' || side === 'left';
  return (
    <>
      <Image source={{ uri: arrow.uri }} style={arrow.style} />
      <View style={[styles.holder, labelPlacement(side, box, target), growsLeft ? styles.toRight : styles.toLeft]}>
        <View style={[styles.label, { borderColor: border, transform: [{ rotate: `${tilt}deg` }] }]}>
          <Text allowFontScaling={false} numberOfLines={2} style={[styles.text, { color: ink }]}>
            {label}
          </Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  holder: {
    position: 'absolute',
    width: MAX_WIDTH,
  },
  // Which way the label grows from its anchor: away from the sticker.
  toLeft: {
    alignItems: 'flex-start',
  },
  toRight: {
    alignItems: 'flex-end',
  },
  // A cream label with a border in the sticker's colour: the same family as
  // the oval word labels, so it reads as one more thing stuck on the card.
  label: {
    maxWidth: MAX_WIDTH,
    paddingHorizontal: PAD_X,
    paddingVertical: PAD_Y,
    borderWidth: BORDER,
    borderRadius: 7,
    backgroundColor: CREAM,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.45)',
  },
  text: {
    fontFamily: BrandFonts.hand,
    fontSize: FONT_SIZE,
    lineHeight: LINE,
    color: INK,
    // A name that wraps onto a second line keeps both lines centred on the
    // label, rather than the shorter one hanging off to the left.
    textAlign: 'center',
  },
});
