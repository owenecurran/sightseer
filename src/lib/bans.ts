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
// Readable by anyone under users_select, so this is not a privilege boundary
// — the screen that shows it is admin-only, and setUserBanned is what
// actually checks. Nothing here is more sensitive than a profile already is.
export async function listBannedUsers(): Promise<BannedUser[]> {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, handle, banned_at, ban_reason')
    .not('banned_at', 'is', null)
    .order('banned_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    handle: u.handle,
    bannedAt: u.banned_at as string,
    reason: u.ban_reason,
  }));
}
