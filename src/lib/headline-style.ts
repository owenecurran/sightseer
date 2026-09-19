import type { ColorValue, TextStyle } from 'react-native';

import { BrandFonts } from '@/constants/theme';
import { hashSeed, pickOneOfTwo } from '@/lib/seeded-random';

// How a place name is lettered across the front of its postcard.
//
// Two independent choices, both seeded off the visit id: which face, and what
// is printed behind it. They are independent because not every effect suits
// every face — a hairline serif disappears under a hard offset, a deco label
// looks wrong with no second colour at all — so each face declares the ones it
// is allowed and the pick only ever comes from that list.
//
// This replaced seven hand-written face-and-effect pairs. Every new effect
// there meant writing out another whole variant, and which faces had which
// treatment was implicit in the list rather than stated anywhere. Adding a
// face here means adding a row to HEADLINE_FACES and nothing else.

export type HeadlinePlate = { color: string; dx: number; dy: number };
export type HeadlineTreatment = {
  style: TextStyle;
  back: HeadlinePlate[];
  region: RegionTreatment;
};

// The broader location — "Montana, United States" — set against the place's
// own name.
//
// It used to be the app's ordinary small UI text, floating a clear gap above
// the name in plain grey. Next to lettering chosen per card and struck in two
// inks, it read as a caption that had wandered in from a different screen
// rather than as part of the printing. It is now set in a display face of its
// own, in the name's own colour, and tucked against it.
export type RegionTreatment = {
  style: TextStyle;
  // Which side of the name it sits on, and which margin it runs to. Two
  // independent draws, which is why they use a MIXED two-way pick — see
  // pickOneOfTwo. With a plain hash they would have been the same coin flip
  // twice and only two of these four arrangements could ever appear.
  above: boolean;
  alignRight: boolean;
  // How many points of the line box are empty on the side the name is on, over
  // and above the gap that is wanted there. The caller pulls the line toward
  // the name by this much, so that every face ends up the same distance off it
  // rather than however far its own metrics happened to leave it. See
  // regionBoxFor.
  tuck: number;
};

type RegionFace = {
  family: string;
  fontSize: number;
  letterSpacing?: number;
  textTransform?: TextStyle['textTransform'];
  // Where this face's letters actually sit inside the line box, in em.
  //
  // Two different boxes, and the gap between them is the whole problem this
  // solves. `box` is what the platform reserves for a line: the widest of the
  // font's hhea, OS/2 win and glyf bounding-box extents, which is what Android
  // and the browser both lay out from. `ink` is where the letters of THIS line
  // really reach — measured over the characters a region label can contain
  // (A-Z, a-z, digits, comma, the mid-dot separator, and the accented
  // capitals a place name brings with it), with the uppercase faces measured
  // on uppercase only.
  //
  // The two come apart badly on the all-caps faces. AntarcticanLight reserves
  // 0.209em of descent and its capitals use 0.107em of it, so a third of a
  // line's worth of empty space was printing between it and the name for a
  // descender that cannot occur. Read straight out of the font files with
  // fontTools; see regionBoxFor for what is done with them.
  metrics: {
    boxAscent: number;
    boxDescent: number;
    inkAscent: number;
    inkDescent: number;
  };
};

// The four faces dropped in for this line. Antarctican carries two weights,
// which are different enough to be worth offering as separate draws.
//
// Sized per face rather than uniformly: these have very different x-heights,
// and one point size across all of them made the didone tiny beside the
// grotesques.
const REGION_FACES: RegionFace[] = [
  {
    family: BrandFonts.regionRounded,
    fontSize: 12,
    letterSpacing: 0.4,
    metrics: { boxAscent: 0.918, boxDescent: 0.213, inkAscent: 0.918, inkDescent: 0.213 },
  },
  {
    family: BrandFonts.regionGrotesqueBold,
    fontSize: 12,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    metrics: { boxAscent: 1.061, boxDescent: 0.235, inkAscent: 0.86, inkDescent: 0.161 },
  },
  {
    family: BrandFonts.regionGrotesqueLight,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    metrics: { boxAscent: 1.004, boxDescent: 0.209, inkAscent: 0.864, inkDescent: 0.107 },
  },
  {
    family: BrandFonts.regionDidone,
    fontSize: 14,
    metrics: { boxAscent: 1.259, boxDescent: 0.609, inkAscent: 1.03, inkDescent: 0.265 },
  },
  {
    family: BrandFonts.regionDeco,
    fontSize: 13,
    letterSpacing: 0.6,
    metrics: { boxAscent: 1.084, boxDescent: 0.301, inkAscent: 1.081, inkDescent: 0.25 },
  },
];

