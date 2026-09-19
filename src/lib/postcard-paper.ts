import { BrandColors } from '@/constants/theme';
import { randomFor } from '@/lib/seeded-random';

// The physical card a review is printed on: what shade of paper it is, how
// its edges have worn, and how evenly it has discoloured.
//
// Everything here is seeded off the visit id rather than drawn fresh, for
// the usual reason (see seeded-random): a feed row that re-shuffled its own
// paper every time it recycled would read as the page glitching, not as a
// stack of different cards.

type Rgb = { r: number; g: number; b: number };

const WHITE: Rgb = { r: 255, g: 255, b: 255 };

function parseHex(hex: string): Rgb {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

const CREAM: Rgb = parseHex(BrandColors.cream);

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

// t = 0 is true white, t = 1 is the theme's cream. Values past 1 keep going
// in the same direction — a little further from the cream than the palette
// itself goes, which is where the oldest-looking cards sit.
function paperShade(t: number): string {
  const r = clampChannel(WHITE.r + (CREAM.r - WHITE.r) * t);
  const g = clampChannel(WHITE.g + (CREAM.g - WHITE.g) * t);
  const b = clampChannel(WHITE.b + (CREAM.b - WHITE.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

export type PaperBlotch = {
  left: string;
  top: string;
  size: number;
  color: string;
  opacity: number;
};

export type PaperChip = {
  edge: 'top' | 'right' | 'bottom' | 'left';
  // How far along that edge, 0 to 1.
  along: number;
  size: number;
  // True eats into the card (painted in the page's own colour), false is a
  // burr of paper standing proud of the edge. Wear does both — a torn edge
  // loses fibres in some places and leaves them hanging in others — and
  // having only bites made every card look nibbled rather than aged.
  bite: boolean;
  rotate: number;
  radius: number;
};

export type Paper = {
  color: string;
  blotches: PaperBlotch[];
  chips: PaperChip[];
  // Each corner cut slightly differently, which is most of what stops a
  // stack of these reading as one rounded rectangle repeated.
  radii: [number, number, number, number];
};

// How far the shade may travel. The low end stays off pure white — paper
// that white reads as a UI panel rather than as card stock — and the high
// end overshoots the theme cream, per the brief that a little past it is
// fair game.
const MIN_SHADE = 0.25;
const MAX_SHADE = 1.22;

// Chips per edge. The first pass used three big ones and they read as tabs
// deliberately cut into the card rather than as wear — at that size and
// spacing the eye takes each one as a shape. Many small ones at irregular
// spacing read as an edge that has simply gone soft.
const CHIPS_PER_EDGE = 11;

// Just the shade, for anything that has to paint IN the card's own colour
// without being part of the card — the ripple that breaks up the printed
// edge of a photo, for one. Recomputing the whole paper to read one field is
// cheap (it is arithmetic on a seeded stream) and much less trouble than
// threading the colour down through every layer that sits on the card.
export function paperColorFor(seed: string): string {
  return buildPaper(seed).color;
}

export function buildPaper(seed: string): Paper {
  const next = randomFor(`postcard-paper:${seed}`);

  const shade = MIN_SHADE + next() * (MAX_SHADE - MIN_SHADE);
  const color = paperShade(shade);

  // Discoloration is uneven, so the blotches sit a little either side of
  // whatever shade this card already is, rather than all being darker.
  const blotches: PaperBlotch[] = [];
  const blotchCount = 2 + Math.floor(next() * 3);
  for (let i = 0; i < blotchCount; i++) {
    const drift = (next() - 0.35) * 0.5;
    blotches.push({
      left: `${Math.round(-10 + next() * 100)}%`,
      top: `${Math.round(-10 + next() * 100)}%`,
      size: 80 + next() * 190,
      color: paperShade(Math.max(0, Math.min(MAX_SHADE + 0.15, shade + drift))),
      // Low, because the effect is meant to be felt as unevenness rather
      // than spotted as a stain.
      opacity: 0.16 + next() * 0.24,
    });
  }

  const chips: PaperChip[] = [];
  const edges: PaperChip['edge'][] = ['top', 'right', 'bottom', 'left'];
  for (const edge of edges) {
    for (let i = 0; i < CHIPS_PER_EDGE; i++) {
      // Spread across the edge in bands, jittered inside each band, so
      // three chips never all land in one corner.
      const band = (i + 0.5) / CHIPS_PER_EDGE;
      chips.push({
        edge,
        along: Math.max(0.03, Math.min(0.97, band + (next() - 0.5) * 0.14)),
        // Small. A chip bigger than the printed border would reach past it
        // and take a bite out of the picture instead of the card.
        size: 3 + next() * 7,
        bite: next() < 0.66,
        rotate: next() * 90,
        // Never square: a hard-cornered chip reads as a cut, and this edge
        // is meant to have worn rather than been trimmed.
        radius: 0.3 + next() * 0.2,
      });
    }
  }

  const radii: [number, number, number, number] = [0, 1, 2, 3].map(
    () => 3 + next() * 7,
  ) as [number, number, number, number];

  return { color, blotches, chips, radii };
}
