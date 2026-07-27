import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type PlaceCategory = Database['public']['Tables']['places']['Row']['category'];

export type VisitDetail = {
  id: string;
  rating: number;
  note: string | null;
  visited_on: string;
  user_id: string;
  authorName: string;
  placeName: string;
  photoIds: string[];
  likeCount: number;
  isLikedByMe: boolean;
  taggedUserNames: string[];
  taggedPlaces: { name: string; category: PlaceCategory }[];
  commentCount: number;
};

type RawVisitDetail = {
  id: string;
  rating: number;
  note: string | null;
  visited_on: string;
  user_id: string;
  users: { handle: string | null; name: string | null } | null;
  places: { name: string } | null;
  photos: { id: string; position: number }[];
  likes: { user_id: string }[];
  visit_tagged_users: { users: { handle: string | null; name: string | null } | null }[];
  visit_tagged_places: { places: { name: string; category: PlaceCategory } | null }[];
  comments: { id: string }[];
};

// Returns null (not an error) when the visit doesn't exist or the RLS
// policy hides it from this viewer — the two cases are indistinguishable
// on purpose, same privacy-preserving reasoning used everywhere else in
// this app (e.g. a stranger's fetch of a private user's content).
export async function getVisitDetail(visitId: string, myUserId: string): Promise<VisitDetail | null> {
  const { data, error } = await supabase
    .from('visits')
    .select(
      'id, rating, note, visited_on, user_id, users!user_id(handle, name), places!place_id(name), photos(id, position), likes(user_id), visit_tagged_users(users(handle, name)), visit_tagged_places(places(name, category)), comments(id)'
    )
    .eq('id', visitId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const v = data as unknown as RawVisitDetail;
  return {
    id: v.id,
    rating: v.rating,
    note: v.note,
    visited_on: v.visited_on,
    user_id: v.user_id,
    authorName: v.users?.name ?? v.users?.handle ?? 'Someone',
    placeName: v.places?.name ?? 'Unknown place',
    photoIds: [...v.photos].sort((a, b) => a.position - b.position).map((p) => p.id),
    likeCount: v.likes.length,
    isLikedByMe: v.likes.some((like) => like.user_id === myUserId),
    taggedUserNames: v.visit_tagged_users
      .map((t) => t.users?.name ?? t.users?.handle)
      .filter((name): name is string => name != null),
    taggedPlaces: v.visit_tagged_places
      .map((t) => t.places)
      .filter((place): place is { name: string; category: PlaceCategory } => place != null),
    commentCount: v.comments.length,
  };
}
