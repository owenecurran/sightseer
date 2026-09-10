import { pickFor } from '@/lib/seeded-random';
import { STAMP_DESIGNS, type StampDesign, type StampDesignId } from '@/lib/stamp-designs';

// Which design a stamp draws.
//
// Hand-written, and deliberately NOT in stamp-designs.ts: that file is
// regenerated from the SVG folder by scripts/extract-stamp-designs.js and
// anything added to it is overwritten on the next run. Geometry is
// generated, meaning is authored.

export type StampRules = {
  // Ratings this design is reserved for, matched exactly. The top of the
  // hierarchy: a 10.0 or a 0.0 is a statement, and gets its own stamp
  // regardless of where it was or what it was tagged.
  exactRatings?: number[];
  // Places this design belongs to, by place id. Exact ids only — matching
  // "anywhere in France" would need the place's ancestor chain, which a
  // stamp does not have at render time without another lookup.
  placeIds?: string[];
  // Tag slugs this design suits. Any one matching is enough.
  tags?: string[];
  // Inclusive rating band this design suits, e.g. [8, 10] for a design that
  // should only show up on somewhere genuinely good.
  ratingRange?: [number, number];
};

// STARTING ASSIGNMENTS. These are a demonstration of the mechanism using
// the five designs that exist, not a considered art direction — expect to
// rewrite them.
//
// Keyed on StampDesignId, which the extractor emits as a union of the
// filenames in assets/brand-source/stamps. A design that is renamed or
// deleted therefore breaks the build here rather than leaving a rule that
// silently never fires.
//
// Nothing claims exactRatings yet: 10.0 and 0.0 are meant to have their own
// artwork, and until those exist a perfect score falls through to the tiers
// below rather than borrowing a design that means something else.
export const STAMP_RULES: Partial<Record<StampDesignId, StampRules>> = {
  anchor: { tags: ['open-water'] },
  mountain: { tags: ['great-trails', 'scenic-location'] },
  star: { tags: ['highlight-of-the-city'], ratingRange: [9, 10] },
  moon: { tags: ['night-out', 'live-music', 'bar'] },
  eiffel: {},
};

function rulesFor(design: StampDesign): StampRules {
  return STAMP_RULES[design.id] ?? {};
}

export type StampMatchContext = {
  // Anything stable and unique per post — the visit id in practice. Decides
  // which design is drawn when more than one qualifies.
  seed: string;
  rating: number;
  // Tag slugs on this review, if any.
  tags?: string[];
  placeId?: string;
};

// Picks within one tier. Its own PRNG stream per tier, so a design entering
// or leaving one tier cannot shift the choice made in another — and
// deliberately not the stream FeedRatingStamp uses for tilt and placement,
// which would make adding a design silently rotate every stamp.
function pickFrom(tier: string, seed: string, designs: StampDesign[]): StampDesign | undefined {
  if (designs.length === 0) return undefined;
  if (designs.length === 1) return designs[0];
  return pickFor(`design:${tier}:${seed}`, designs);
}

// The hierarchy, most specific first. Each tier falls through when nothing
// claims it, so an incomplete rule set degrades to the plain random pick
// rather than to a blank stamp.
export function pickStampDesign(ctx: StampMatchContext): StampDesign | undefined {
  // 1. A perfect or a zero. Supersedes everything, including a
  //    location-specific design — the score is the whole story on those two.
  const exact = STAMP_DESIGNS.filter((d) => rulesFor(d).exactRatings?.includes(ctx.rating));
  if (exact.length > 0) return pickFrom('exact', ctx.seed, exact);

  // 2. Somewhere with its own stamp.
  if (ctx.placeId) {
    const byPlace = STAMP_DESIGNS.filter((d) => rulesFor(d).placeIds?.includes(ctx.placeId!));
    if (byPlace.length > 0) return pickFrom('place', ctx.seed, byPlace);
  }

  // 3. The batch this review's tags and rating qualify for, randomized
  //    within it. Tags and rating are one tier rather than two: a design
  //    can be declared for either, and asking which of the two outranks the
  //    other would be inventing a rule nobody asked for.
  const batch = STAMP_DESIGNS.filter((d) => {
    const rules = rulesFor(d);
    const tagHit = rules.tags?.some((slug) => ctx.tags?.includes(slug)) ?? false;
    const ratingHit = rules.ratingRange
      ? ctx.rating >= rules.ratingRange[0] && ctx.rating <= rules.ratingRange[1]
      : false;
    return tagHit || ratingHit;
  });
  if (batch.length > 0) return pickFrom('batch', ctx.seed, batch);

  // 4. Nothing claimed it. Every design is a candidate, which is what the
  //    stamp did before any of this existed.
  return pickFrom('any', ctx.seed, STAMP_DESIGNS);
}
