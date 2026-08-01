import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type BoardRow = Database['public']['Tables']['boards']['Row'];

export async function listMyBoards(userId: string): Promise<BoardRow[]> {
  const { data, error } = await supabase
    .from('boards')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createBoard(params: {
  userId: string;
  name: string;
  isPrivate?: boolean;
}): Promise<BoardRow> {
  const { data, error } = await supabase
    .from('boards')
    .insert({ user_id: params.userId, name: params.name, is_private: params.isPrivate ?? false })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Which of the given board ids already contain this visit — used to render
// save/saved state per board. Takes board ids rather than a user id so
// callers reuse the board list they already fetched instead of a second join.
export async function getBoardIdsContainingVisit(
  boardIds: string[],
  visitId: string
): Promise<Set<string>> {
  if (boardIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('board_items')
    .select('board_id')
    .eq('visit_id', visitId)
    .in('board_id', boardIds);
  if (error) throw error;
  return new Set(data.map((row) => row.board_id));
}

export async function saveVisitToBoard(boardId: string, visitId: string): Promise<void> {
  const { error } = await supabase
    .from('board_items')
    .insert({ board_id: boardId, item_type: 'visit', visit_id: visitId });
  if (error) throw error;
}

export async function removeVisitFromBoard(boardId: string, visitId: string): Promise<void> {
  const { error } = await supabase
    .from('board_items')
    .delete()
    .eq('board_id', boardId)
    .eq('visit_id', visitId);
  if (error) throw error;
}

type LatestPhotoRow = {
  board_id: string;
  added_at: string;
  visits: { photos: { id: string; position: number }[] } | null;
};

// "Most recently added" = most recent board_items.added_at (when it was
// saved to *this* board), not the underlying visit's own date — powers the
// boards list row thumbnail.
export async function getLatestReviewPhotoIds(boardIds: string[]): Promise<Record<string, string>> {
  if (boardIds.length === 0) return {};
  const { data, error } = await supabase
    .from('board_items')
    .select('board_id, added_at, visits(photos(id, position))')
    .in('board_id', boardIds)
    .eq('item_type', 'visit')
    .order('added_at', { ascending: false });
  if (error) throw error;

  const result: Record<string, string> = {};
  for (const row of data as unknown as LatestPhotoRow[]) {
    if (result[row.board_id]) continue; // already-seen board_id wins (sorted desc)
    const firstPhoto = [...(row.visits?.photos ?? [])].sort((a, b) => a.position - b.position)[0];
    if (firstPhoto) result[row.board_id] = firstPhoto.id;
  }
  return result;
}

export type BoardVisitItem = {
  id: string;
  visitId: string;
  addedAt: string;
  rating: number;
  note: string | null;
  visitedOn: string;
  authorId: string;
  authorName: string;
  placeName: string;
  placeLat: number | null;
  placeLng: number | null;
  photoIds: string[];
};

type BoardItemRow = {
  id: string;
  visit_id: string;
  added_at: string;
  visits: {
    rating: number;
    note: string | null;
    visited_on: string;
    user_id: string;
    users: { handle: string | null; name: string | null } | null;
    places: { name: string; lat: number | null; lng: number | null } | null;
    photos: { id: string; position: number }[];
  } | null;
};

// Feeds all 4 board-detail view modes — replaces the inline query that used
// to live directly in board/[id].tsx.
export async function getBoardItems(boardId: string): Promise<BoardVisitItem[]> {
  const { data, error } = await supabase
    .from('board_items')
    .select(
      'id, visit_id, added_at, visits(rating, note, visited_on, user_id, users!user_id(handle, name), places!place_id(name, lat, lng), photos(id, position))'
    )
    .eq('board_id', boardId)
    .eq('item_type', 'visit')
    .order('position');
  if (error) throw error;

  const rows = data as unknown as BoardItemRow[];
  return rows
    .filter((row): row is BoardItemRow & { visits: NonNullable<BoardItemRow['visits']> } => row.visits != null)
    .map((row) => ({
      id: row.id,
      visitId: row.visit_id,
      addedAt: row.added_at,
      rating: row.visits.rating,
      note: row.visits.note,
      visitedOn: row.visits.visited_on,
      authorId: row.visits.user_id,
      authorName: row.visits.users?.name ?? row.visits.users?.handle ?? 'Someone',
      placeName: row.visits.places?.name ?? 'Unknown place',
      placeLat: row.visits.places?.lat ?? null,
      placeLng: row.visits.places?.lng ?? null,
      photoIds: [...row.visits.photos].sort((a, b) => a.position - b.position).map((p) => p.id),
    }));
}
