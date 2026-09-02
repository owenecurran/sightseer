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
// component's own useMemo below and getStampCornerReach's worst-case
// prediction of it, so the two can't silently drift out of sync the way two
// separately-hardcoded copies of the same ratio could.
const FALLBACK_MAX_RISE_RATIO = 0.35;

// placement:'corner' only — how much (px) the stamp's inset from its corner
// varies per seed, on each axis. Deliberately a small FIXED pixel amount
// rather than a ratio of `size`: the whole point of corner placement is that
// the stamp lands in the same visual spot regardless of how big the stamp
// itself is or how big/what shape its container is, so only the tilt and a
// few px of jitter should differ between instances.
const CORNER_JITTER = 6;

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

// How far this specific post's stamp's near edge sits from whichever edge
// of the block it's anchored to — a pure magnitude, meaningful as either a
// paddingRight reserve (stamp on the right) or a paddingLeft reserve (stamp
// on the left); see getStampSide below for which. The exact same first draw
// FeedRatingStamp's own useMemo below makes internally (a PRNG seeded
// identically always produces the same first value, so this doesn't need to
// share state with that instance, just call the same math). Exported so
// FeedCardHeaderText's note/tagged-places text can reserve exactly *this*
// post's real stamp position instead of a flat worst-case constant — letting
// text run right up to where the stamp actually starts on whichever posts'
// random draw happened to land closer to the edge, not stopping short by the
// same amount on every post regardless of where its own stamp landed. Still
// an approximation of "wrap around the stamp," not true dynamic reflow — see
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

// Which side of the block a given seed's stamp lands on — an entirely
// separate PRNG instance from the one FeedRatingStamp's own useMemo creates
// (same seed, but its own fresh `mulberry32(hashSeed(seed))`, drawing
// exactly once), so this doesn't need to replicate FeedRatingStamp's whole
// draw sequence in order the way getStampTextReserve's "same first draw"
// trick does — it's simply its own independent coin flip keyed off the same
// seed, always landing the same way for a given post. Callers that align
// text around the stamp (see feed-place-photo-block.tsx) call this once to
// decide both which edge to reserve space on and which way to align text.
export function getStampSide(seed: string): "left" | "right" {
  const next = mulberry32(hashSeed(seed));
  return next() < 0.5 ? "left" : "right";
}

