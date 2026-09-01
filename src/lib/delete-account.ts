import { supabase } from '@/lib/supabase';

// Permanently deletes the signed-in account.
//
// An edge function rather than a client-side delete, because removing the
// auth user requires the service role — a client can only ever delete its
// own PROFILE row, which would leave a sign-in-able account behind pointing
// at nothing. The function takes no user id: it acts on the caller's own
// verified token, so this cannot be pointed at anyone else.
export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account');
  if (error) throw error;
  if (data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }

  // The session is dead server-side; clearing it locally is what actually
  // returns the app to the signed-out state. Ignoring the result on purpose —
  // the account is already gone, so a failure here must not surface as
  // "deletion failed".
  await supabase.auth.signOut().catch(() => {});
}
