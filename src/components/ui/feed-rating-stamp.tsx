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

// How far, at most, the stamp may rise from its anchored edge when nothing
// else (no maxBottomOffset ceiling) reels it in first — shared between the
// component's own useMemo below and getStampMaxReach's worst-case
// prediction of it, so the two can't silently drift out of sync the way two
// separately-hardcoded copies of the same ratio could.
const FALLBACK_MAX_RISE_RATIO = 0.35;

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

// How far this specific post's stamp's *left* edge sits from the block's
// own right edge — the exact same first draw FeedRatingStamp's own useMemo
// below makes internally (a PRNG seeded identically always produces the
// same first value, so this doesn't need to share state with that
// instance, just call the same math). Exported so FeedCardHeaderText's
// note/tagged-places text can reserve exactly *this* post's real stamp
// position instead of a flat worst-case constant — letting text run right
// up to where the stamp actually starts on whichever posts' random draw
// happened to land closer to the edge, not stopping short by the same
// amount on every post regardless of where its own stamp landed. Still an
// approximation of "wrap around the stamp," not true dynamic reflow — see
// the reserve's own call site in feed-place-photo-block.tsx for why that's
// the real ceiling on this (React Native has no CSS `shape-outside`/float
// equivalent). `size` defaults to the main feed's own STAMP_SIZE but takes
// the same ratio a smaller caller's stamp (e.g. collections-list.tsx's
// ROW_STAMP_SIZE) actually renders at — must stay in lockstep with
// FeedRatingStamp's own leftEdgeMin/leftEdgeMax below, since this is a
// prediction of that instance's first PRNG draw, not a shared computation.
export function getStampTextReserve(
  seed: string,
  size: number = STAMP_SIZE,
): number {
  const leftEdgeMin = size * 0.7;
  const leftEdgeMax = size * 1.05;
  const next = mulberry32(hashSeed(seed));
  return leftEdgeMin + next() * (leftEdgeMax - leftEdgeMin);
}

// The worst-case *vertical* footprint a FeedRatingStamp instance can reach
// — its own fallback ceiling (see FALLBACK_MAX_RISE_RATIO) plus its
// rendered height, worst-case rotation included — when it has no
// maxBottomOffset ceiling of its own to lean on instead (i.e. the exact
// path a `canSeep={false}` stamp with no location line takes, see the
// component's own clamp below). Exported so a caller whose stamp shares its
// corner with real text it must never cover (see review-prompt-card.tsx)
// can reserve exactly this much space deterministically, rather than
// guessing or duplicating this ratio locally. `insetRatio` must match
// whatever the real FeedRatingStamp instance is given (see that prop) —
// this is a prediction of that instance's own ceiling, not a shared
// computation.
export function getStampMaxReach(
  size: number = STAMP_SIZE,
  insetRatio: number = 1,
): number {
  const fallbackMaxRise = size * FALLBACK_MAX_RISE_RATIO * insetRatio;
  const effectiveHeight = size * (STAMP_EFFECTIVE_HEIGHT / STAMP_SIZE);
  return fallbackMaxRise + effectiveHeight;
}

type FeedRatingStampProps = {
  rating: number;
  // Anything stable and unique per post — the visit id in practice.
  seed: string;
  // Whether the stamp may bleed past its container's own anchored edge
  // (bottom edge for corner:'bottom-right', top edge for corner:'top-right')
  // — true when something it can overlap sits just past that edge (a photo
  // below, for the feed's bottom-right case), false when the stamp must
  // stay fully bounded within its own container instead.
  canSeep: boolean;
  // A ceiling on how far the stamp may rise from this block's bottom edge —
  // set by the caller once it knows where the location line's own bottom
  // edge sits (see FeedCardHeaderText), computed against
  // STAMP_EFFECTIVE_HEIGHT so the stamp's top edge — worst-case rotation
  // included — never covers more than a couple px of that text. Undefined
  // until measured, or when there's no location line to protect at all.
  maxBottomOffset?: number;
  // Defaults to STAMP_SIZE (the main feed's own size) — every other
  // randomization ratio below is expressed as a multiple of whatever size
  // is actually in play, not the fixed module-level constant, so a smaller
  // caller (collections-list.tsx's compact rows) gets the same "postage
  // stamp on a corner" placement logic proportionally scaled down, not a
  // separately-tuned variant.
  size?: number;
  // Which corner of the caller's wrapper the stamp anchors to — 'bottom-right'
  // (every existing caller) or 'top-right' (profile review-prompt cards,
  // where the badge previously sat inline in the info column instead of
  // floating in a corner at all). Only the vertical CSS property flips
  // (`top` vs `bottom`); the horizontal draw, tilt, and canSeep/maxBottomOffset
  // clamping logic are identical either way — a "ceiling" is just measured
  // from whichever edge this anchors to.
  corner?: "bottom-right" | "top-right";
  // Multiplies every placement ratio below — 1 (default) is every existing
  // caller's look, tight against the corner (close to the text it franks,
  // by design — see leftEdgeMin/leftEdgeMax below). A caller that wants the
  // stamp to read as sitting nearer the middle of its corner's own
  // quadrant instead of jammed into the literal pixel corner (see
  // review-prompt-card.tsx) passes something larger. Keep getStampMaxReach's
  // own `insetRatio` argument matching whatever's passed here, or its
  // reserve prediction will drift from this instance's real ceiling.
  insetRatio?: number;
};

