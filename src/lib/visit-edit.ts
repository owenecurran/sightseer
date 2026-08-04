import { getPhotoViewUrls } from '@/lib/photo-view';
import { supabase } from '@/lib/supabase';

export type EditablePhoto = {
  id: string;
  position: number;
  url: string;
};

export type VisitForEdit = {
  id: string;
  rating: number | null;
  note: string | null;
  visitedOn: string;
  placeName: string;
  photos: EditablePhoto[];
};

type RawRow = {
  id: string;
  rating: number | null;
  note: string | null;
  visited_on: string;
  places: { name: string } | null;
  photos: { id: string; position: number }[];
};

// RLS already restricts `visits` reads/writes to what the caller may see —
// the `.eq('user_id', userId)` filter here is extra insurance specific to
// editing (only the owner should ever land on this screen, not just anyone
// who can view the visit).
export async function getVisitForEdit(visitId: string, userId: string): Promise<VisitForEdit | null> {
  const { data, error } = await supabase
    .from('visits')
    .select('id, rating, note, visited_on, places!place_id(name), photos(id, position)')
    .eq('id', visitId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as RawRow;
  const sortedPhotos = [...row.photos].sort((a, b) => a.position - b.position);
  const urls = sortedPhotos.length > 0 ? await getPhotoViewUrls(sortedPhotos.map((p) => p.id)) : {};

  return {
    id: row.id,
    rating: row.rating,
    note: row.note,
    visitedOn: row.visited_on,
    placeName: row.places?.name ?? 'Unknown place',
    photos: sortedPhotos
      .map((p) => ({ id: p.id, position: p.position, url: urls[p.id] }))
      .filter((p): p is EditablePhoto => p.url != null),
  };
}

export async function updateVisitFields(
  visitId: string,
  fields: { rating: number | null; note: string | null; visitedOn: string }
): Promise<void> {
  const { error } = await supabase
    .from('visits')
    .update({ rating: fields.rating, note: fields.note, visited_on: fields.visitedOn })
    .eq('id', visitId);
  if (error) throw error;
}

// The existing `photos_delete_own` RLS policy already permits this — no new
// policy needed (confirmed in supabase/migrations/*rls*).
export async function deleteVisitPhoto(photoId: string): Promise<void> {
  const { error } = await supabase.from('photos').delete().eq('id', photoId);
  if (error) throw error;
}
