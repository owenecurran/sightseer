import { supabase } from '@/lib/supabase';

// The viewer's own most-recent rated visit to each of the given places —
// powers the "your rating: X" overlay next to someone else's board/travel-
// book item for a place the viewer has also rated. Read-only/informational
// only, never merged into the item's own data.
export async function getOwnRatingsForPlaces(userId: string, placeIds: string[]): Promise<Record<string, number>> {
  const uniqueIds = [...new Set(placeIds)];
  if (uniqueIds.length === 0) return {};

  const { data, error } = await supabase
    .from('visits')
    .select('place_id, rating, created_at')
    .eq('user_id', userId)
    .in('place_id', uniqueIds)
    .not('rating', 'is', null)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const result: Record<string, number> = {};
  for (const row of data) {
    if (result[row.place_id] == null && row.rating != null) result[row.place_id] = row.rating;
  }
  return result;
}
