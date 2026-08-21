import { Skia, type SkPath } from '@shopify/react-native-skia';

// Sticker artwork for the trip step-arrows, exported from
// assets/brand-source/stickers and inlined as path data.
//
// Inlined rather than imported from the .svg files because the bundler
// hands back an asset reference, not path data — the same reason
// stamp-shape.ts inlines its frame. Regenerate by re-running the extractor
// against that folder when new variants are added.
//
// Each layer keeps its OWN viewBox (they were drawn on different canvases),
// so nothing here assumes a shared coordinate space — buildStickerPath
// scales and centres each one into whatever square it is asked for. Without
// that the three layers would compose at wildly different sizes.
//
// A variant may hold more than one path: the background has a body and a
// separate rim, which is what lets those two take different colours.
export type StickerVariant = {
  width: number;
  height: number;
  paths: string[];
};

export const STICKER_BACKGROUNDS: StickerVariant[] = [
  {
    width: 432.48,
    height: 420.67,
    paths: [
      'M432.43,210.41c0,43.61-13.7,84.12-37.14,117.68-9.56,13.68-20.73,26.21-33.26,37.32-9.26,8.22-25.56,14.2-36.19,20.77-33.47,20.67-66.9,34.11-109.5,34.11-77.31,0-141.85-39.55-180.04-98.84C15.54,289.22.26,251.24.26,210.41c0-10.6.81-21.02,2.37-31.19,3.2-20.86,11.08-35.89,20.11-54.27,10.18-20.73,22.25-44.4,38.53-60.7,13.17-13.18,21.89-21.69,38.22-31.16,10.82-6.28,28.46-14.65,40.4-19.04C163.65,5.31,189.42.53,216.34.53c39.11,0,70.87,11.81,102.52,29.46,27.6,15.39,52.33,34.87,70.54,60.08,24.62,34.08,43.02,75.55,43.02,120.35Z',
      'M432.48,210.41c.31,55.7-23.46,110.59-63.62,149.09-2.5,2.41-5.02,4.78-7.68,7.04-8.14,6.58-17.9,10.69-27.09,15.5-6.2,3.07-11.93,7-18,10.39-6.02,3.47-12.16,6.72-18.44,9.68-31.47,15.32-66.62,21.13-101.38,17.54-39.73-3.44-78.51-18.65-109.93-43.23-3.92-3.19-8.35-6.52-11.97-10.03-.78-.69-4.14-3.73-4.84-4.35-.6-.6-2.12-2.16-2.74-2.78-1.69-1.7-4.73-4.82-6.39-6.49,0,0-.86-.98-.86-.98,0,0-6.85-7.84-6.85-7.84-2.03-2.26-4.51-5.79-6.44-8.17-18.75-24.87-33.38-53.27-40.97-83.56C.14,232.01-1.12,210.89.95,190.17c.98-10.36,2.74-20.72,6.09-30.61,3.25-9.91,7.78-19.34,12.35-28.68,10.7-21.7,21.19-44.07,37.3-62.4,11.83-12.67,24.44-24.93,39.38-33.91C143.53,6,201.42-7.65,256.12,4.37c37.97,8.47,80.56,32.05,109.19,58.29,38.99,36.68,67.14,93.79,67.16,147.75h0ZM432.38,210.41c-.18-53.86-28.43-110.84-67.48-147.29-15.31-14.06-32.77-25.63-51.08-35.4-12.2-6.54-24.83-12.3-37.94-16.77-59.49-20.62-126.32-7.61-179.32,24.42-11.93,7.1-22.26,16.4-32,26.24-20.19,19.27-32.23,44.95-44.48,69.61-6.14,12.39-12.07,25.01-15.25,38.53-5.96,26.99-5.79,55.5.9,82.34,10.49,41.47,34,81.11,65.03,110.53,18.9,17.74,41.2,32.05,65.18,41.9,17.59,6.97,36.4,11.83,55.22,13.92,2.56.24,7.77.75,10.34.99,33.56,2.28,65.42-3.52,95.79-18.09,6.27-2.93,12.41-6.15,18.42-9.59,6.05-3.35,11.81-7.28,18.06-10.35,9.2-4.77,18.9-8.82,27.02-15.34,2.63-2.22,5.17-4.59,7.67-6.99,40.21-38.29,64.08-93.07,63.93-148.67h0Z',
    ],
  },
];