// The vocabulary. Each is a way of putting a second colour behind the letters;
// what varies is where that colour sits.
//
//   none            nothing behind it at all.
//   softShadow      a blurred shadow, dropped slightly. The only blurred one —
//                   React Native gives a Text exactly one shadow, and blur is
//                   the thing a stacked copy cannot do.
//   outlineCentred  the second colour spans out evenly on every side with no
//                   offset. A halo rather than a throw.
//   floatingColor   a copy thrown far enough to read as its own shape sitting
//                   behind the word rather than as an edge on it.
//   outlineTopLeft  the second colour shows along the top-left edges.
//   extrudeUpRight  a run of copies stepping up and to the right, so the word
//                   reads as extruded from its bottom edge toward the top
//                   right corner.
//   borderOut       a hard border grown outward from the letterforms
//                   themselves, thick enough that neighbouring letters'
//                   borders run into each other. Not a bigger copy of the
//                   word: scaling a copy scales its ADVANCE WIDTHS too, so
//                   the second impression's letters walk away from the ones
//                   they are meant to back, further the longer the name. A
//                   border is grown from each letter where it already stands,
//                   so it cannot drift.
export type HeadlineEffect =
  | 'none'
  | 'softShadow'
  | 'outlineCentred'
  | 'floatingColor'
  | 'outlineTopLeft'
  | 'extrudeUpRight'
  | 'borderOut';

const ALL_EFFECTS: HeadlineEffect[] = [
  'none',
  'softShadow',
  'outlineCentred',
  'floatingColor',
  'outlineTopLeft',
  'extrudeUpRight',
  'borderOut',
];

type Face = {
  family: string;
  // The letter colour when neither the picture nor the palette pick supplies
  // one.
  base: string;
  letterSpacing?: number;
  textTransform?: TextStyle['textTransform'];
  // Overrides the headline type's own 34. See the note on the deco face.
  fontSize?: number;
  // Multiplies every throw and blur this face's effects use, so a heavy face
  // gets a second colour heavy enough to read against it.
  outlineScale?: number;
  effects: HeadlineEffect[];
};

// The spec. Each face may only ever be printed with the effects listed
// against it.
const HEADLINE_FACES: Face[] = [
  {
    family: BrandFonts.serifDisplay,
    base: '#f2efe0',
    // Title case, not caps — the only face here set that way. It is the
    // field-guide cover end of the rack, and shouting it defeats the point.
    textTransform: 'none',
    effects: ['none', 'softShadow'],
  },
  {
    family: BrandFonts.condensedHeavy,
    base: '#f4ecd4',
    effects: ALL_EFFECTS,
  },
  {
    family: BrandFonts.deco,
    base: '#f0e9d2',
    letterSpacing: -0.5,
    // Set larger than the others. StretchText's fill scales the type to the
    // card's width whatever size it starts at, so a bigger size does not make
    // the word wider — it makes it squeeze harder, and fill pays for
    // horizontal compression with vertical stretch. A bigger number here comes
    // out as a TALLER word at the same width, which is what a deco label
    // wants.
    fontSize: 46,
    // And a heavier second colour to match the weight of the face.
    outlineScale: 1.9,
    effects: ['outlineCentred', 'outlineTopLeft', 'extrudeUpRight', 'borderOut'],
  },
];

// The dark the shadows and outlines are struck in — the near-black the card's
// own ink would be.
const INK = 'rgba(10, 16, 12, 0.92)';
const SOFT_INK = 'rgba(8, 16, 12, 0.6)';

