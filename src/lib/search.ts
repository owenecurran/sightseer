import { rankByConnection, type RankedUser } from '@/lib/follows';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import { PUBLIC_USER_COLUMNS, type PublicProfile } from '@/lib/public-profile';

type BoardRow = Database['public']['Tables']['boards']['Row'];
type TravelBookRow = Database['public']['Tables']['travel_books']['Row'];
// Narrowed to what the public column grant on `users` actually returns.
// Anything outside PUBLIC_USER_COLUMNS now needs a definer function --
// see 20260930130000_restrict_users_columns.sql.
type UserRow = PublicProfile;

export type SearchUserResult = RankedUser<UserRow>;
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
      .select(PUBLIC_USER_COLUMNS)
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

  return {
    // Following first, then most-mutuals-first, then everyone else — see
    // rankByConnection's own comment. Also attaches each user's `mutuals`
    // list, so callers (e.g. explore.tsx) don't need a second round-trip
    // just to show "Followed by X" / a mutual-follower count.
    users: await rankByConnection(usersResult.data, myUserId),
    boards: (boardsResult.data as unknown as (BoardRow & { users: CreatorRow })[]).map(({ users, ...board }) => ({
      ...board,
      creatorName: creatorName(users),
    })),
    travelBooks: (travelBooksResult.data as unknown as (TravelBookRow & { users: CreatorRow })[]).map(
      ({ users, ...book }) => ({ ...book, creatorName: creatorName(users) })
    ),
  };
}

// User search for tagging people on a visit / picking trip collaborators —
// ranked the same way as the unified Search tab above (rankByConnection),
// so friends/following surface first there too.
export async function searchUsers(query: string, myUserId: string): Promise<SearchUserResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const pattern = `%${trimmed}%`;

  const { data, error } = await supabase
    .from('users')
    .select(PUBLIC_USER_COLUMNS)
    .neq('id', myUserId)
    .or(`handle.ilike.${pattern},name.ilike.${pattern}`)
    .limit(RESULT_LIMIT);
  if (error) throw error;
  return rankByConnection(data, myUserId);
}

const SUGGESTION_LIMIT = 8;

// Who the Search tab shows before anything is typed.
//
// People followed by the people you follow, most-shared first, then -- for
// an account too new to follow anyone, or to fill out a short list --
// whoever has posted most recently. Anyone you already follow or have asked
// to follow is left out.
//
// EVERY SUGGESTION HAS A REVIEW YOU CAN READ. Both sources are put through
// the visits table, whose select policy is can_view_user_content: that one
// check drops anyone blocked in either direction (the blocks table only
// shows you your own rows, so the other direction could not be filtered
// here any other way), private accounts you cannot see into, and empty
// profiles, which are not worth suggesting anyway.
export async function suggestPeople(myUserId: string): Promise<SearchUserResult[]> {
  const { data: mine, error: mineError } = await supabase
    .from('follows')
    .select('followee_id, status')
    .eq('follower_id', myUserId);
  if (mineError) throw mineError;

  const excluded = new Set([myUserId, ...mine.map((row) => row.followee_id)]);
  const followingIds = mine.filter((row) => row.status === 'accepted').map((row) => row.followee_id);
  const candidateIds: string[] = [];

  if (followingIds.length > 0) {
    const { data, error } = await supabase
      .from('follows')
      .select('followee_id')
      .in('follower_id', followingIds)
      .eq('status', 'accepted')
      .limit(1000);
    if (error) throw error;

    const shared = new Map<string, number>();
    for (const row of data) {
      if (!excluded.has(row.followee_id)) shared.set(row.followee_id, (shared.get(row.followee_id) ?? 0) + 1);
    }
    // Capped before the visibility check below: `.in()` puts every id in
    // the request URL, and the people your friends follow can run to
    // hundreds. Fifty most-shared is far more than eight suggestions need.
    const ranked = [...shared.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([id]) => id);

    if (ranked.length > 0) {
      const { data: visible, error: visibleError } = await supabase
        .from('visits')
        .select('user_id')
        .in('user_id', ranked)
        .limit(1000);
      if (visibleError) throw visibleError;
      const readable = new Set(visible.map((row) => row.user_id));
      candidateIds.push(...ranked.filter((id) => readable.has(id)).slice(0, SUGGESTION_LIMIT));
    }
  }

  if (candidateIds.length < SUGGESTION_LIMIT) {
    const { data, error } = await supabase
      .from('visits')
      .select('user_id')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    for (const row of data) {
      if (candidateIds.length >= SUGGESTION_LIMIT) break;
      if (!excluded.has(row.user_id) && !candidateIds.includes(row.user_id)) candidateIds.push(row.user_id);
    }
  }

  if (candidateIds.length === 0) return [];

  const { data: users, error } = await supabase.from('users').select(PUBLIC_USER_COLUMNS).in('id', candidateIds);
  if (error) throw error;
  // Back into the order chosen above before ranking: rankByConnection sorts
  // by mutual count and leaves ties where it found them, and `.in()` returns
  // rows in no particular order, which would shuffle the recent posters.
  const position = new Map(candidateIds.map((id, index) => [id, index]));
  users.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
  return rankByConnection(users, myUserId);
}
