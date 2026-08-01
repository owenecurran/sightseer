import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type BoardRow = Database['public']['Tables']['boards']['Row'];
type TravelBookRow = Database['public']['Tables']['travel_books']['Row'];
type UserRow = Database['public']['Tables']['users']['Row'];
type FollowStatus = Database['public']['Tables']['follows']['Row']['status'];

export type SearchUserResult = UserRow & { followStatus: FollowStatus | null };
export type SearchBoardResult = BoardRow & { creatorName: string };
export type SearchTravelBookResult = TravelBookRow & { creatorName: string };

const RESULT_LIMIT = 20;

type CreatorRow = { name: string | null; handle: string | null } | null;

function creatorName(row: CreatorRow): string {
  return row?.name ?? row?.handle ?? 'Someone';
}

// Primary Search-tab mode: people + boards + travel books. No explicit
// is_private filtering needed for boards/travel_books — RLS's own select
// policies (owner-always, else is_private=false + can_view_user_content)
// already govern exactly what these may return, same reasoning already
// relied on elsewhere (e.g. profile-map.ts's visited places).
export async function searchAll(
  query: string,
  myUserId: string
): Promise<{ users: SearchUserResult[]; boards: SearchBoardResult[]; travelBooks: SearchTravelBookResult[] }> {
  const trimmed = query.trim();
  if (!trimmed) return { users: [], boards: [], travelBooks: [] };
  const pattern = `%${trimmed}%`;

  const [usersResult, boardsResult, travelBooksResult] = await Promise.all([
    supabase
      .from('users')
      .select('*')
      .neq('id', myUserId)
      .or(`handle.ilike.${pattern},name.ilike.${pattern}`)
      .limit(RESULT_LIMIT),
    supabase
      .from('boards')
      .select('*, users!user_id(name, handle)')
      .or(`name.ilike.${pattern},description.ilike.${pattern}`)
      .limit(RESULT_LIMIT),
    supabase
      .from('travel_books')
      .select('*, users!user_id(name, handle)')
      .or(`title.ilike.${pattern},description.ilike.${pattern}`)
      .limit(RESULT_LIMIT),
  ]);
  if (usersResult.error) throw usersResult.error;
  if (boardsResult.error) throw boardsResult.error;
  if (travelBooksResult.error) throw travelBooksResult.error;

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
    boards: (boardsResult.data as unknown as (BoardRow & { users: CreatorRow })[]).map(({ users, ...board }) => ({
      ...board,
      creatorName: creatorName(users),
    })),
    travelBooks: (travelBooksResult.data as unknown as (TravelBookRow & { users: CreatorRow })[]).map(
      ({ users, ...book }) => ({ ...book, creatorName: creatorName(users) })
    ),
  };
}

// Plain user search for tagging people on a visit / picking trip
// collaborators — no follow-status join needed there, unlike the unified
// Search tab above.
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
