// Native (iOS/Android) — Skia is bundled natively and available synchronously,
// no load-gating needed. See .web.tsx for why web can't just import
// RatingGlassBadge directly. Mirrors liquid-glass-track-gated.tsx exactly.
export { RatingGlassBadge as RatingGlassBadgeGated } from '@/components/ui/rating-glass-badge';
