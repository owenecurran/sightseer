import { svgDataUri } from '@/lib/base64';
import { BrandColors } from '@/constants/theme';

// The Sightseer wordmark, from assets/brand-source/sightseer logo nobg.svg.
//
// Inlined rather than imported from that .svg because the bundler hands
// back an asset reference, not path data — the same reason stamp-shape.ts
// and sticker-shapes.ts inline theirs. Inlining is also what makes the
// colour a parameter: the source file is filled #9bb88d, and re-tinting an
// imported image would need a native tint that behaves differently on each
// platform.
const LOGO_PATH =
  'M1882.95,25.06c-654.93,41.25-1167.99,110.92-1176.89,231.97-12.8,174.13,1027.56,318.13,1018.84,501.68-5.38,113.3-409.88,227.52-1638.19,318.97L0,710.71c380.1,10.75,732.47,2.63,743.23-68.13,14.66-96.45-620.21-211.69-614.71-343.74C132.74,197.41,514.66,89.16,1786.84,0';

export const LOGO_VIEWBOX_WIDTH = 1882.95;
export const LOGO_VIEWBOX_HEIGHT = 1077.68;
export const LOGO_ASPECT = LOGO_VIEWBOX_WIDTH / LOGO_VIEWBOX_HEIGHT;

// Explicit width/height as well as the viewBox: an SVG loaded as an image
// source has no intrinsic size from a viewBox alone, and decoders then
// refuse to paint it — the failure stamp-svg.ts documents hitting on web.
export function buildLogoSvg(color: string = BrandColors.cream): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LOGO_VIEWBOX_WIDTH}" height="${LOGO_VIEWBOX_HEIGHT}" viewBox="0 0 ${LOGO_VIEWBOX_WIDTH} ${LOGO_VIEWBOX_HEIGHT}"><path d="${LOGO_PATH}" fill="${color}"/></svg>`;
}

// base64 specifically, not percent-encoding: Android's Glide only decodes
// base64 `data:` URIs, so the raw-markup form that works in a browser would
// silently fail to load on native.
export function buildLogoDataUri(color: string = BrandColors.cream): string {
  return svgDataUri(buildLogoSvg(color));
}
