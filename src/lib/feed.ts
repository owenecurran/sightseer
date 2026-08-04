import { getFeedRecaps, type FeedRecap } from '@/lib/travel-book-recaps';
import { resolveStateCountries } from '@/lib/places-cache';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type PlaceCategory = Database['public']['Tables']['places']['Row']['category'];

export type TaggedPlace = {
  name: string;
  category: PlaceCategory;
};

export type FeedVisit = {
  id: string;
  rating: number | null;
  note: string | null;
  visited_on: string;
  created_at: string;
  user_id: string;
  authorName: string;
  placeName: string;
  // "Colorado, United States" (or just one of the two, or null if the
  // hierarchy is missing/incomplete) — see resolveStateCountry.
  stateCountry: string | null;
  photoIds: string[];
  // Parallel to photoIds (position-sorted, one entry per photo) — width/height
  // ratio, or null when either dimension is missing. Only meaningful for the
  // single-photo display case (see photo-grid.tsx); multi-photo grids stay
  // fixed square/tall regardless.
  photoAspectRatios: (number | null)[];
  likeCount: number;
  isLikedByMe: boolean;
  taggedUserNames: string[];
  taggedPlaces: TaggedPlace[];
  commentCount: number;
  visitNumber: number;
  isViewerTagged: boolean;
};

export const FEED_VISIT_SELECT =
  'id, rating, note, visited_on, created_at, user_id, place_id, users!user_id(handle, name), places!place_id(name), photos(id, position, width, height), likes(user_id), visit_tagged_users(user_id, users(handle, name)), visit_tagged_places(places(name, category)), comments(id)';

export type RawFeedVisit = {
  id: string;
  rating: number | null;
  note: string | null;
  visited_on: string;
  created_at: string;
  user_id: string;
  place_id: string;
  users: { handle: string | null; name: string | null } | null;
  places: { name: string } | null;
  photos: { id: string; position: number; width: number | null; height: number | null }[];
  likes: { user_id: string }[];
  visit_tagged_users: { user_id: string; users: { handle: string | null; name: string | null } | null }[];
  visit_tagged_places: { places: { name: string; category: PlaceCategory } | null }[];
  comments: { id: string }[];
};

// Shared by the follow-feed query and the reverse "tagged in" query
// (src/lib/tagged-visits.ts) — same raw shape, same mapping, just a
// different filter on `visits` upstream. `stateCountryMap` comes from a
// separate batched resolve_state_countries RPC call the caller makes once
// per list (see getFeedVisitsForFollowed etc.) — not fetched inline here,
// since PostgREST can't nest the ancestor lookup into this same query (see
// resolveStateCountries' own comment for why).
export function mapRawFeedVisit(
  visit: RawFeedVisit,
  myUserId: string,
  stateCountryMap?: Map<string, string | null>
): Omit<FeedVisit, 'visitNumber'> {
  return {
    id: visit.id,
    rating: visit.rating,
    note: visit.note,
    visited_on: visit.visited_on,
    created_at: visit.created_at,
    user_id: visit.user_id,
    authorName: visit.users?.name ?? visit.users?.handle ?? 'Someone',
    placeName: visit.places?.name ?? 'Unknown place',
    stateCountry: stateCountryMap?.get(visit.place_id) ?? null,
    photoIds: [...visit.photos].sort((a, b) => a.position - b.position).map((p) => p.id),
    photoAspectRatios: [...visit.photos]
      .sort((a, b) => a.position - b.position)
      .map((p) => (p.width && p.height ? p.width / p.height : null)),
    likeCount: visit.likes.length,
    isLikedByMe: visit.likes.some((like) => like.user_id === myUserId),
    taggedUserNames: visit.visit_tagged_users
      .map((t) => t.users?.name ?? t.users?.handle)
      .filter((name): name is string => name != null),
    taggedPlaces: visit.visit_tagged_places
      .map((t) => t.places)
      .filter((place): place is { name: string; category: PlaceCategory } => place != null),
    commentCount: visit.comments.length,
    isViewerTagged: visit.visit_tagged_users.some((t) => t.user_id === myUserId),
  };
}

export async function getFollowedUserIds(myUserId: string): Promise<string[]> {
  const { data: accepted, error: followsError } = await supabase
    .from('follows')
    .select('followee_id')
    .eq('follower_id', myUserId)
    .eq('status', 'accepted');
  if (followsError) throw followsError;
  return accepted.map((f) => f.followee_id);
}

