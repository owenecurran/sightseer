// Web — identical to the native seam now. Skia has never actually worked on
// this web target (CanvasKit loads, but every Skia call throws during the
// gate's swap-in window, so the badge silently fell back to a plain
// rectangle); the SVG stamp removes that dependency entirely, along with an
// 8MB CanvasKit WASM download.
export { RatingStampSvg as RatingGlassBadgeGated } from '@/components/ui/rating-stamp-svg';
