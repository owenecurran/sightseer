import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type BoardRow = Database['public']['Tables']['boards']['Row'];
type TravelBookRow = Database['public']['Tables']['travel_books']['Row'];

export type SavedBoard = { board: BoardRow; notifyOnNewItems: boolean };
export type SavedTravelBook = { travelBook: TravelBookRow; notifyOnNewItems: boolean };

export async function listSavedBoards(userId: string): Promise<SavedBoard[]> {
  const { data, error } = await supabase
    .from('saved_boards')
    .select('notify_on_new_items, boards!board_id(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  type Row = { notify_on_new_items: boolean; boards: BoardRow | null };
  return (data as unknown as Row[])
    .filter((row): row is Row & { boards: BoardRow } => row.boards != null)
    .map((row) => ({ board: row.boards, notifyOnNewItems: row.notify_on_new_items }));
}

export async function listSavedTravelBooks(userId: string): Promise<SavedTravelBook[]> {
  const { data, error } = await supabase
    .from('saved_travel_books')
    .select('notify_on_new_items, travel_books!travel_book_id(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  type Row = { notify_on_new_items: boolean; travel_books: TravelBookRow | null };
  return (data as unknown as Row[])
    .filter((row): row is Row & { travel_books: TravelBookRow } => row.travel_books != null)
    .map((row) => ({ travelBook: row.travel_books, notifyOnNewItems: row.notify_on_new_items }));
}

export async function getSavedBoardState(userId: string, boardId: string): Promise<{ notifyOnNewItems: boolean } | null> {
  const { data, error } = await supabase
    .from('saved_boards')
    .select('notify_on_new_items')
    .eq('user_id', userId)
    .eq('board_id', boardId)
    .maybeSingle();
  if (error) throw error;
  return data ? { notifyOnNewItems: data.notify_on_new_items } : null;
}

export async function getSavedTravelBookState(
  userId: string,
  travelBookId: string
): Promise<{ notifyOnNewItems: boolean } | null> {
  const { data, error } = await supabase
    .from('saved_travel_books')
    .select('notify_on_new_items')
    .eq('user_id', userId)
    .eq('travel_book_id', travelBookId)
    .maybeSingle();
  if (error) throw error;
  return data ? { notifyOnNewItems: data.notify_on_new_items } : null;
}

export async function saveBoardForUpdates(userId: string, boardId: string, notify: boolean): Promise<void> {
  const { error } = await supabase
    .from('saved_boards')
    .insert({ user_id: userId, board_id: boardId, notify_on_new_items: notify });
  if (error) throw error;
}

export async function unsaveBoardForUpdates(userId: string, boardId: string): Promise<void> {
  const { error } = await supabase.from('saved_boards').delete().eq('user_id', userId).eq('board_id', boardId);
  if (error) throw error;
}

export async function setSavedBoardNotify(userId: string, boardId: string, notify: boolean): Promise<void> {
  const { error } = await supabase
    .from('saved_boards')
    .update({ notify_on_new_items: notify })
    .eq('user_id', userId)
    .eq('board_id', boardId);
  if (error) throw error;
}

export async function saveTravelBookForUpdates(userId: string, travelBookId: string, notify: boolean): Promise<void> {
  const { error } = await supabase
    .from('saved_travel_books')
    .insert({ user_id: userId, travel_book_id: travelBookId, notify_on_new_items: notify });
  if (error) throw error;
}

export async function unsaveTravelBookForUpdates(userId: string, travelBookId: string): Promise<void> {
  const { error } = await supabase
    .from('saved_travel_books')
    .delete()
    .eq('user_id', userId)
    .eq('travel_book_id', travelBookId);
  if (error) throw error;
}

export async function setSavedTravelBookNotify(userId: string, travelBookId: string, notify: boolean): Promise<void> {
  const { error } = await supabase
    .from('saved_travel_books')
    .update({ notify_on_new_items: notify })
    .eq('user_id', userId)
    .eq('travel_book_id', travelBookId);
  if (error) throw error;
}