async function getFeedVisitsForFollowed(followedIds: string[], myUserId: string): Promise<FeedVisit[]> {
  if (followedIds.length === 0) return [];

  const { data, error } = await supabase
    .from('visits')
    .select(FEED_VISIT_SELECT)
    .in('user_id', followedIds)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rawVisits = data as unknown as RawFeedVisit[];
  const [visitNumbers, stateCountryMap] = await Promise.all([
    computeVisitNumbers(rawVisits),
    resolveStateCountries(rawVisits.map((v) => v.place_id)),
  ]);

  return rawVisits.map((visit) => ({
    ...mapRawFeedVisit(visit, myUserId, stateCountryMap),
    visitNumber: visitNumbers.get(visit.id) ?? 1,
  }));
}

export async function getFeedVisits(myUserId: string): Promise<FeedVisit[]> {
  const followedIds = await getFollowedUserIds(myUserId);
  return getFeedVisitsForFollowed(followedIds, myUserId);
}

// Every review of one specific place, across all authors — used by the
// place-detail screen. Same select/mapping as the follow-feed, just filtered
// by place_id instead of user_id; likeCount comes along for free, so
// "popular" is just a client-side sort by it, same convention this file
// already uses everywhere else (no DB view/RPC for popularity).
export async function getVisitsForPlace(placeId: string, myUserId: string): Promise<FeedVisit[]> {
  const { data, error } = await supabase
    .from('visits')
    .select(FEED_VISIT_SELECT)
    .eq('place_id', placeId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rawVisits = data as unknown as RawFeedVisit[];
  const [visitNumbers, stateCountryMap] = await Promise.all([
    computeVisitNumbers(rawVisits),
    resolveStateCountries(rawVisits.map((v) => v.place_id)),
  ]);

  return rawVisits.map((visit) => ({
    ...mapRawFeedVisit(visit, myUserId, stateCountryMap),
    visitNumber: visitNumbers.get(visit.id) ?? 1,
  }));
}

export type FeedItem =
  | { type: 'visit'; sortKey: string; visit: FeedVisit }
  | { type: 'recap'; sortKey: string; recap: FeedRecap };

// Merges the follow-feed's two independent sources (visits, published
// travel-book recaps) client-side by timestamp — there's no DB view/union
// backing this, same "plain sequential queries" approach getFeedVisits
// already used before recaps existed.
export async function getFeedItems(myUserId: string): Promise<FeedItem[]> {
  const followedIds = await getFollowedUserIds(myUserId);
  if (followedIds.length === 0) return [];

  const [visits, recaps] = await Promise.all([
    getFeedVisitsForFollowed(followedIds, myUserId),
    getFeedRecaps(followedIds),
  ]);

  const items: FeedItem[] = [
    ...visits.map((visit): FeedItem => ({ type: 'visit', sortKey: visit.created_at, visit })),
    ...recaps.map((recap): FeedItem => ({ type: 'recap', sortKey: recap.publishedAt, recap })),
  ];
  return items.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

// "This is my 2nd visit here" — the visit's ordinal position among the same
// author's own visits to the same place, by when the visit actually
// happened (visited_on), not when the review was written. A single batched
// query + client-side ranking rather than a DB view, so this needed no
// schema change: RLS on `visits` already guarantees that if the caller can
// see one of an author's visits, they can see all of that author's visits
// at the same place (visibility is per-account, not per-row), so this is
// safe to compute from a plain follow-up query.
async function computeVisitNumbers(feedVisits: RawFeedVisit[]): Promise<Map<string, number>> {
  const pairs = new Map<string, { userId: string; placeId: string }>();
  for (const v of feedVisits) pairs.set(`${v.user_id}|${v.place_id}`, { userId: v.user_id, placeId: v.place_id });
  if (pairs.size === 0) return new Map();

  const orFilter = [...pairs.values()]
    .map((p) => `and(user_id.eq.${p.userId},place_id.eq.${p.placeId})`)
    .join(',');

  const { data, error } = await supabase
    .from('visits')
    .select('id, user_id, place_id, visited_on, created_at')
    .or(orFilter);
  if (error) throw error;

  const grouped = new Map<string, typeof data>();
  for (const v of data) {
    const key = `${v.user_id}|${v.place_id}`;
    grouped.set(key, [...(grouped.get(key) ?? []), v]);
  }

  const result = new Map<string, number>();
  for (const group of grouped.values()) {
    const sorted = [...group].sort(
      (a, b) => a.visited_on.localeCompare(b.visited_on) || a.created_at.localeCompare(b.created_at)
    );
    sorted.forEach((v, index) => result.set(v.id, index + 1));
  }
  return result;
}

export async function likeVisit(userId: string, visitId: string): Promise<void> {
  const { error } = await supabase.from('likes').insert({ user_id: userId, visit_id: visitId });
  if (error) throw error;
}

export async function unlikeVisit(userId: string, visitId: string): Promise<void> {
  const { error } = await supabase
    .from('likes')
    .delete()
    .eq('user_id', userId)
    .eq('visit_id', visitId);
  if (error) throw error;
}
