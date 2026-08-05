import { supabase } from '@/lib/supabase';

export type CollectionStats = { avgRating: number | null; saveCount: number };

// Thin wrapper around get_collection_stats — one batched RPC call for both
// mean item-rating and save count across a whole screen's worth of
// boards/travel books, rather than N calls.
export async function getCollectionStats(
  boardIds: string[],
  travelBookIds: string[]
): Promise<{ boards: Record<string, CollectionStats>; travelBooks: Record<string, CollectionStats> }> {
  if (boardIds.length === 0 && travelBookIds.length === 0) return { boards: {}, travelBooks: {} };

  const { data, error } = await supabase.rpc('get_collection_stats', {
    board_ids: boardIds,
    travel_book_ids: travelBookIds,
  });
  if (error) throw error;

  const boards: Record<string, CollectionStats> = {};
  const travelBooks: Record<string, CollectionStats> = {};
  for (const row of data) {
    const stats: CollectionStats = {
      avgRating: row.avg_rating != null ? Number(row.avg_rating) : null,
      saveCount: Number(row.save_count),
    };
    if (row.collection_type === 'board') boards[row.collection_id] = stats;
    else travelBooks[row.collection_id] = stats;
  }
  return { boards, travelBooks };
}