// How far, at most, a placement:'corner' stamp's far edge can reach from
// the corner it's anchored to — its worst-case inset (see CORNER_JITTER)
// plus its own rendered height, worst-case rotation included. Exported so a
// caller whose stamp shares space with real text it must never cover (see
// review-prompt-card.tsx) can reserve exactly this much, deterministically,
// rather than guessing. Pass the same `cornerInset` given to the real
// FeedRatingStamp instance or this prediction drifts from it.
export function getStampCornerReach(size: number, cornerInset: number): number {
  const effectiveHeight = size * (STAMP_EFFECTIVE_HEIGHT / STAMP_SIZE);
  return cornerInset + CORNER_JITTER + effectiveHeight;
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
  // How the stamp picks its spot within that corner:
  //
  // 'text-adjacent' (default, the feed and everything modeled on it): the
  // offsets are ratios of `size`, tuned to land the stamp right next to the
  // review text it franks. Deliberately variable — it's anchored to the
  // *text*, not the box.
  //
  // 'corner' (review-prompt-card.tsx): a flat `cornerInset` from the corner
  // on both axes, plus a few px of per-seed jitter. Because the inset is
  // fixed pixels rather than a ratio of `size`, the stamp lands in the same
  // visual spot no matter how big the stamp is, how big the container is, or
  // what shape it is — which 'text-adjacent' can't promise, since its own
  // offsets scale with `size` (and `size` itself usually tracks the
  // container). `maxBottomOffset` is ignored here; the inset already bounds
  // it far more tightly than any ceiling would.
  placement?: "text-adjacent" | "corner";
  // placement:'corner' only — px from the container's corner to the stamp's
  // own corner, before CORNER_JITTER. Keep in sync with whatever's handed to
  // getStampCornerReach.
  cornerInset?: number;
  // Which side of the block the stamp anchors to horizontally — defaults
  // 'right', every existing caller's look, and the `corner` prop's own
  // "-right" naming is only ever accurate when this stays at the default.
  // A caller that randomizes this per post (see getStampSide) must mirror
  // whatever it lands on into its own text alignment/reserve — this prop
  // only controls where the stamp itself sits, not the surrounding text.
  side?: "left" | "right";
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
  placement = "text-adjacent",
  cornerInset = 0,
  side = "right",
}: FeedRatingStampProps) {
  const { horizontalOffset, bottomOffset, rotateDeg } = useMemo(() => {
    const next = mulberry32(hashSeed(seed));

    // Flat inset from the corner on both axes — see the `placement` prop.
    // Nothing here scales with `size` or the container, which is exactly
    // what makes this land in the same visual spot every time.
    if (placement === "corner") {
      return {
        horizontalOffset: cornerInset + next() * CORNER_JITTER,
        bottomOffset: cornerInset + next() * CORNER_JITTER,
        rotateDeg: -15 + next() * 30,
      };
    }

    // Every ratio below is the exact same one the module-level
    // STAMP_LEFT_EDGE_MIN/MAX etc. used to hardcode against STAMP_SIZE —
    // recomputed here per-instance against whatever `size` this particular
    // stamp is actually drawn at, so a smaller caller gets the same
    // placement *logic*, proportionally, not a differently-tuned look.
    const leftEdgeMin = size * 0.7;
    const leftEdgeMax = size * 1.05;
    // How far the stamp may rise before maxBottomOffset (the caller's
    // per-post, actually-measured ceiling) reels it back in — deliberately
    // generous, well past any real ceiling that shows up in practice, so
    // that clamp is what decides how close the stamp gets to the location
    // text, not this raw range. A smaller raw ceiling here previously
    // meant the stamp consistently sat well below what maxBottomOffset
    // would've actually allowed, reading as "too much empty space above
    // it" (confirmed live).
    const rawMaxRise = size * 1.4;
    // Only matters when there's no real ceiling to lean on yet — no
    // location line on this post at all (or, for a caller like
    // collections-list.tsx with no location line in the first place, ever)
    // — so the stamp still has *some* bound and doesn't rise into
    // whatever sits above it.
    const fallbackMaxRise = size * FALLBACK_MAX_RISE_RATIO;

    // Random draw for how far in from the anchored side the stamp's near
    // edge sits, then converted to the CSS offset this component actually
    // positions with (a bigger leftEdgeFromRight means a bigger offset means
    // further from that edge — "right" in the name refers to the draw's own
    // reference point, not which CSS property it ends up applied to below).
    const leftEdgeFromRight =
      leftEdgeMin + next() * (leftEdgeMax - leftEdgeMin);
    const horizontalOffset = leftEdgeFromRight - size;
    // canSeep: allowed to dip below this block's own bottom edge into
    // whatever sits directly below (a photo). !canSeep: never negative —
    // structurally can't reach the footer/button row below, since that's
    // a separate sibling entirely outside this block's own bounds.
    const rawBottomOffset = canSeep
      ? -size * 0.45 + next() * (rawMaxRise + size * 0.45)
      : next() * rawMaxRise;
    const rotateDeg = -15 + next() * 30;
    return {
      horizontalOffset,
      bottomOffset: Math.min(
        rawBottomOffset,
        maxBottomOffset ?? fallbackMaxRise,
      ),
      rotateDeg,
    };
  }, [seed, canSeep, maxBottomOffset, size, placement, cornerInset]);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrap,
        corner === "top-right" ? { top: bottomOffset } : { bottom: bottomOffset },
        side === "left" ? { left: horizontalOffset } : { right: horizontalOffset },
        {
          transform: [{ rotate: `${rotateDeg}deg` }],
        },
      ]}
    >
      <RatingGlassBadgeGated rating={rating} size={size} seed={seed} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    zIndex: 5,
  },
});