// Ink on paper, for a name printed on the card rather than set across a
// photograph. No effect comes with it: every one of them is a dark colour, and
// a dark ghost behind dark ink on bare cream is a smudge.
const CARD_INK = 'rgba(26, 33, 22, 0.88)';

// Every card is printed in exactly two colours: one read off its own
// photograph, and one neutral. Which of the two letters the word and which
// goes behind it is the only thing that varies.
//
// Both halves being sampled colours was the earlier arrangement and it muddied
// every card — two mid-toned hues with nothing to separate them. A neutral
// against a colour is what a two-plate print actually looks like.
const NEUTRALS = ['cream', 'black', 'white'] as const;
// How often the neutral is the one on the letters rather than behind them.
const NEUTRAL_LETTERS = [false, false, true];

const CREAM = '#eae7cf';
const BLACK = '#14180f';
const WHITE = '#fdfcf6';

// How far the thrown effects are thrown.
const OUTLINE_STEP = 3;
const FLOAT_STEP = 7;

// The extrusion: how deep the block is, how far it leans, and how finely the
// sweep between the letter and the back of the block is filled in.
//
// It used to be one number — a copy at (i, -i) for i up to EXTRUDE_DEPTH *
// scale — and on the deco face that came out as 10 copies thrown 19pt on a
// 45 degree diagonal. Three things were wrong with it, and the depth was only
// the first:
//
//  - 19pt sideways is several times the ink gap between deco capitals, so
//    every letter's block ran into the next letter's and the word came out as
//    one black mass with a jagged top instead of as letters with depth.
//  - The SIDEWAYS half is what does that; the rise is free. Leaning the
//    block rather than throwing it at 45 degrees keeps the up-and-to-the-
//    right reading while holding the sideways travel inside the gap.
//  - The step worked out at 1.9pt, which is five device pixels on a phone,
//    so the block's leading edge was a visible staircase rather than a solid
//    face. The count now follows the DEPTH rather than the face's scale, so
//    the step stays put however deep the block is thrown.
const EXTRUDE_DEPTH = 4;
// Sideways travel per unit of rise.
const EXTRUDE_LEAN = 0.5;
// The largest gap allowed between two copies, in points.
const EXTRUDE_STEP = 0.8;

// The border-out outline: how far the border stands off the letterforms, and
// how many directions it is grown in.
//
// The border is the union of copies of the word thrown the same distance in
// every direction at once, which is the outward dilation of the letters by
// that distance — a border that follows the shape of each letter rather than
// a box around the word, and one that runs into a neighbouring letter's
// border instead of drifting away from the letter it belongs to. A larger
// COPY cannot do that: scaling a copy scales its advance widths too, so its
// letters walk away from the ones they are backing.
//
// The distance is a share of the box the name is fitted into, not a number of
// points, because that box is a fixed share of the card — so the type is
// roughly 62pt tall on a desktop card and 33pt on a phone, and a fixed radius
// would be a tasteful border on one and a slab on the other. It deliberately
// does NOT take the face's outlineScale the way the thrown effects do: those
// scale with the face's own weight, but StretchText fits every face to the
// same box, so a border that should look the same thickness on both is the
// same thickness on both.
const BORDER_SHARE = 0.07;

// How far the region line's own outline reaches — see the textShadowRadius in
// regionTreatmentFor. The line box has to carry it on both sides or the
// outline is what gets clipped instead of the letters.
const REGION_OUTLINE_RADIUS = 2;

// The gap left between the name and the region line's letters, in points.
//
// One number for all five faces, which is the point of the whole exercise:
// the line used to be given one LEADING (1.75 of its own size) and each face
// then sat wherever its own metrics put it inside that box — between 2.1 and
// 5.4 points off the name depending on which face and which side it drew.
// Matching the leading does not match the gap, because the leading is measured
// to the box and the eye measures to the ink.
const REGION_INK_GAP = 2;
// A fallback for the first frame, before the card has been measured.
const BORDER_FALLBACK_BOX = 60;
// An angular resolution, not a thickness, and the entire cost of the effect
// at one drawn copy each — so it does not want to be larger than it has to be.
//
// Twelve is where the error stops mattering. The outer edge is off by
// radius * (1 - cos(pi / steps)), which is 3% of the radius here — a quarter
// of a point, well under a device pixel. Checked rather than assumed: rendered
// at 8, 10, 12 and 24 and compared pixel for pixel, and 12 against 24 differs
// no more than two runs of the SAME count differ from each other. Eight is a
// little worse and not obviously so; there is nothing above twelve to buy.
const BORDER_STEPS = 12;

