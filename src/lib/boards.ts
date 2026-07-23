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