export const STICKER_INNERS: StickerVariant[] = [
  {
    width: 360.47,
    height: 352.43,
    paths: [
      'M360.47,176.27c0,2.32-.05,4.63-.14,6.93-1.08,27.25-8.49,52.91-20.84,75.62-4.44,8.16-9.52,15.95-15.16,23.28-4.25,5.52-8.83,10.79-13.7,15.78-15.11,15.47-33.07,28.26-53.06,37.55-23.43,10.9-49.65,16.99-77.33,16.99-4.23,0-8.43-.14-12.6-.42-12.98-.88-25.58-3.09-37.66-6.52-10.2-2.89-21.56-4.29-30.93-8.8-18.39-8.87-33.46-23.06-47.65-37.23-15.06-15.05-24.94-32-33.74-51.53C7.87,226.23,0,201.51,0,176.27c0-11.29,2.79-21.91,4.86-32.6,1.84-9.47,2.75-19.09,6.07-27.96,6.19-16.52,14.84-31.89,25.51-45.67,11.82-15.26,26.11-28.57,42.31-39.38,9.93-6.63,20.58-12.31,31.81-16.91,11.56-4.74,20.82-10.03,33.45-12.34,10.8-1.97,24.84-1.31,36.22-1.31,23.2,0,45.37,4.28,65.74,12.09,19.57,7.5,37.47,18.24,53,31.55,5.15,4.41,9.03,10.86,13.63,15.81,5.75,6.18,12.07,11.01,16.88,17.95,9.77,14.08,17.52,29.63,22.81,46.22,2.41,7.56,4.32,15.33,5.68,23.29,1.63,9.51,2.47,19.29,2.47,29.25Z',
    ],
  },
];

export const STICKER_ARROWS: StickerVariant[] = [
  {
    width: 217.94,
    height: 282.19,
    paths: [
      'M11.23,0 L1.94,140.9 L0,282.19 L131.23,209.42 L217.94,150.58 L98.71,69.68 L11.23,0 Z',
    ],
  },
];

// Scales a variant's paths to fit `size` square, centred, preserving aspect
// ratio. Returns null if any path fails to parse — callers fall back to a
// plain circle rather than rendering a half-drawn sticker.
export function buildStickerPaths(variant: StickerVariant, size: number): SkPath[] | null {
  const scale = Math.min(size / variant.width, size / variant.height);
  const dx = (size - variant.width * scale) / 2;
  const dy = (size - variant.height * scale) / 2;

  const matrix = Skia.Matrix();
  matrix.translate(dx, dy);
  matrix.scale(scale, scale);

  const built: SkPath[] = [];
  for (const d of variant.paths) {
    const path = Skia.Path.MakeFromSVGString(d);
    if (!path) return null;
    path.transform(matrix);
    built.push(path);
  }
  return built;
}

// Deterministic per-trip pick, so a trip's arrows keep one identity across
// renders and revisits rather than reshuffling. Independent draws for the
// two layers, giving backgrounds x inners combinations from a small set.
export function pickStickerVariants(seed: string): {
  background: StickerVariant;
  inner: StickerVariant;
  arrow: StickerVariant;
} {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const next = () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    background: STICKER_BACKGROUNDS[Math.floor(next() * STICKER_BACKGROUNDS.length)],
    inner: STICKER_INNERS[Math.floor(next() * STICKER_INNERS.length)],
    arrow: STICKER_ARROWS[Math.floor(next() * STICKER_ARROWS.length)],
  };
}
