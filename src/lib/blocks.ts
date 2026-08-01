import { supabase } from '@/lib/supabase';

// Silent, bidirectional block. Deletes any existing follow relationship in
// both directions before inserting the block row — RLS then also refuses
// any *new* follow/tag attempt between the two (see is_blocked() in the
// blocks migration) and can_view_user_content hides each other's content
// and profile-gated data mutually going forward.
export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error: unfollowError } = await supabase
    .from('follows')
    .delete()
    .or(
      `and(follower_id.eq.${blockerId},followee_id.eq.${blockedId}),and(follower_id.eq.${blockedId},followee_id.eq.${blockerId})`
    );
  if (unfollowError) throw unfollowError;

  const { error } = await supabase.from('blocks').insert({ blocker_id: blockerId, blocked_id: blockedId });
  if (error) throw error;
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
  if (error) throw error;
}

export async function isBlocking(blockerId: string, blockedId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('blocks')
    .select('blocker_id')
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

export type BlockedUser = { id: string; handle: string | null; name: string | null };

type BlockedUserRow = { users: BlockedUser | null };

export async function listBlockedUsers(blockerId: string): Promise<BlockedUser[]> {
  const { data, error } = await supabase
    .from('blocks')
    .select('users!blocked_id(id, handle, name)')
    .eq('blocker_id', blockerId);
  if (error) throw error;
  return (data as unknown as BlockedUserRow[]).map((r) => r.users).filter((u): u is BlockedUser => u != null);
}
