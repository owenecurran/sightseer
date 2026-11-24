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

// A short hair of a fibre in the stock, in points, turned this many degrees.
export type WearFibre = { left: string; top: string; length: number; angle: number; opacity: number };
// A large, barely-there patch of uneven tone.
export type WearMottle = { left: string; top: string; size: number; opacity: number };

export type SurfaceWear = {
  specks: WearSpeck[];
  // One light for the whole screen. Only how flatly a given surface is laid
  // down varies, which is why the peak and the falloff differ per seed but
  // the direction never does.
  gloss: { peak: number; falloff: number };
  // The rest is what makes one surface a different piece of paper from the
  // next. Every panel used to be the same five specks under the same sheen,
  // and a screen of them read as one texture stamped out repeatedly. Each of
  // these turns up on only some surfaces, so no two come out alike.
  fibres: WearFibre[];
  mottles: WearMottle[];
  // Where it was folded once: a faint line right across, at an angle.
  crease: { top: string; angle: number; opacity: number } | null;
  // A corner handled more than the rest, so lighter.
  corner: { x: 0 | 1; y: 0 | 1; strength: number } | null;
  // One edge faded, as if it sat in the sun.
  edge: { side: 'top' | 'bottom' | 'left' | 'right'; strength: number } | null;
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

  const gloss = { peak: 0.05 + next() * 0.04, falloff: 0.55 + next() * 0.25 };

  // Drawn after the specks and the gloss, so those come out exactly as they
  // always have for a given seed.
  const fibres: WearFibre[] = [];
  const fibreCount = Math.floor(next() * 5);
  for (let i = 0; i < fibreCount; i++) {
    fibres.push({
      left: `${Math.round(6 + next() * 84)}%`,
      top: `${Math.round(10 + next() * 76)}%`,
      length: 6 + next() * 14,
      angle: Math.round(next() * 180),
      opacity: 0.04 + next() * 0.05,
    });
  }

  const mottles: WearMottle[] = [];
  const mottleCount = Math.floor(next() * 3);
  for (let i = 0; i < mottleCount; i++) {
    mottles.push({
      left: `${Math.round(next() * 80)}%`,
      top: `${Math.round(next() * 70)}%`,
      size: 40 + next() * 60,
      opacity: 0.015 + next() * 0.02,
    });
  }

  const crease =
    next() < 0.25
      ? { top: `${Math.round(20 + next() * 60)}%`, angle: Math.round(-14 + next() * 28), opacity: 0.05 + next() * 0.04 }
      : null;
  const corner =
    next() < 0.35
      ? { x: (next() < 0.5 ? 0 : 1) as 0 | 1, y: (next() < 0.5 ? 0 : 1) as 0 | 1, strength: 0.04 + next() * 0.05 }
      : null;
  const edges = ['top', 'bottom', 'left', 'right'] as const;
  const edge = next() < 0.2 ? { side: edges[Math.floor(next() * 4)], strength: 0.03 + next() * 0.04 } : null;

  return { specks, gloss, fibres, mottles, crease, corner, edge };
}
