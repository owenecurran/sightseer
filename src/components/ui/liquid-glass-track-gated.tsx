// Native (iOS/Android) — Skia is bundled natively and available synchronously,
// no load-gating needed. See .web.tsx for why web can't just import
// LiquidGlassTrack directly.
export { LiquidGlassTrack as LiquidGlassTrackGated } from '@/components/ui/liquid-glass-track';
