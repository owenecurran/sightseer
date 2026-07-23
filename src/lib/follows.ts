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
