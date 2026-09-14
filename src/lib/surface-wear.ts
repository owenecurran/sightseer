import { randomFor } from '@/lib/seeded-random';

// The faint print-wear and single-light sheen that make a flat surface read
// as a physical one — the plain-layout half of what TagSticker does, without
// its scratches, dark marks or die-cut rim.
//
// Extracted because it is now wanted on two quite different things (the
// ticket-shaped ChoiceCard and the review form's panels) and copying the
// generation a third time is how the ACCENTS palette ended up duplicated in
// two files before this.
//
// Everything is in PERCENTAGES of the surface, so nothing has to be measured
// first — a measurement pass would mean a visible pop on first render.

export type WearSpeck = { left: string; top: string; size: number; opacity: number };

export type SurfaceWear = {
  specks: WearSpeck[];
  // One light for the whole screen. Only how flatly a given surface is laid
  // down varies, which is why the peak and the falloff differ per seed but
  // the direction never does.
  gloss: { peak: number; falloff: number };
};

type Options = {
  count?: number;
  // Deliberately low ceilings. On a large surface a speck you can actually
  // see reads as a rendering fault rather than as texture; the effect is
  // meant to be felt, not spotted.
  minOpacity?: number;
  maxOpacity?: number;
  minSize?: number;
  maxSize?: number;
};

export function buildSurfaceWear(seed: string, options: Options = {}): SurfaceWear {
  const {
    count = 5,
    minOpacity = 0.03,
    maxOpacity = 0.08,
    minSize = 2,
    maxSize = 5,
  } = options;

  const next = randomFor(`surface-wear:${seed}`);
  const specks: WearSpeck[] = [];

  for (let i = 0; i < count; i++) {
    specks.push({
      left: `${Math.round(4 + next() * 88)}%`,
      top: `${Math.round(8 + next() * 76)}%`,
      size: minSize + next() * (maxSize - minSize),
      opacity: minOpacity + next() * (maxOpacity - minOpacity),
    });
  }

  return {
    specks,
    gloss: { peak: 0.05 + next() * 0.04, falloff: 0.55 + next() * 0.25 },
  };
}
