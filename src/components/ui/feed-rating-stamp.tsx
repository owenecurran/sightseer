import { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { RatingGlassBadgeGated } from "@/components/ui/rating-glass-badge-gated";
import { STAMP_VIEWBOX_HEIGHT, STAMP_VIEWBOX_WIDTH } from "@/lib/stamp-shape";

export const STAMP_SIZE = 92;
export const STAMP_HEIGHT =
  STAMP_SIZE * (STAMP_VIEWBOX_HEIGHT / STAMP_VIEWBOX_WIDTH);
// A rotated rectangle's bounding box is taller than the rectangle itself —
// at the ±15° extreme this mode ever tilts to, roughly 15-16px taller for
// this stamp's proportions (W·sin θ + H·cos θ vs. H). Baked in as a flat
// buffer here (rather than computed per-draw from the actual random
// rotateDeg below) specifically so a *caller* computing a height-based
// clamp — see FeedCardHeaderText's maxBottomOffset — can do the math once
// against a single worst-case constant instead of needing this component's
// internal per-instance rotation before it can know how much room to
// reserve.
const ROTATION_BOUNDING_BUFFER = 16;
export const STAMP_EFFECTIVE_HEIGHT = STAMP_HEIGHT + ROTATION_BOUNDING_BUFFER;

// The stamp's horizontal anchor: how far its *left* edge sits from this
// block's own right edge, randomized within this range (same ~25px spread
// as the previous card-edge-relative version, just translated) so it lands
// close to the review text itself — per direct feedback, not isolated off
// in the corner past the card's own padding anymore. MAX is the near
// (further-left) end, MIN the far (further-right, closer to the edge) end.
const STAMP_LEFT_EDGE_MIN = STAMP_SIZE * 0.7;
const STAMP_LEFT_EDGE_MAX = STAMP_SIZE * 1.25;

// How much horizontal room text sharing a row with the stamp should give up
// on its right edge — exported so FeedCardHeaderText's note/tagged-places
// text can reserve it, an approximation of "wrap around the stamp": React
// Native's text layout has no CSS `shape-outside`/float equivalent (no
// per-line exclusion around an arbitrary — let alone rotated — shape), so a
// fixed right-side margin on the text sharing the stamp's corner is what's
// actually achievable here, not true dynamic reflow. It reads as "the text
// stops short to make room for the stamp" rather than hugging its tilted
// silhouette line-by-line. Matches STAMP_LEFT_EDGE_MAX (the stamp's own
// worst-case — furthest left — reach) so text always stops clear of it,
// not just on typical draws.
export const STAMP_TEXT_RESERVE = STAMP_LEFT_EDGE_MAX;

// Deterministic (not Math.random()) so a given post's stamp placement/tilt
// stays put across re-renders and re-scrolls instead of reshuffling every
// time the feed re-renders — seeded off something stable per post (the
// visit id), the same reasoning StretchText etc. never needed since those
// aren't randomized at all.
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32 — a small, fast, good-enough PRNG for cosmetic randomness like
// this (not cryptographic, doesn't need to be).
function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type FeedRatingStampProps = {
  rating: number;
  // Anything stable and unique per post — the visit id in practice.
  seed: string;
  // Whether the stamp may bleed past its container's own bottom edge — true
  // when a photo sits directly below (the stamp can seep into it, the same
  // "real stamp overlapping what's underneath" look), false when there's no
  // photo and the like/comment row's own "add to board" button sits close
  // below instead — there the stamp must stay fully bounded above it.
  canSeep: boolean;
  // A ceiling on how far the stamp may rise from this block's bottom edge —
  // set by the caller once it knows where the location line's own bottom
  // edge sits (see FeedCardHeaderText), computed against
  // STAMP_EFFECTIVE_HEIGHT so the stamp's top edge — worst-case rotation
  // included — never covers more than a couple px of that text. Undefined
  // until measured, or when there's no location line to protect at all.
  maxBottomOffset?: number;
};

// The rating badge, anchored near the bottom of the post's own header block
// (not floating anywhere in the card), horizontally close to the review
// text itself rather than pinned to the block's right edge — like a real
// postage stamp stuck slightly crooked right next to the address it's
// franking. Per-post randomized how far left/right, how far up, and how
// tilted (-15° to 15°), but deterministic per post (see hashSeed above) so
// it doesn't jitter between renders. Absolutely positioned and non-interactive
// (pointerEvents:'none', so it never steals a tap meant for whatever's
// underneath) — the caller's own wrapper must be `position:'relative'` and
// must not clip overflow for the seeping-past-the-edge part to show, and
// (see index.tsx's cardTop) needs its own zIndex to actually paint above a
// later sibling like a photo, not just the stamp's own internal zIndex —
// zIndex only competes among elements sharing the same direct parent.
// How far the stamp may rise before maxBottomOffset (the caller's
// per-post, actually-measured ceiling) reels it back in — deliberately
// generous, well past any real ceiling that shows up in practice, so that
// clamp is what decides how close the stamp gets to the location text, not
// this raw range. A smaller raw ceiling here previously meant the stamp
// consistently sat well below what maxBottomOffset would've actually
// allowed, reading as "too much empty space above it" (confirmed live).
const RAW_MAX_RISE = STAMP_SIZE * 1.4;
// Only matters when there's no real ceiling to lean on yet — no location
// line on this post at all, or its layout hasn't measured in yet — so the
// stamp still has *some* bound and doesn't rise into the place-name
// headline above it in that case.
const FALLBACK_MAX_RISE = STAMP_SIZE * 0.45;

export function FeedRatingStamp({
  rating,
  seed,
  canSeep,
  maxBottomOffset,
}: FeedRatingStampProps) {
  const { rightOffset, bottomOffset, rotateDeg } = useMemo(() => {
    const next = mulberry32(hashSeed(seed));
    // See STAMP_LEFT_EDGE_MIN/MAX above — random draw for how far left the
    // stamp's own left edge sits, then converted to the `right` CSS value
    // this component actually positions with (right = distance from *its*
    // right edge, so a bigger leftEdgeFromRight means a bigger right value
    // means further left).
    const leftEdgeFromRight =
      STAMP_LEFT_EDGE_MIN +
      next() * (STAMP_LEFT_EDGE_MAX - STAMP_LEFT_EDGE_MIN);
    const rightOffset = leftEdgeFromRight - STAMP_SIZE;
    // canSeep: allowed to dip below this block's own bottom edge into
    // whatever sits directly below (a photo). !canSeep: never negative —
    // structurally can't reach the footer/button row below, since that's
    // a separate sibling entirely outside this block's own bounds.
    const rawBottomOffset = canSeep
      ? -STAMP_SIZE * 0.45 + next() * (RAW_MAX_RISE + STAMP_SIZE * 0.45)
      : next() * RAW_MAX_RISE;
    const rotateDeg = -15 + next() * 30;
    return {
      rightOffset,
      bottomOffset: Math.min(
        rawBottomOffset,
        maxBottomOffset ?? FALLBACK_MAX_RISE,
      ),
      rotateDeg,
    };
  }, [seed, canSeep, maxBottomOffset]);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          right: rightOffset,
          bottom: bottomOffset,
          transform: [{ rotate: `${rotateDeg}deg` }],
        },
      ]}
    >
      <RatingGlassBadgeGated rating={rating} size={STAMP_SIZE} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    zIndex: 5,
  },
});
