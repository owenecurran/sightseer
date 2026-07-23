import { supabase } from '@/lib/supabase';

export type FeedVisit = {
  id: string;
  rating: number;
  note: string | null;
  visited_on: string;
  created_at: string;
  user_id: string;
  authorName: string;
  placeName: string;
  photoId: string | null;
  likeCount: number;
  isLikedByMe: boolean;
};

type RawFeedVisit = {
  id: string;
  rating: number;
  note: string | null;
  visited_on: string;
  created_at: string;
  user_id: string;
  users: { handle: string | null; name: string | null } | null;
  places: { name: string } | null;
  photos: { id: string }[];
  likes: { user_id: string }[];
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
      'id, rating, note, visited_on, created_at, user_id, users!user_id(handle, name), places!place_id(name), photos(id), likes(user_id)'
    )
    .in('user_id', followedIds)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data as unknown as RawFeedVisit[]).map((visit) => ({
    id: visit.id,
    rating: visit.rating,
    note: visit.note,
    visited_on: visit.visited_on,
    created_at: visit.created_at,
    user_id: visit.user_id,
    authorName: visit.users?.name ?? visit.users?.handle ?? 'Someone',
    placeName: visit.places?.name ?? 'Unknown place',
    photoId: visit.photos[0]?.id ?? null,
    likeCount: visit.likes.length,
    isLikedByMe: visit.likes.some((like) => like.user_id === myUserId),
  }));
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