// NOTE: the border can only fill where the letter is at least as thick as the
// radius — a copy thrown `r` outward only covers a point if the letter still
// has ink `r` back the other way. Both faces this is offered on are heavy, so
// their stems clear it comfortably; a hairline face would come out hollow and
// should not be given this effect.

function platesFor(
  effect: HeadlineEffect,
  color: string,
  scale: number,
  // The height of the box the name is fitted into. See BORDER_SHARE.
  boxHeight: number,
): HeadlinePlate[] {
  const step = OUTLINE_STEP * scale;
  switch (effect) {
    case 'outlineTopLeft':
      return [{ color, dx: -step, dy: -step }];
    case 'floatingColor':
      return [{ color, dx: -FLOAT_STEP * scale, dy: FLOAT_STEP * scale }];
    case 'extrudeUpRight': {
      // One copy per step rather than one thrown far: an extrusion is the
      // shape swept between the letter and the back of the block, so the
      // space between them has to be filled in or it reads as a row of
      // separate ghosts.
      const rise = EXTRUDE_DEPTH * scale;
      const run = rise * EXTRUDE_LEAN;
      const steps = Math.max(2, Math.ceil(Math.hypot(rise, run) / EXTRUDE_STEP));
      return Array.from({ length: steps }, (_, i) => {
        const t = (i + 1) / steps;
        return { color, dx: run * t, dy: -rise * t };
      });
    }
    case 'borderOut': {
      const radius = BORDER_SHARE * boxHeight;
      return Array.from({ length: BORDER_STEPS }, (_, i) => {
        const angle = (2 * Math.PI * i) / BORDER_STEPS;
        return { color, dx: radius * Math.cos(angle), dy: radius * Math.sin(angle) };
      });
    }
    // 'none', 'softShadow' and 'outlineCentred' are drawn by the front copy's
    // own shadow instead — see shadowFor.
    default:
      return [];
  }
}

function shadowFor(effect: HeadlineEffect, color: string, scale: number): TextStyle {
  switch (effect) {
    case 'softShadow':
      return {
        textShadowColor: SOFT_INK,
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 9 * scale,
      };
    case 'outlineCentred':
      return {
        textShadowColor: color,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 6 * scale,
      };
    default:
      return {};
  }
}

// Whether a letter colour needs something dark behind it to survive the
// picture it is on.
function isLightLetter(color: string): boolean {
  return color !== BLACK;
}

// The three darks anything behind the letters can be struck in.
//
// A membership test rather than a luminance one, and it is exhaustive rather
// than approximate: a plate or shadow here only ever takes one of five
// colours. Three are the constants below. The other two are the pair read off
// the photograph, and those cannot be dark by construction — image-accent
// emits every one of them at a FIXED lightness (hsl at 78%, or 82% for the
// neutral it falls back to on a picture with no usable hue), so a colour
// sampled from a night sky comes back as pale a wash as one from a beach.
//
// Written this way because parsing an arbitrary CSS colour to measure it
// would be more code and less certain than naming the five that can occur.
// If a sixth is ever added, or image-accent's lightness stops being fixed,
// this has to be revisited — a light plate that this calls dark would put the
// name back to having no edge at all.
function isDarkBacking(color: ColorValue | undefined): boolean {
  return color === INK || color === SOFT_INK || color === BLACK;
}

function pick<T>(seed: string, items: readonly T[]): T {
  return items[hashSeed(seed) % items.length];
}


