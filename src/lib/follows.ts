import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type UserRow = Database['public']['Tables']['users']['Row'];
type FollowStatus = Database['public']['Tables']['follows']['Row']['status'];

export type OtherUser = UserRow & { followStatus: FollowStatus | null };

export async function listOtherUsersWithFollowStatus(myUserId: string): Promise<OtherUser[]> {
  const [{ data: users, error: usersError }, { data: myFollows, error: followsError }] =
    await Promise.all([
      supabase.from('users').select('*').neq('id', myUserId),
      supabase.from('follows').select('followee_id, status').eq('follower_id', myUserId),
    ]);
  if (usersError) throw usersError;
  if (followsError) throw followsError;

  const statusByUserId = new Map(myFollows.map((f) => [f.followee_id, f.status]));
  return users.map((user) => ({ ...user, followStatus: statusByUserId.get(user.id) ?? null }));
}

export async function followUser(params: {
  followerId: string;
  followeeId: string;
  followeeIsPrivate: boolean;
}): Promise<FollowStatus> {
  const status: FollowStatus = params.followeeIsPrivate ? 'pending' : 'accepted';
  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: params.followerId, followee_id: params.followeeId, status });
  if (error) throw error;
  return status;
}

// Deletes the follow row regardless of status — cancels a pending request or
// unfollows an accepted one, same action from the follower's side either way.
export async function unfollowOrCancelRequest(followerId: string, followeeId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('followee_id', followeeId);
  if (error) throw error;
}

export type IncomingFollowRequest = {
  follower_id: string;
  users: { handle: string | null; name: string | null } | null;
};

export async function listIncomingFollowRequests(myUserId: string): Promise<IncomingFollowRequest[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('follower_id, users!follower_id(handle, name)')
    .eq('followee_id', myUserId)
    .eq('status', 'pending');
  if (error) throw error;
  return data as unknown as IncomingFollowRequest[];
}

export async function acceptFollowRequest(followerId: string, followeeId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .update({ status: 'accepted' })
    .eq('follower_id', followerId)
    .eq('followee_id', followeeId);
  if (error) throw error;
}

export async function rejectFollowRequest(followerId: string, followeeId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('followee_id', followeeId);
  if (error) throw error;
}

// Deletes from the followee's side — RLS already permits either participant
// to delete a follows row (follows_delete_participant), this is just the
// first client call that exercises that as the followee rather than the
// follower (a normal unfollow always calls unfollowOrCancelRequest above).
export async function removeFollower(followeeId: string, followerId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('followee_id', followeeId);
  if (error) throw error;
}

export type FollowListEntry = { id: string; handle: string | null; name: string | null };

type FollowerEmbedRow = { users: FollowListEntry | null };

export async function listFollowers(userId: string): Promise<FollowListEntry[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('users!follower_id(id, handle, name)')
    .eq('followee_id', userId)
    .eq('status', 'accepted');
  if (error) throw error;
  return (data as unknown as FollowerEmbedRow[]).map((r) => r.users).filter((u): u is FollowListEntry => u != null);
}

export async function listFollowing(userId: string): Promise<FollowListEntry[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('users!followee_id(id, handle, name)')
    .eq('follower_id', userId)
    .eq('status', 'accepted');
  if (error) throw error;
  return (data as unknown as FollowerEmbedRow[]).map((r) => r.users).filter((u): u is FollowListEntry => u != null);
}

export async function getFollowStatus(followerId: string, followeeId: string): Promise<FollowStatus | null> {
  const { data, error } = await supabase
    .from('follows')
    .select('status')
    .eq('follower_id', followerId)
    .eq('followee_id', followeeId)
    .maybeSingle();
  if (error) throw error;
  return data?.status ?? null;
}

export type MutualFollower = { id: string; name: string | null; handle: string | null };

// "Followed by X (+N others)" on a search result — accounts the *viewer*
// follows who also follow each candidate. One batched query (viewer's own
// following list, then a single follows lookup intersected against every
// candidate at once), not one query per search result.
export async function listMutualFollowers(
  viewerId: string,
  candidateIds: string[]
): Promise<Map<string, MutualFollower[]>> {
  const result = new Map<string, MutualFollower[]>();
  if (candidateIds.length === 0) return result;

  const viewerFollowing = await listFollowing(viewerId);
  const viewerFollowingIds = viewerFollowing.map((u) => u.id);
  if (viewerFollowingIds.length === 0) return result;

  const { data, error } = await supabase
    .from('follows')
    .select('followee_id, users!follower_id(id, name, handle)')
    .in('followee_id', candidateIds)
    .in('follower_id', viewerFollowingIds)
    .eq('status', 'accepted');
  if (error) throw error;

  for (const row of data as unknown as { followee_id: string; users: MutualFollower | null }[]) {
    if (!row.users) continue;
    const list = result.get(row.followee_id) ?? [];
    list.push(row.users);
    result.set(row.followee_id, list);
  }
  return result;
}

export type RankedUser<T> = T & { followStatus: FollowStatus | null; mutuals: MutualFollower[] };

// Shared ranking for every "search for a person" surface (the Search tab's
// people results, tagging people on a review) — people the viewer already
// follows first, then anyone with mutual followers (more mutuals first),
// then everyone else. One batched pair of queries (follow status + mutual
// followers, both already keyed by candidate id) regardless of how many
// users are being ranked, not one query per candidate.
export async function rankByConnection<T extends { id: string }>(
  users: T[],
  viewerId: string
): Promise<RankedUser<T>[]> {
  if (users.length === 0) return [];
  const userIds = users.map((u) => u.id);

  const [followsResult, mutualsByUser] = await Promise.all([
    supabase.from('follows').select('followee_id, status').eq('follower_id', viewerId).in('followee_id', userIds),
    listMutualFollowers(viewerId, userIds),
  ]);
  if (followsResult.error) throw followsResult.error;
  const statusByUserId = new Map(followsResult.data.map((f) => [f.followee_id, f.status]));

  const ranked = users.map((user) => ({
    ...user,
    followStatus: statusByUserId.get(user.id) ?? null,
    mutuals: mutualsByUser.get(user.id) ?? [],
  }));

  ranked.sort((a, b) => {
    const aFollowing = a.followStatus === 'accepted' ? 1 : 0;
    const bFollowing = b.followStatus === 'accepted' ? 1 : 0;
    if (aFollowing !== bFollowing) return bFollowing - aFollowing;
    return b.mutuals.length - a.mutuals.length;
  });
  return ranked;
}

export async function getFollowCounts(userId: string): Promise<{ following: number; followers: number }> {
  const [followingResult, followersResult] = await Promise.all([
    supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', userId)
      .eq('status', 'accepted'),
    supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('followee_id', userId)
      .eq('status', 'accepted'),
  ]);
  if (followingResult.error) throw followingResult.error;
  if (followersResult.error) throw followersResult.error;
  return { following: followingResult.count ?? 0, followers: followersResult.count ?? 0 };
}
