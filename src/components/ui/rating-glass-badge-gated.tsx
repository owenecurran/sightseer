// Both platforms now render the stamp as an SVG image rather than through
// Skia — see rating-stamp-svg.tsx. Kept as a re-export under the old name so
// the eleven call sites don't each need touching, and so this stays the one
// place a platform ever diverges again.
export { RatingStampSvg as RatingGlassBadgeGated } from '@/components/ui/rating-stamp-svg';
