import type { Coordinate } from '@/lib/current-location';
import { getVisitsByIds, type FeedVisit } from '@/lib/feed';
import { supabase } from '@/lib/supabase';

// The reviews behind a tag's page, and the orders and filters it offers.
//
// The page used to show the thirty newest reviews with the tag, in date
// order, with nothing to change. Now it takes everything the tag has (up to
// TAG_REVIEW_LIMIT, the most recently tagged first), ranks it here, and lets
// the page re-sort and filter it without another round trip. Ranking on the
// client is honest at this size: every review on the page is already loaded
// to be shown, and the ranking needs nothing the card does not already carry.

// How many tagged reviews are fetched: the most recently tagged. A tag with
// more than this ranks only its latest ones. Worth moving into SQL if a tag
// ever gets near it; the app holds a few dozen reviews in all today.
const TAG_REVIEW_LIMIT = 200;

export type TagSort = 'recommended' | 'nearest' | 'highest' | 'newest' | 'popular';

export type TagFilters = {
  // Rated HIGH_RATING or better.
  highRated: boolean;
  // By people the viewer follows.
  friendsOnly: boolean;
  // Within NEARBY_KM of the viewer. Only offered when the viewer's
  // whereabouts are known.
  nearby: boolean;
  // With at least one photo.
  withPhotos: boolean;
};

export const NO_TAG_FILTERS: TagFilters = { highRated: false, friendsOnly: false, nearby: false, withPhotos: false };

// What counts as highly rated, on the 0-10 scale.
export const HIGH_RATING = 8;
// What counts as nearby, in kilometres: about an hour's drive.
export const NEARBY_KM = 100;

// The recommended order's three pulls, on the rating's own 0-10 scale, the
// way Discover scores places (see the 20260918120000_discover migration):
// additive, so each can be read against the others.
//
// - Near you: up to NEAR_BONUS points, falling off smoothly with distance
//   (about two thirds at 100 km, a third at 250, nothing much past 600) rather
//   than at a hard radius.
// - A friend's review: FRIEND_BONUS points. A friend's 7 sits level with a
//   stranger's 9.
// - The rating itself. An unrated review counts as UNRATED, the scale's
//   midpoint: no opinion either way. Not the tag's average, which on a tag
//   people like is high, and ranked a review that gave no rating above one
//   that gave an 8 for the same place.
//
// So a nearby place someone you follow rated well comes first, a nearby or
// a friend's review next, and a far-off stranger's review only on its rating.
const NEAR_BONUS = 2.5;
const NEAR_FALLOFF_KM = 250;
const FRIEND_BONUS = 2;
const UNRATED = 5;
// A whisker for recency, so otherwise equal reviews put the newer first.
const RECENCY_BONUS = 0.3;
const RECENCY_HALF_LIFE_DAYS = 90;

// Every review the viewer can see that carries this tag, and the tag's label.
export async function getTaggedReviews(
  slug: string,
  viewerId: string,
): Promise<{ label: string | null; visits: FeedVisit[] }> {
  const [tagRows, tag] = await Promise.all([
    supabase
      .from('visit_tags')
      .select('visit_id')
      .eq('tag_slug', slug)
      .order('created_at', { ascending: false })
      .limit(TAG_REVIEW_LIMIT),
    supabase.from('tags').select('label').eq('slug', slug).maybeSingle(),
  ]);
  if (tagRows.error) throw tagRows.error;
  const ids = [...new Set((tagRows.data ?? []).map((row) => row.visit_id))];
  // getVisitsByIds is the feed's own path, so a card here is identical to the
  // same review anywhere else. It returns only what the viewer may see.
  const visits = await getVisitsByIds(ids, viewerId);
  return { label: tag.data?.label ?? null, visits };
}

// Great-circle distance in kilometres.
export function distanceKm(a: Coordinate, b: Coordinate): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function distanceTo(visit: FeedVisit, viewer: Coordinate | null): number | null {
  if (viewer == null || visit.placeLat == null || visit.placeLng == null) return null;
  return distanceKm(viewer, { lat: visit.placeLat, lng: visit.placeLng });
}

type RankOptions = {
  sort: TagSort;
  filters: TagFilters;
  viewer: Coordinate | null;
  followedIds: Set<string>;
};

// The reviews to show, filtered and then ordered. Filtering first: there is
// no point sorting what is about to be dropped.
export function rankTaggedReviews(visits: FeedVisit[], { sort, filters, viewer, followedIds }: RankOptions): FeedVisit[] {
  const distances = new Map(visits.map((visit) => [visit.id, distanceTo(visit, viewer)]));

  const kept = visits.filter((visit) => {
    if (filters.highRated && (visit.rating == null || visit.rating < HIGH_RATING)) return false;
    if (filters.friendsOnly && !followedIds.has(visit.user_id)) return false;
    if (filters.withPhotos && visit.photoIds.length === 0) return false;
    if (filters.nearby) {
      const km = distances.get(visit.id);
      if (km == null || km > NEARBY_KM) return false;
    }
    return true;
  });

  // Newest first underneath every other order, so ties fall that way.
  const byNewest = (a: FeedVisit, b: FeedVisit) => b.created_at.localeCompare(a.created_at);

  switch (sort) {
    case 'newest':
      return [...kept].sort(byNewest);
    case 'popular':
      return [...kept].sort((a, b) => b.likeCount - a.likeCount || byNewest(a, b));
    case 'highest':
      // Unrated reviews last rather than counted as a zero.
      return [...kept].sort(
        (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || byNewest(a, b),
      );
    case 'nearest':
      // Places with no known position last.
      return [...kept].sort((a, b) => {
        const da = distances.get(a.id) ?? Infinity;
        const db = distances.get(b.id) ?? Infinity;
        return da - db || byNewest(a, b);
      });
    case 'recommended': {
      const now = Date.now();
      const score = (visit: FeedVisit) => {
        const km = distances.get(visit.id);
        const ageDays = Math.max(0, (now - new Date(visit.created_at).getTime()) / 86_400_000);
        return (
          (visit.rating ?? UNRATED) +
          (km == null ? 0 : NEAR_BONUS * Math.exp(-km / NEAR_FALLOFF_KM)) +
          (followedIds.has(visit.user_id) ? FRIEND_BONUS : 0) +
          RECENCY_BONUS * 0.5 ** (ageDays / RECENCY_HALF_LIFE_DAYS)
        );
      };
      const scores = new Map(kept.map((visit) => [visit.id, score(visit)]));
      return [...kept].sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || byNewest(a, b));
    }
  }
}