type HeadlineOptions = {
  // The name is printed ON the card rather than set across a photograph.
  onCard?: boolean;
  // The height of the box the name is lettered into, in points. Only the
  // border-out outline uses it, and only so its thickness can be a share of
  // the type rather than a fixed distance — see BORDER_SHARE.
  boxHeight?: number;
  // Colours read off the review's own picture — see useImageAccent. The
  // complement letters the word, so it does not sink into the photograph it is
  // sitting on; the dominant hue is what a coloured plate behind it is struck
  // in, so the two relate to each other AND to the picture.
  accent?: { complement: string; dominant: string; isLight: boolean } | null;
};

export function headlineTreatmentFor(
  seed: string,
  options: HeadlineOptions = {},
): HeadlineTreatment {
  const face = pick(`headline-face:${seed}`, HEADLINE_FACES);

  const base: TextStyle = {
    fontFamily: face.family,
    letterSpacing: face.letterSpacing,
    textTransform: face.textTransform,
    fontSize: face.fontSize,
  };

  if (options.onCard) {
    return {
      back: [],
      style: { ...base, color: CARD_INK },
      region: regionTreatmentFor(seed, CARD_INK, false),
    };
  }

  // Its own hash, so a face and its effect move independently — sharing one
  // would tie every card in a given face to the same effect forever.
  const effect = pick(`headline-effect:${seed}`, face.effects);
  const scale = face.outlineScale ?? 1;

  // Which neutral, and which side of the print it lands on. Separate hashes
  // again, so a card can be cream-on-colour or colour-on-cream independently
  // of which neutral it drew.
  let neutralName = pick(`headline-neutral:${seed}`, NEUTRALS);
  const neutralLetters = pick(`headline-side:${seed}`, NEUTRAL_LETTERS);

  // Black needs a light picture behind it wherever it lands. On a dark one it
  // is a hole in the card and no shadow fixes that, so the draw falls back to
  // cream rather than printing unreadable.
  if (neutralName === 'black' && !options.accent?.isLight) neutralName = 'cream';
  const neutral =
    neutralName === 'cream' ? CREAM : neutralName === 'black' ? BLACK : WHITE;

  const imageColor = neutralLetters
    ? (options.accent?.dominant ?? INK)
    : (options.accent?.complement ?? face.base);

  const color = neutralLetters ? neutral : imageColor;
  let plateColor = neutralLetters ? imageColor : neutral;

  // Two light colours together have nothing to separate them, and a neutral
  // behind light letters is there to give them an edge. Cream and white fall
  // back to ink in that position; the letters keep whatever they drew.
  if (!neutralLetters && isLightLetter(color) && neutralName !== 'black') {
    plateColor = INK;
  }

  const back = platesFor(effect, plateColor, scale, options.boxHeight ?? BORDER_FALLBACK_BOX);
  const shadow = shadowFor(effect, plateColor, scale);

  // Light letters ALWAYS get something dark behind them. No exceptions.
  //
  // This used to fire only on a light photograph, on the reasoning that light
  // type on a dark picture already has all the contrast it needs. It does, for
  // as long as it stays on the picture — and it does not. The name is fitted
  // to the CARD's width, not the photograph's, so on most cards it runs off
  // the picture and onto the cream border at one end or both, and a cream
  // letter crossing that border has nothing to separate it from the card no
  // matter how dark the photograph it started on was. Every card does this;
  // it is the normal case, not the edge case.
  //
  // Whether a dark edge is already there is asked of the COLOURS rather than
  // of the effect, because the effects do not agree about it: a plate is
  // struck in INK on some draws and in a colour read off the picture on
  // others, and the colours are always light (see isDarkBacking). Testing the
  // effect name got that wrong in both directions.
  if (isLightLetter(color)) {
    const hasDarkEdge =
      isDarkBacking(shadow.textShadowColor) || back.some((plate) => isDarkBacking(plate.color));

    if (!hasDarkEdge) {
      // One shadow per Text, so where the slot is already spoken for — an
      // outlineCentred halo is a COLOUR and would be lost if overwritten —
      // the dark goes in as a plate instead.
      if (shadow.textShadowColor == null) {
        Object.assign(shadow, {
          textShadowColor: SOFT_INK,
          textShadowOffset: { width: 0, height: 2 },
          textShadowRadius: 8,
        });
      } else {
        back.push({ color: SOFT_INK, dx: 0, dy: 2 * scale });
      }
    }
  }

  return {
    back,
    style: { ...base, color, ...shadow },
    // The name's own colour, so the two read as one piece of printing rather
    // than as type over a caption.
    region: regionTreatmentFor(seed, color, isLightLetter(color)),
  };
}

