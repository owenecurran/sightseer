import { svgDataUri } from '@/lib/base64';
import { BrandColors } from '@/constants/theme';
import { BRAND_MARK_BOUNDS, HEAD_PATH_SVG, MARK_POLYLINE_POINTS } from '@/lib/brand-mark';
import { colorForRating } from '@/lib/rating-gradient';
import {
  STAMP_FRAME_OUTER_SVG,
  STAMP_VIEWBOX_HEIGHT,
  STAMP_VIEWBOX_WIDTH,
  STAMP_WINDOW_RECT,
} from '@/lib/stamp-shape';

// Matches RatingGlassBadge's own fitBrandMarkPath call for the icon.
const ICON_FILL_RATIO = 0.82;

// The rating stamp as a self-contained SVG document: the perforated cream
// frame, the rating-coloured window, and the brand mark with its
// brushed-metal gradient and white stroke — the same artwork
// rating-glass-badge.tsx draws with Skia, from the same path data.
//
// Pure string building, no platform APIs, so the same markup serves web and
// native. The rating NUMBER is deliberately not in here: it stays a real
// text node in the component, so it keeps the app's font, scales with
// adjustsFontSizeToFit, and stays selectable — exactly as on native today.
export function buildStampSvg(rating: number, size: number): string {
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

  // Explicit width/height as well as the viewBox: an SVG loaded as an image
  // source has no intrinsic size from a viewBox alone, and decoders then
  // refuse to paint it — which is exactly how this first failed on web.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${STAMP_VIEWBOX_WIDTH}" height="${STAMP_VIEWBOX_HEIGHT}" viewBox="0 0 ${STAMP_VIEWBOX_WIDTH} ${STAMP_VIEWBOX_HEIGHT}">
<defs><linearGradient id="m" gradientUnits="userSpaceOnUse" x1="${w.x}" y1="${w.y}" x2="${w.x + w.width}" y2="${w.y + w.height}">
<stop offset="0" stop-color="#e8eaec"/><stop offset="0.25" stop-color="#9aa0a6"/><stop offset="0.5" stop-color="#f2f3f4"/><stop offset="0.75" stop-color="#7d838a"/><stop offset="1" stop-color="#e8eaec"/>
</linearGradient></defs>
<path d="${STAMP_FRAME_OUTER_SVG}" fill="${BrandColors.cream}"/>
<rect x="${w.x}" y="${w.y}" width="${w.width}" height="${w.height}" fill="${colorForRating(rating)}"/>
<g transform="${iconTransform}">
<g fill="url(#m)" fill-opacity="0.7">${marks}</g>
<g fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round">${marks}</g>
</g>
</svg>`;
}

// base64 specifically, not percent-encoding: Android's Glide only decodes
// base64 `data:` URIs, so the raw-markup form that works in a browser would
// silently fail to load on native.
export function buildStampDataUri(rating: number, size: number): string {
  return svgDataUri(buildStampSvg(rating, size));
}
