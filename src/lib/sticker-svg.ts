import { svgDataUri } from '@/lib/base64';
import type { StickerVariant } from '@/lib/sticker-shapes';

// Places one layer's paths inside a `box`-sized square that itself sits at
// `offset` within the sticker — the same fit-and-centre buildStickerPaths
// does with a Skia matrix, expressed as an SVG transform instead. Each
// layer keeps its own viewBox (they were drawn on different canvases), so
// nothing here can assume a shared coordinate space.
function layer(variant: StickerVariant, box: number, offset: number, fill: string): string {
  const scale = Math.min(box / variant.width, box / variant.height);
  const dx = offset + (box - variant.width * scale) / 2;
  const dy = offset + (box - variant.height * scale) / 2;
  const paths = variant.paths.map((d) => `<path d="${d}"/>`).join('');
  return `<g transform="translate(${dx} ${dy}) scale(${scale})" fill="${fill}">${paths}</g>`;
}

type StickerArrowSvgOptions = {
  size: number;
  background: StickerVariant;
  inner: StickerVariant;
  arrow: StickerVariant;
  innerScale: number;
  arrowScale: number;
  bodyColor: string;
  rimColor: string;
  innerColor: string;
  arrowColor: string;
  direction: 'left' | 'right';
};

// The sticker arrow as an SVG, so it needs no Skia.
//
// This is not just a web fix, though it is that: StickerArrow called
// Skia.Matrix() unguarded, which is undefined on web, so every screen with
// a back button threw straight into the error boundary. It also removes one
// GL surface per arrow on native, and arrows are the second most repeated
// Skia canvas in the app after the rating stamp.
export function buildStickerArrowDataUri(opts: StickerArrowSvgOptions): string {
  const { size, background, inner, arrow } = opts;

  // The background carries body and rim as separate paths, which is what
  // lets the outer sticker read as die-cut rather than flat.
  const bodyScale = Math.min(size / background.width, size / background.height);
  const bdx = (size - background.width * bodyScale) / 2;
  const bdy = (size - background.height * bodyScale) / 2;
  const bgPaths = background.paths
    .map((d, i) => `<path d="${d}" fill="${i === 0 ? opts.bodyColor : opts.rimColor}"/>`)
    .join('');
  const bg = `<g transform="translate(${bdx} ${bdy}) scale(${bodyScale})">${bgPaths}</g>`;

  const innerBox = size * opts.innerScale;
  const arrowBox = size * opts.arrowScale;
  const innerLayer = layer(inner, innerBox, (size - innerBox) / 2, opts.innerColor);
  const arrowLayer = layer(arrow, arrowBox, (size - arrowBox) / 2, opts.arrowColor);

  // The artwork points right; a left arrow is the same shape mirrored about
  // the sticker's centre, so there is one arrow file per variant.
  const arrowGroup =
    opts.direction === 'left'
      ? `<g transform="translate(${size} 0) scale(-1 1)">${arrowLayer}</g>`
      : arrowLayer;

  // Explicit width/height as well as the viewBox: an SVG loaded as an image
  // source has no intrinsic size from a viewBox alone, and decoders then
  // refuse to paint it.
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}${innerLayer}${arrowGroup}</svg>`
  );
}

// The two halves of the sticker, as separate images.
//
// ArrowSticker animates them independently — the disc spins while the glyph
// holds its heading and pops, because a rotating chevron points the wrong
// way mid-spin — so they can't share one image the way the static
// StickerArrow's can.
export function buildStickerBodyDataUri(opts: {
  size: number;
  background: StickerVariant;
  inner: StickerVariant;
  innerScale: number;
  bodyColor: string;
  rimColor: string;
  innerColor: string;
}): string {
  const { size, background, inner } = opts;
  const bodyScale = Math.min(size / background.width, size / background.height);
  const bdx = (size - background.width * bodyScale) / 2;
  const bdy = (size - background.height * bodyScale) / 2;
  const bgPaths = background.paths
    .map((d, i) => `<path d="${d}" fill="${i === 0 ? opts.bodyColor : opts.rimColor}"/>`)
    .join('');
  const bg = `<g transform="translate(${bdx} ${bdy}) scale(${bodyScale})">${bgPaths}</g>`;

  const innerBox = size * opts.innerScale;
  const innerLayer = layer(inner, innerBox, (size - innerBox) / 2, opts.innerColor);

  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}${innerLayer}</svg>`
  );
}

// Centred and never mirrored here: the caller flips the glyph with a view
// transform, which is also what carries its pop and wobble.
export function buildStickerGlyphDataUri(opts: {
  size: number;
  arrow: StickerVariant;
  arrowScale: number;
  arrowColor: string;
}): string {
  const { size, arrow } = opts;
  const box = size * opts.arrowScale;
  const glyph = layer(arrow, box, (size - box) / 2, opts.arrowColor);
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${glyph}</svg>`
  );
}
