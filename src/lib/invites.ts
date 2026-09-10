import AsyncStorage from '@react-native-async-storage/async-storage';

import { SITE_ORIGIN } from '@/lib/site';
import { detectDevicePlatform } from '@/lib/stores';
import { supabase } from '@/lib/supabase';

// The client side of trackable invite links. Every function here is a thin
// wrapper over one of the security-definer functions added in
// 20260909120000_invite_links.sql — the tables themselves are not writable
// by clients, so this module is the whole surface.

const PENDING_CODE_KEY = 'pending_invite_code';

export type Inviter = { handle: string | null; name: string | null };

export function inviteUrl(code: string): string {
  return `${SITE_ORIGIN}/i/${code}`;
}

// The caller's own code, minted on first ask. Stable thereafter, so it is
// safe to render directly and safe to call on every visit to the gate.
export async function ensureInviteCode(): Promise<string | null> {
  const { data, error } = await supabase.rpc('ensure_invite_code');
  if (error) return null;
  return data as string | null;
}

// Whose link is this? Returns null for an unknown or revoked code, which is
// what the landing page uses to decide between "X invited you" and the plain
// signed-out pitch.
export async function resolveInvite(code: string): Promise<Inviter | null> {
  const { data, error } = await supabase.rpc('resolve_invite', { p_code: code });
  if (error) return null;
  const rows = data as Inviter[] | null;
  if (!rows || rows.length === 0) return null;
  return rows[0];
}

// Best-effort, and deliberately un-awaited by its callers. A click that goes
// unrecorded costs a row in a stats table; a landing page that waits on a
// stats write before painting costs the visitor.
export async function recordInviteClick(code: string): Promise<void> {
  try {
    await supabase.rpc('record_invite_click', {
      p_code: code,
      p_platform: detectDevicePlatform(),
    });
  } catch {
    // Counting is approximate by nature — see the SQL function's comment.
  }
}

// Attribution, called once the invited person actually has an account.
// Returns whether this call is the one that recorded it; false covers
// already-attributed, unknown code, and opening your own link.
export async function redeemInvite(code: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('redeem_invite', { p_code: code });
  if (error) return false;
  return data === true;
}

// ---------------------------------------------------------------------
// Carrying the code across sign-up
// ---------------------------------------------------------------------
//
// The code arrives before there is an account to attach it to, and sign-up
// is several screens (and on native, potentially a whole app install) later.
// It is parked here in the meantime and consumed once, on the first
// authenticated moment after it was set.

export async function setPendingInviteCode(code: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_CODE_KEY, code);
  } catch {
    // A device that cannot persist this loses the attribution, not the
    // sign-up. Never worth failing the flow over.
  }
}

export async function getPendingInviteCode(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PENDING_CODE_KEY);
  } catch {
    return null;
  }
}

export async function clearPendingInviteCode(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_CODE_KEY);
  } catch {
    // Nothing to do — the redeem below is write-once server-side anyway, so
    // a code that lingers cannot produce a second attribution.
  }
}

// Redeem whatever is parked, if anything. Safe to call on every sign-in:
// redeem_invite is write-once, so a stale code that survived a failed clear
// cannot overwrite an existing attribution.
export async function consumePendingInvite(): Promise<boolean> {
  const code = await getPendingInviteCode();
  if (!code) return false;
  const redeemed = await redeemInvite(code);
  await clearPendingInviteCode();
  return redeemed;
}
