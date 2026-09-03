import { resolveStateCountries } from '@/lib/places-cache';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type PlaceCategory = Database['public']['Tables']['places']['Row']['category'];

export type VisitDetail = {
  id: string;
  rating: number | null;
  note: string | null;
  visited_on: string;
  user_id: string;
  authorName: string;
  placeName: string;
  placeId: string;
  // Same reason FeedVisit carries these: a review with no photos shows a
  // map of where it happened instead, and that needs coordinates and a
  // level to pick a zoom.
  placeLat: number | null;
  placeLng: number | null;
  placeLevel: string | null;
  stateCountry: string | null;
  photoIds: string[];
  photoAspectRatios: (number | null)[];
  likeCount: number;
  isLikedByMe: boolean;
  taggedUsers: { id: string; name: string }[];
  taggedPlaces: { name: string; category: PlaceCategory }[];
  tags: { slug: string; label: string }[];
  commentCount: number;
  isViewerTagged: boolean;
};

type RawVisitDetail = {
  id: string;
  rating: number | null;
  note: string | null;
  visited_on: string;
  user_id: string;
  place_id: string;
  users: { handle: string | null; name: string | null } | null;
  places: { name: string; lat: number | null; lng: number | null; level: string | null } | null;
  photos: { id: string; position: number; width: number | null; height: number | null }[];
  likes: { count: number }[];
  visit_tagged_users: { user_id: string; users: { handle: string | null; name: string | null } | null }[];
  visit_tagged_places: { places: { name: string; category: PlaceCategory } | null }[];
  visit_tags: { tag_slug: string; tags: { label: string } | null }[];
  comments: { count: number }[];
};

// Returns null (not an error) when the visit doesn't exist or the RLS
// policy hides it from this viewer — the two cases are indistinguishable
// on purpose, same privacy-preserving reasoning used everywhere else in
// this app (e.g. a stranger's fetch of a private user's content).
export async function getVisitDetail(visitId: string, myUserId: string): Promise<VisitDetail | null> {
  const { data, error } = await supabase
    .from('visits')
    .select(
      'id, rating, note, visited_on, user_id, place_id, users!user_id(handle, name), places!place_id(name, lat, lng, level), photos(id, position, width, height), likes(count), visit_tagged_users(user_id, users(handle, name)), visit_tagged_places(places(name, category)), visit_tags(tag_slug, tags(label)), comments(count)'
    )
    .eq('id', visitId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const v = data as unknown as RawVisitDetail;
  // Same one-place-at-a-time shape resolveStateCountries is meant for
  // batches of (feed.ts calls it with every visit on screen at once) — a
  // single-element array here is just the degenerate case, not a misuse.
  const [stateCountryMap, likedByMe] = await Promise.all([
    resolveStateCountries([v.place_id]),
    // likes(count) can't say whether *I* liked it, so that's its own tiny
    // lookup — one row, keyed by the primary key pair.
    supabase
      .from('likes')
      .select('visit_id')
      .eq('user_id', myUserId)
      .eq('visit_id', v.id)
      .maybeSingle()
      .then(({ data }) => data != null),
  ]);
  return {
    id: v.id,
    rating: v.rating,
    note: v.note,
    visited_on: v.visited_on,
    user_id: v.user_id,
    authorName: v.users?.name ?? v.users?.handle ?? 'Someone',
    placeName: v.places?.name ?? 'Unknown place',
    placeId: v.place_id,
    placeLat: v.places?.lat ?? null,
    placeLng: v.places?.lng ?? null,
    placeLevel: v.places?.level ?? null,
    stateCountry: stateCountryMap.get(v.place_id) ?? null,
    photoIds: [...v.photos].sort((a, b) => a.position - b.position).map((p) => p.id),
    photoAspectRatios: [...v.photos]
      .sort((a, b) => a.position - b.position)
      .map((p) => (p.width && p.height ? p.width / p.height : null)),
    likeCount: v.likes[0]?.count ?? 0,
    // Single visit, so a one-row lookup rather than the batched helper the
    // list screens use.
    isLikedByMe: likedByMe,
    taggedUsers: v.visit_tagged_users
      .map((t) => {
        const name = t.users?.name ?? t.users?.handle;
        return name != null ? { id: t.user_id, name } : null;
      })
      .filter((t): t is { id: string; name: string } => t != null),
    taggedPlaces: v.visit_tagged_places
      .map((t) => t.places)
      .filter((place): place is { name: string; category: PlaceCategory } => place != null),
    tags: v.visit_tags
      .filter((row) => row.tags != null)
      .map((row) => ({ slug: row.tag_slug, label: row.tags!.label })),
    commentCount: v.comments[0]?.count ?? 0,
    isViewerTagged: v.visit_tagged_users.some((t) => t.user_id === myUserId),
  };
}