// The rating badge, anchored near a corner of the post's own header block
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
export function FeedRatingStamp({
  rating,
  seed,
  canSeep,
  maxBottomOffset,
  size = STAMP_SIZE,
  corner = "bottom-right",
  insetRatio = 1,
}: FeedRatingStampProps) {
  const { rightOffset, bottomOffset, rotateDeg } = useMemo(() => {
    // Every ratio below is the exact same one the module-level
    // STAMP_LEFT_EDGE_MIN/MAX etc. used to hardcode against STAMP_SIZE —
    // recomputed here per-instance against whatever `size` this particular
    // stamp is actually drawn at, so a smaller caller gets the same
    // placement *logic*, proportionally, not a differently-tuned look.
    // `insetRatio` scales all four uniformly, pulling the whole range
    // toward the center of the corner's own quadrant without changing its
    // *shape* (still the same relative spread, just bigger).
    const leftEdgeMin = size * 0.7 * insetRatio;
    const leftEdgeMax = size * 1.05 * insetRatio;
    // How far the stamp may rise before maxBottomOffset (the caller's
    // per-post, actually-measured ceiling) reels it back in — deliberately
    // generous, well past any real ceiling that shows up in practice, so
    // that clamp is what decides how close the stamp gets to the location
    // text, not this raw range. A smaller raw ceiling here previously
    // meant the stamp consistently sat well below what maxBottomOffset
    // would've actually allowed, reading as "too much empty space above
    // it" (confirmed live).
    const rawMaxRise = size * 1.4 * insetRatio;
    // Only matters when there's no real ceiling to lean on yet — no
    // location line on this post at all (or, for a caller like
    // collections-list.tsx with no location line in the first place, ever)
    // — so the stamp still has *some* bound and doesn't rise into
    // whatever sits above it. See FALLBACK_MAX_RISE_RATIO/getStampMaxReach
    // above — this must stay the same ratio that helper predicts.
    const fallbackMaxRise = size * FALLBACK_MAX_RISE_RATIO * insetRatio;

    const next = mulberry32(hashSeed(seed));
    // Random draw for how far left the stamp's own left edge sits, then
    // converted to the `right` CSS value this component actually positions
    // with (right = distance from *its* right edge, so a bigger
    // leftEdgeFromRight means a bigger right value means further left).
    const leftEdgeFromRight =
      leftEdgeMin + next() * (leftEdgeMax - leftEdgeMin);
    const rightOffset = leftEdgeFromRight - size;
    // canSeep: allowed to dip below this block's own bottom edge into
    // whatever sits directly below (a photo). !canSeep: never negative —
    // structurally can't reach the footer/button row below, since that's
    // a separate sibling entirely outside this block's own bounds.
    const rawBottomOffset = canSeep
      ? -size * 0.45 + next() * (rawMaxRise + size * 0.45)
      : next() * rawMaxRise;
    const rotateDeg = -15 + next() * 30;
    return {
      rightOffset,
      bottomOffset: Math.min(
        rawBottomOffset,
        maxBottomOffset ?? fallbackMaxRise,
      ),
      rotateDeg,
    };
  }, [seed, canSeep, maxBottomOffset, size, insetRatio]);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrap,
        corner === "top-right" ? { top: bottomOffset } : { bottom: bottomOffset },
        {
          right: rightOffset,
          transform: [{ rotate: `${rotateDeg}deg` }],
        },
      ]}
    >
      <RatingGlassBadgeGated rating={rating} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    zIndex: 5,
  },
});
