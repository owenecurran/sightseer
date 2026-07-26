import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type PlaceCategory = Database['public']['Tables']['places']['Row']['category'];

export type TaggedPlace = {
  name: string;
  category: PlaceCategory;
};

export type FeedVisit = {
  id: string;
  rating: number;
  note: string | null;
  visited_on: string;
  created_at: string;
  user_id: string;
  authorName: string;
  placeName: string;
  photoIds: string[];
  likeCount: number;
  isLikedByMe: boolean;
  taggedUserNames: string[];
  taggedPlaces: TaggedPlace[];
  commentCount: number;
  visitNumber: number;
};

type RawFeedVisit = {
  id: string;
  rating: number;
  note: string | null;
  visited_on: string;
  created_at: string;
  user_id: string;
  place_id: string;
  users: { handle: string | null; name: string | null } | null;
  places: { name: string } | null;
  photos: { id: string; position: number }[];
  likes: { user_id: string }[];
  visit_tagged_users: { users: { handle: string | null; name: string | null } | null }[];
  visit_tagged_places: { places: { name: string; category: PlaceCategory } | null }[];
  comments: { id: string }[];
};

export async function getFeedVisits(myUserId: string): Promise<FeedVisit[]> {
  const { data: accepted, error: followsError } = await supabase
    .from('follows')
    .select('followee_id')
    .eq('follower_id', myUserId)
    .eq('status', 'accepted');
  if (followsError) throw followsError;

  const followedIds = accepted.map((f) => f.followee_id);
  if (followedIds.length === 0) return [];

  const { data, error } = await supabase
    .from('visits')
    .select(
      'id, rating, note, visited_on, created_at, user_id, place_id, users!user_id(handle, name), places!place_id(name), photos(id, position), likes(user_id), visit_tagged_users(users(handle, name)), visit_tagged_places(places(name, category)), comments(id)'
    )
    .in('user_id', followedIds)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rawVisits = data as unknown as RawFeedVisit[];
  const visitNumbers = await computeVisitNumbers(rawVisits);

  return rawVisits.map((visit) => ({
    id: visit.id,
    rating: visit.rating,
    note: visit.note,
    visited_on: visit.visited_on,
    created_at: visit.created_at,
    user_id: visit.user_id,
    authorName: visit.users?.name ?? visit.users?.handle ?? 'Someone',
    placeName: visit.places?.name ?? 'Unknown place',
    photoIds: [...visit.photos].sort((a, b) => a.position - b.position).map((p) => p.id),
    likeCount: visit.likes.length,
    isLikedByMe: visit.likes.some((like) => like.user_id === myUserId),
    taggedUserNames: visit.visit_tagged_users
      .map((t) => t.users?.name ?? t.users?.handle)
      .filter((name): name is string => name != null),
    taggedPlaces: visit.visit_tagged_places
      .map((t) => t.places)
      .filter((place): place is { name: string; category: PlaceCategory } => place != null),
    commentCount: visit.comments.length,
    visitNumber: visitNumbers.get(visit.id) ?? 1,
  }));
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
