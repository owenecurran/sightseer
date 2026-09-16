import type { TextStyle } from 'react-native';

import { BrandFonts } from '@/constants/theme';
import { hashSeed } from '@/lib/seeded-random';

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
export type HeadlineTreatment = { style: TextStyle; back: HeadlinePlate[] };

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
export type HeadlineEffect =
  | 'none'
  | 'softShadow'
  | 'outlineCentred'
  | 'floatingColor'
  | 'outlineTopLeft'
  | 'extrudeUpRight';

const ALL_EFFECTS: HeadlineEffect[] = [
  'none',
  'softShadow',
  'outlineCentred',
  'floatingColor',
  'outlineTopLeft',
  'extrudeUpRight',
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
    effects: ['outlineCentred', 'outlineTopLeft', 'extrudeUpRight'],
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
const EXTRUDE_DEPTH = 5;

function platesFor(effect: HeadlineEffect, color: string, scale: number): HeadlinePlate[] {
  const step = OUTLINE_STEP * scale;
  switch (effect) {
    case 'outlineTopLeft':
      return [{ color, dx: -step, dy: -step }];
    case 'floatingColor':
      return [{ color, dx: -FLOAT_STEP * scale, dy: FLOAT_STEP * scale }];
    case 'extrudeUpRight':
      // One copy per step rather than one thrown far: an extrusion is the
      // shape swept between the two, so the gap has to be filled in. The
      // count grows with the scale or a heavier face's extrusion comes out
      // as a row of separate ghosts.
      return Array.from({ length: Math.round(EXTRUDE_DEPTH * scale) }, (_, i) => ({
        color,
        dx: (i + 1) * scale,
        dy: -(i + 1) * scale,
      }));
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

function pick<T>(seed: string, items: readonly T[]): T {
  return items[hashSeed(seed) % items.length];
}

type HeadlineOptions = {
  // The name is printed ON the card rather than set across a photograph.
  onCard?: boolean;
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
    return { back: [], style: { ...base, color: CARD_INK } };
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

  const back = platesFor(effect, plateColor, scale);
  const shadow = shadowFor(effect, plateColor, scale);

  // Light type on a light photograph disappears whatever is behind it, so on
  // those the name always gets something dark — even the treatments whose
  // whole point is that they have nothing behind them.
  //
  // Where the shadow slot is already spoken for (softShadow has its own;
  // outlineCentred's halo is a COLOUR and would be lost if overwritten) the
  // dark goes in as a plate instead. There is only one shadow per Text, so
  // the two cannot both use it.
  if (options.accent?.isLight && isLightLetter(color)) {
    if (shadow.textShadowColor == null) {
      Object.assign(shadow, {
        textShadowColor: SOFT_INK,
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 8,
      });
    } else if (effect === 'outlineCentred') {
      back.push({ color: SOFT_INK, dx: 0, dy: 2 * scale });
    }
  }

  return { back, style: { ...base, color, ...shadow } };
}
