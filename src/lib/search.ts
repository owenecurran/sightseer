import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type PlaceRow = Database['public']['Tables']['places']['Row'];
type UserRow = Database['public']['Tables']['users']['Row'];
type FollowStatus = Database['public']['Tables']['follows']['Row']['status'];

export type SearchUserResult = UserRow & { followStatus: FollowStatus | null };

const RESULT_LIMIT = 20;

export async function searchPlacesAndUsers(
  query: string,
  myUserId: string
): Promise<{ places: PlaceRow[]; users: SearchUserResult[] }> {
  const trimmed = query.trim();
  if (!trimmed) return { places: [], users: [] };
  const pattern = `%${trimmed}%`;

  const [placesResult, usersResult] = await Promise.all([
    supabase.from('places').select('*').ilike('name', pattern).limit(RESULT_LIMIT),
    supabase
      .from('users')
      .select('*')
      .neq('id', myUserId)
      .or(`handle.ilike.${pattern},name.ilike.${pattern}`)
      .limit(RESULT_LIMIT),
  ]);
  if (placesResult.error) throw placesResult.error;
  if (usersResult.error) throw usersResult.error;

  const userIds = usersResult.data.map((u) => u.id);
  let statusByUserId = new Map<string, FollowStatus>();
  if (userIds.length > 0) {
    const { data: myFollows, error } = await supabase
      .from('follows')
      .select('followee_id, status')
      .eq('follower_id', myUserId)
      .in('followee_id', userIds);
    if (error) throw error;
    statusByUserId = new Map(myFollows.map((f) => [f.followee_id, f.status]));
  }

  return {
    places: placesResult.data,
    users: usersResult.data.map((u) => ({ ...u, followStatus: statusByUserId.get(u.id) ?? null })),
  };
}

// Plain user search for tagging people on a visit — no follow-status join
// needed there, unlike the unified Search tab above.
export async function searchUsers(query: string, myUserId: string): Promise<UserRow[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const pattern = `%${trimmed}%`;

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .neq('id', myUserId)
    .or(`handle.ilike.${pattern},name.ilike.${pattern}`)
    .limit(RESULT_LIMIT);
  if (error) throw error;
  return data;
}
