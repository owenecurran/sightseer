import { svgDataUri } from '@/lib/base64';
import { BrandColors } from '@/constants/theme';
import { BRAND_MARK_BOUNDS, HEAD_PATH_SVG, MARK_POLYLINE_POINTS } from '@/lib/brand-mark';
import { colorForRating, layerColorsForRating } from '@/lib/rating-gradient';
import { type StampDesign } from '@/lib/stamp-designs';
import { pickStampDesign } from '@/lib/stamp-matching';
import { buildWearSvg } from '@/lib/stamp-wear';
import {
  STAMP_FRAME_OUTER_SVG,
  STAMP_VIEWBOX_HEIGHT,
  STAMP_VIEWBOX_WIDTH,
  STAMP_WINDOW_RECT,
} from '@/lib/stamp-shape';

// Matches RatingGlassBadge's own fitBrandMarkPath call for the icon.
const ICON_FILL_RATIO = 0.82;

// One design layer, fitted and centred inside the stamp's window. Each
// design keeps its own viewBox, so the fit is computed per layer from that
// design's own dimensions rather than assuming a shared coordinate space —
// the same move sticker-svg.ts's `layer` makes.
function designLayer(design: StampDesign, paths: string[], fill: string): string {
  const w = STAMP_WINDOW_RECT;
  // Fitted to the WINDOW, not to a square inside it, so the design runs
  // edge to edge on whichever axis constrains it — a wide design like
  // mountain touches the left and right borders, a tall one like eiffel
  // touches top and bottom.
  //
  // Still `min` rather than `max`: `max` would fill all four edges but crop
  // whatever overflows, which on these designs means cutting the tip off
  // the Eiffel tower and the ends off the anchor.
  const scale = Math.min(w.width / design.width, w.height / design.height);
  const dx = w.x + (w.width - design.width * scale) / 2;
  const dy = w.y + (w.height - design.height * scale) / 2;
  const body = paths.map((d) => `<path d="${d}"/>`).join('');
  return `<g transform="translate(${dx} ${dy}) scale(${scale})" fill="${fill}">${body}</g>`;
}

// The rating stamp as a self-contained SVG document: the perforated cream
// frame, the rating-coloured window, and the artwork inside it — either one
// of the registered two-layer designs, or the brand mark with its
// brushed-metal gradient and white stroke when none are registered.
//
// Pure string building, no platform APIs, so the same markup serves web and
// native. The rating NUMBER is deliberately not in here: it stays a real
// text node in the component, so it keeps the app's font, scales with
// adjustsFontSizeToFit, and stays selectable — exactly as on native today.
//
// `context` decides which of the registered designs this stamp draws, and
// how worn it is -- see stamp-matching.ts for the hierarchy (a 10.0 or 0.0
// first, then the place, then tags and rating, then anything). Callers
// with nothing stable to key on (a slider preview, a place's average) pass
// none, and get the same design for a given rating — which is what those
// displays want anyway, since there is no single post behind them to vary
// by.
export type StampContext = {
  // Anything stable and unique per post -- the visit id in practice.
  seed?: string;
  // Tag slugs on this review, and where it happened. Both optional: a
  // slider preview or a place's average rating has neither, and falls
  // through to the untargeted pick.
  tags?: string[];
  placeId?: string;
};

export function buildStampSvg(rating: number, size: number, context?: StampContext): string {
  const scale = size / STAMP_VIEWBOX_WIDTH;
  const w = STAMP_WINDOW_RECT;
  // The native badge strokes in screen pixels on a canvas already scaled to
  // the stamp; this SVG's user units ARE the viewBox, so matching that
  // visual weight means dividing by the same scale.
  const strokeWidth = Math.max(1.5, size * 0.045) / scale;

  // Same composition as fitBrandMarkPath followed by the badge's own icon
  // matrix: fit the mark into a square the width of the window at
  // ICON_FILL_RATIO, then centre that square on the window.
  const fitScale =
    (w.width * ICON_FILL_RATIO) / Math.max(BRAND_MARK_BOUNDS.width, BRAND_MARK_BOUNDS.height);
  const cx = w.x + w.width / 2;
  const cy = w.y + w.height / 2;
  const bx = BRAND_MARK_BOUNDS.x + BRAND_MARK_BOUNDS.width / 2;
  const by = BRAND_MARK_BOUNDS.y + BRAND_MARK_BOUNDS.height / 2;
  const iconTransform = `translate(${cx} ${cy}) scale(${fitScale}) translate(${-bx} ${-by})`;

  // addPoly(points, true) on native — a closed shape, hence polygon.
  const marks = `<path d="${HEAD_PATH_SVG}"/><polygon points="${MARK_POLYLINE_POINTS}"/>`;

  // The brand mark is the fallback, not the default: it is what the stamp
  // drew before designs existed, so an empty registry is a no-op rather
  // than a blank window. Once designs are registered every seeded stamp
  // draws one of them instead.
  // One seed drives both which design is drawn and how worn it is, so a
  // given review's stamp is identical every time it appears. Callers with
  // no single post behind them fall back to the rating, which is what those
  // displays want anyway: an aggregate should not pretend to be one review.
  const wearSeed = context?.seed ?? rating.toFixed(1);
  const design = pickStampDesign({
    seed: wearSeed,
    rating,
    tags: context?.tags,
    placeId: context?.placeId,
  });
  const windowContent = design
    ? (() => {
        const { layer1, layer2 } = layerColorsForRating(rating);
        return (
          designLayer(design, design.layer1, layer1) + designLayer(design, design.layer2, layer2)
        );
      })()
    : `<g transform="${iconTransform}">
<g fill="url(#m)" fill-opacity="0.7">${marks}</g>
<g fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round">${marks}</g>
</g>`;

  // Explicit width/height as well as the viewBox: an SVG loaded as an image
  // source has no intrinsic size from a viewBox alone, and decoders then
  // refuse to paint it — which is exactly how this first failed on web.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${STAMP_VIEWBOX_WIDTH}" height="${STAMP_VIEWBOX_HEIGHT}" viewBox="0 0 ${STAMP_VIEWBOX_WIDTH} ${STAMP_VIEWBOX_HEIGHT}">
<defs><linearGradient id="m" gradientUnits="userSpaceOnUse" x1="${w.x}" y1="${w.y}" x2="${w.x + w.width}" y2="${w.y + w.height}">
<stop offset="0" stop-color="#e8eaec"/><stop offset="0.25" stop-color="#9aa0a6"/><stop offset="0.5" stop-color="#f2f3f4"/><stop offset="0.75" stop-color="#7d838a"/><stop offset="1" stop-color="#e8eaec"/>
</linearGradient></defs>
<path d="${STAMP_FRAME_OUTER_SVG}" fill="${BrandColors.cream}"/>
<rect x="${w.x}" y="${w.y}" width="${w.width}" height="${w.height}" fill="${colorForRating(rating)}"/>
${windowContent}
${buildWearSvg(wearSeed)}
</svg>`;
}

// base64 specifically, not percent-encoding: Android's Glide only decodes
// base64 `data:` URIs, so the raw-markup form that works in a browser would
// silently fail to load on native.
export function buildStampDataUri(rating: number, size: number, context?: StampContext): string {
  return svgDataUri(buildStampSvg(rating, size, context));
}
