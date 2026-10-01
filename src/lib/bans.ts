import { supabase } from './supabase';

// The one reason the app writes for itself. Everything else comes from an
// admin typing into the moderation screen, so the set stays open — but this
// value is matched on in two places (the ban screen's wording, and the
// moderation list) and so has to be a constant, not a repeated string.
export const UNDERAGE_REASON = 'underage';

export const MIN_AGE_YEARS = 13;

// Both of these go through RPCs rather than updating users directly: a
// trigger (20260829180000) rejects writes to the ban columns that arrive
// straight from PostgREST, because users_update_own would otherwise let a
// banned user lift their own ban.

// Admin only — the RPC re-checks is_admin server-side, so a non-admin
// calling this gets an error rather than a silent no-op.
export async function setUserBanned(userId: string, reason: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_user_banned', {
    p_user_id: userId,
    // Cast because the generated types render every SQL argument as
    // non-null; null is the documented unban path here, not a mistake.
    p_reason: reason as string,
  });
  if (error) throw error;
}

// Bans the caller's own account for being under the age minimum. Acts on
// auth.uid() server-side, so it takes no argument and cannot be pointed at
// anyone else.
export async function flagSelfUnderage(): Promise<void> {
  const { error } = await supabase.rpc('flag_self_underage');
  if (error) throw error;
}

export type BannedUser = {
  id: string;
  name: string | null;
  handle: string | null;
  bannedAt: string;
  reason: string | null;
};

// The admin's view of who is currently banned, and the only route back out.
// Without it a ban is a one-way door: the report leaves the pending queue
// the moment it is actioned, taking the last reference to that account with
// it.
//
// Admin-gated server-side: see admin_list_banned. ban_reason and banned_at
// are no longer part of the public column grant on users.
export async function listBannedUsers(): Promise<BannedUser[]> {
  // Through admin_list_banned, which checks is_admin server-side. banned_at
  // and ban_reason left the public column grant, and the comment above used
  // to say this was "not a privilege boundary" because anyone could read them
  // anyway. That was true, and it was the bug.
  const { data, error } = await supabase.rpc('admin_list_banned');
  if (error) throw error;
  return (data ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    handle: u.handle,
    bannedAt: u.banned_at as string,
    reason: u.ban_reason,
  }));
}
