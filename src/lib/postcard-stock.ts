import type { ImageSourcePropType } from 'react-native';

import { hashSeed } from '@/lib/seeded-random';
import type { PostcardOrientation } from '@/lib/postcard-orientation';

// Which piece of card a review is printed on.
//
// These are photographic scans of real blank postcards — deckled edge,
// foxing, the ghost of the printed address rules. They are cut off their
// studio background, colour-corrected and palette-compressed by
// scripts/build-postcard-assets.py.
//
// Each sheet ships in two pieces. `card` is the whole sheet and goes behind
// everything; `frame` is the same sheet with its middle eroded away and goes
// back on TOP of the picture, which is what makes the border around the
// picture the same torn edge as the border around the card.
//
// Required statically, one literal per file, because Metro resolves require()
// at build time and cannot take a computed path.

export type Sheet = {
  card: ImageSourcePropType;
  frame: ImageSourcePropType;
};

const BLANK_LANDSCAPE: Sheet[] = [
  {
    card: require('../../assets/postcard/card-13.png'),
    frame: require('../../assets/postcard/cardframe-13.png'),
  },
  {
    card: require('../../assets/postcard/card-15.png'),
    frame: require('../../assets/postcard/cardframe-15.png'),
  },
  {
    card: require('../../assets/postcard/card-18.png'),
    frame: require('../../assets/postcard/cardframe-18.png'),
  },
  {
    card: require('../../assets/postcard/card-21.png'),
    frame: require('../../assets/postcard/cardframe-21.png'),
  },
  {
    card: require('../../assets/postcard/card-23.png'),
    frame: require('../../assets/postcard/cardframe-23.png'),
  },
];

const BLANK_PORTRAIT: Sheet[] = [
  {
    card: require('../../assets/postcard/card-13-portrait.png'),
    frame: require('../../assets/postcard/cardframe-13-portrait.png'),
  },
  {
    card: require('../../assets/postcard/card-15-portrait.png'),
    frame: require('../../assets/postcard/cardframe-15-portrait.png'),
  },
  {
    card: require('../../assets/postcard/card-18-portrait.png'),
    frame: require('../../assets/postcard/cardframe-18-portrait.png'),
  },
  {
    card: require('../../assets/postcard/card-21-portrait.png'),
    frame: require('../../assets/postcard/cardframe-21-portrait.png'),
  },
  {
    card: require('../../assets/postcard/card-23-portrait.png'),
    frame: require('../../assets/postcard/cardframe-23-portrait.png'),
  },
];

// Dust, scratches and creases, scanned off real card. Nearly black, so they
// go on with a screen blend: the marks are the light part and the black does
// nothing.
const GRAIN: ImageSourcePropType[] = [
  require('../../assets/postcard/grain-19.jpg'),
  require('../../assets/postcard/grain-21.jpg'),
  require('../../assets/postcard/grain-27.jpg'),
];

export const BLANK_COUNT = BLANK_LANDSCAPE.length;
export const GRAIN_COUNT = GRAIN.length;

type SheetRequest = {
  // Which sheet, as stored on the review. Wrapped rather than validated, so a
  // row written before a sheet was retired still resolves to something.
  stock: number;
  orientation: PostcardOrientation;
};

export function sheetFor({ stock, orientation }: SheetRequest): Sheet {
  const sheets = orientation === 'vertical' ? BLANK_PORTRAIT : BLANK_LANDSCAPE;
  return sheets[Math.abs(stock) % sheets.length];
}

export function grainFor(grain: number): ImageSourcePropType {
  return GRAIN[Math.abs(grain) % GRAIN.length];
}

// What a review gets when it has no stored choice — every post made before
// the card was stored on the row. Seeded off the visit id so those posts
// still look like themselves rather than reshuffling on every render.
export function seededStock(seed: string): number {
  return hashSeed(`stock:${seed}`);
}

export function seededGrain(seed: string): number {
  return hashSeed(`grain:${seed}`);
}
