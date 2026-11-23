import { getPhotoViewUrls } from '@/lib/photo-view';
import { uploadReviewPhotoAssets } from '@/lib/photo-upload';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import type { EditablePhoto } from '@/lib/visit-edit';
import { DRAFTS_CAP, reportIfCapped } from '@/lib/query-caps';

type DraftVisitRow = Database['public']['Tables']['draft_visits']['Row'];
type PlaceRow = Database['public']['Tables']['places']['Row'];

export type DraftListItem = {
  id: string;
  placeName: string | null; // null => "Needs a location"
  coverPhotoUrl: string | null;
  createdAt: string;
};

type RawListRow = {
  id: string;
  created_at: string;
  places: { name: string } | null;
  photos: { id: string; position: number }[];
};

export async function listMyDrafts(userId: string): Promise<DraftListItem[]> {
  const { data, error } = await supabase
    .from('draft_visits')
    .select('id, created_at, places!place_id(name), photos(id, position)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(DRAFTS_CAP);
  if (error) throw error;
  reportIfCapped('listMyDrafts', data, DRAFTS_CAP);

  const rows = data as unknown as RawListRow[];
  const coverPhotoIds = rows
    .map((row) => [...row.photos].sort((a, b) => a.position - b.position)[0]?.id)
    .filter((id): id is string => id != null);
  const urls = coverPhotoIds.length > 0 ? await getPhotoViewUrls(coverPhotoIds) : {};

  return rows.map((row) => {
    const firstPhotoId = [...row.photos].sort((a, b) => a.position - b.position)[0]?.id;
    return {
      id: row.id,
      placeName: row.places?.name ?? null,
      coverPhotoUrl: firstPhotoId ? (urls[firstPhotoId] ?? null) : null,
      createdAt: row.created_at,
    };
  });
}

export async function countMyDrafts(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('draft_visits')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) throw error;
  return count ?? 0;
}

export async function createDraft(params: {
  userId: string;
  placeId?: string | null;
  visitedOn: string;
}): Promise<DraftVisitRow> {
  const { data, error } = await supabase
    .from('draft_visits')
    .insert({ user_id: params.userId, place_id: params.placeId ?? null, visited_on: params.visitedOn })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export type DraftForEdit = {
  id: string;
  place: PlaceRow | null;
  rating: number | null;
  note: string | null;
  visitedOn: string;
  photos: EditablePhoto[];
};

type RawEditRow = {
  id: string;
  rating: number | null;
  note: string | null;
  visited_on: string;
  places: PlaceRow | null;
  photos: { id: string; position: number }[];
};

// Mirrors getVisitForEdit (visit-edit.ts) — same shape, so review-form.tsx
// can seed its draft-resume state identically to how edit-visit/[id].tsx
// already seeds from a published visit.
export async function getDraftForEdit(draftId: string, userId: string): Promise<DraftForEdit | null> {
  const { data, error } = await supabase
    .from('draft_visits')
    .select('id, rating, note, visited_on, places!place_id(*), photos(id, position)')
    .eq('id', draftId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as RawEditRow;
  const sortedPhotos = [...row.photos].sort((a, b) => a.position - b.position);
  const urls = sortedPhotos.length > 0 ? await getPhotoViewUrls(sortedPhotos.map((p) => p.id)) : {};

  return {
    id: row.id,
    place: row.places,
    rating: row.rating,
    note: row.note,
    visitedOn: row.visited_on,
    photos: sortedPhotos
      .map((p) => ({ id: p.id, position: p.position, url: urls[p.id] }))
      .filter((p): p is EditablePhoto => p.url != null),
  };
}

export async function updateDraftFields(
  draftId: string,
  fields: { placeId: string | null; rating: number | null; note: string | null; visitedOn: string }
): Promise<void> {
  const { error } = await supabase
    .from('draft_visits')
    .update({ place_id: fields.placeId, rating: fields.rating, note: fields.note, visited_on: fields.visitedOn })
    .eq('id', draftId);
  if (error) throw error;
}

export async function deleteDraft(draftId: string): Promise<void> {
  // Photos cascade via photos.draft_visit_id's ON DELETE CASCADE.
  const { error } = await supabase.from('draft_visits').delete().eq('id', draftId);
  if (error) throw error;
}

type UploadDraftPhotoParams = {
  draftId: string;
  uri: string;
  mimeType?: string;
  width: number;
  height: number;
  position?: number;
};

export async function uploadPhotoForDraft(params: UploadDraftPhotoParams): Promise<string> {
  const { draftId, position = 0 } = params;
  const { r2Key, storedThumbKey, width, height } = await uploadReviewPhotoAssets({ draftId }, params);
  const { error: insertError } = await supabase.from('photos').insert({
    draft_visit_id: draftId,
    r2_key: r2Key,
    thumb_r2_key: storedThumbKey,
    width,
    height,
    position,
  });
  if (insertError) throw insertError;

  return r2Key;
}

// The photo delete policy checks ownership through the owning draft.
export async function deleteDraftPhoto(photoId: string): Promise<void> {
  const { error } = await supabase.from('photos').delete().eq('id', photoId);
  if (error) throw error;
}

export async function publishDraft(draftId: string): Promise<string> {
  const { data, error } = await supabase.rpc('publish_draft', { draft_id: draftId });
  if (error) throw error;
  return data;
}