// The line box a region face needs, and how much of it the letters do not
// reach on each side.
//
// The line box is cut to the INK rather than to the font's declared extents,
// plus the outline's reach on both sides. That alone cannot close the gap to
// the name, though: a line box is centred on the font's box, not on the ink,
// so whatever the font over-declares stays as empty space wherever the letters
// fall short of it. `deadTop`/`deadBottom` are exactly that space, in points,
// and the caller cancels whichever of the two faces the name.
function regionBoxFor(face: RegionFace) {
  const { boxAscent, boxDescent, inkAscent, inkDescent } = face.metrics;
  const size = face.fontSize;

  const lineHeight = Math.ceil((inkAscent + inkDescent) * size) + 2 * REGION_OUTLINE_RADIUS;
  // A line taller than the font's own box has the difference split evenly
  // above and below it — the same rule in Android's line-height span and in
  // CSS half-leading, which is why one calculation serves both.
  const halfLeading = (lineHeight - (boxAscent + boxDescent) * size) / 2;

  return {
    lineHeight,
    deadTop: halfLeading + (boxAscent - inkAscent) * size,
    deadBottom: halfLeading + (boxDescent - inkDescent) * size,
  };
}

// The broader location's own face, colour and position. See RegionTreatment.
function regionTreatmentFor(seed: string, color: string, isLight: boolean): RegionTreatment {
  const face = pick(`region-face:${seed}`, REGION_FACES);
  const above = pickOneOfTwo(`region-side:${seed}`, true, false);
  const box = regionBoxFor(face);

  return {
    above,
    alignRight: pickOneOfTwo(`region-margin:${seed}`, true, false),
    // The empty space between this face's letters and the edge of its line
    // box on the side the name is on, less the gap we actually want. The
    // caller pulls the line back by this much.
    tuck: (above ? box.deadBottom : box.deadTop) - REGION_INK_GAP,
    style: {
      fontFamily: face.family,
      fontSize: face.fontSize,
      // Cut to this face's own letters — see regionBoxFor.
      //
      // ThemedText's own types carry a line height built for the UI sans (20pt
      // at 14) and these are display faces, so the type's own leading clipped
      // them: a line box shorter than the glyphs need does not scroll or wrap,
      // it CUTS, which is what shaved the bottoms off the commas and tails.
      // The first fix for that was one generous ratio across all five faces,
      // which stopped the clipping and bought the opposite problem — the faces
      // that needed the least room got the most, and floated off the name.
      lineHeight: box.lineHeight,
      letterSpacing: face.letterSpacing,
      textTransform: face.textTransform,
      color,
      // An edge, always, and in whichever direction actually helps.
      //
      // This line used to get a soft dark halo only when its ink was light,
      // on the reasoning that dark type on bare card needs nothing. That
      // missed the case this line is most often in: CREAM ON CREAM. The name
      // is allowed to run off the picture and onto the card, and this line
      // goes with it — where light ink on light paper has almost no contrast
      // at all, and a soft halo at radius 4 is too diffuse to give it any.
      //
      // So: a tight, strong outline rather than a soft one, struck in the
      // OPPOSITE direction to the ink. Light type gets the card's near-black,
      // dark type gets cream. Small radius because an outline is what reads
      // at this size — the blur is what made it disappear.
      textShadowColor: isLight ? INK : CREAM,
      textShadowOffset: { width: 0, height: 0 },
      // The line box above is cut to fit this, so the two have to agree.
      textShadowRadius: REGION_OUTLINE_RADIUS,
    },
  };
}
