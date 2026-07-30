import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type BoardRow = Database['public']['Tables']['boards']['Row'];
type UserRow = Database['public']['Tables']['users']['Row'];
type FollowStatus = Database['public']['Tables']['follows']['Row']['status'];

export type SearchUserResult = UserRow & { followStatus: FollowStatus | null };

const RESULT_LIMIT = 20;

// Primary Search-tab mode: people + boards. No explicit is_private filtering
// needed — RLS's boards_select policy (owner-always, else is_private=false +
// can_view_user_content) already governs exactly what this may return, same
// reasoning already relied on elsewhere (e.g. profile-map.ts's visited places).
export async function searchPeopleAndBoards(
  query: string,
  myUserId: string
): Promise<{ users: SearchUserResult[]; boards: BoardRow[] }> {
  const trimmed = query.trim();
  if (!trimmed) return { users: [], boards: [] };
  const pattern = `%${trimmed}%`;

  const [usersResult, boardsResult] = await Promise.all([
    supabase
      .from('users')
      .select('*')
      .neq('id', myUserId)
      .or(`handle.ilike.${pattern},name.ilike.${pattern}`)
      .limit(RESULT_LIMIT),
    supabase.from('boards').select('*').or(`name.ilike.${pattern},description.ilike.${pattern}`).limit(RESULT_LIMIT),
  ]);
  if (usersResult.error) throw usersResult.error;
  if (boardsResult.error) throw boardsResult.error;

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
    users: usersResult.data.map((u) => ({ ...u, followStatus: statusByUserId.get(u.id) ?? null })),
    boards: boardsResult.data,
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
