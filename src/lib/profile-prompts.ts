import { getCachedUrls } from '@/lib/media-url-cache';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

export type AttachmentType = Database['public']['Tables']['profile_prompt_attachments']['Row']['attachment_type'];

// 'board'/'travel_book' attachments choose between showing one featured
// photo (cover) or a small album grid of up to 4 (grid) — see
// 20260808110000_prompt_cover_photos.sql. 'place' only ever gets a cover
// (no grid option was asked for there).
export type AttachmentDisplayMode = 'cover' | 'grid';

export type PromptAttachment = {
  id: string;
  attachmentType: AttachmentType;
  textValue: string | null;
  photoR2Key: string | null;
  visitId: string | null;
  boardId: string | null;
  placeId: string | null;
  travelBookId: string | null;
  visitPlaceName: string | null;
  visitRating: number | null;
  visitNote: string | null;
  // Resolved display photo: the explicit visit_photo_id override if one was
  // chosen, else the visit's first photo by position — preserves today's
  // default for every attachment saved before this choice existed.
  visitPhotoId: string | null;
  boardName: string | null;
  placeName: string | null;
  travelBookName: string | null;
  // 'place': the single chosen cover photo, picked from that place's own
  // reviews. 'board'/'travel_book': the single chosen cover photo when
  // displayMode is 'cover' (or unset, the default).
  coverPhotoId: string | null;
  // 'board'/'travel_book' only.
  displayMode: AttachmentDisplayMode | null;
  // 'board'/'travel_book' in 'grid' mode: up to 4 chosen photos.
  gridPhotoIds: string[];
};

export type ProfilePrompt = {
  id: string;
  promptSlug: string;
  position: number;
  attachments: PromptAttachment[];
};

type RawAttachment = {
  id: string;
  position: number;
  attachment_type: AttachmentType;
  text_value: string | null;
  photo_r2_key: string | null;
  visit_id: string | null;
  board_id: string | null;
  place_id: string | null;
  travel_book_id: string | null;
  visit_photo_id: string | null;
  cover_photo_id: string | null;
  display_mode: string | null;
  grid_photo_ids: string[] | null;
  visits: {
    rating: number | null;
    note: string | null;
    places: { name: string } | null;
    photos: { id: string; position: number }[];
  } | null;
  boards: { name: string } | null;
  places: { name: string } | null;
  travel_books: { title: string } | null;
};

type RawPrompt = {
  id: string;
  prompt_slug: string;
  position: number;
  profile_prompt_attachments: RawAttachment[];
};

const PROMPT_SELECT =
  'id, prompt_slug, position, profile_prompt_attachments(id, position, attachment_type, text_value, photo_r2_key, visit_id, board_id, place_id, travel_book_id, visit_photo_id, cover_photo_id, display_mode, grid_photo_ids, visits(rating, note, places!place_id(name), photos(id, position)), boards(name), places!place_id(name), travel_books(title))';

function mapAttachment(r: RawAttachment): PromptAttachment {
  const photos = [...(r.visits?.photos ?? [])].sort((a, b) => a.position - b.position);
  const explicitPhoto = r.visit_photo_id ? photos.find((p) => p.id === r.visit_photo_id) : undefined;
  return {
    id: r.id,
    attachmentType: r.attachment_type,
    textValue: r.text_value,
    photoR2Key: r.photo_r2_key,
    visitId: r.visit_id,
    boardId: r.board_id,
    placeId: r.place_id,
    travelBookId: r.travel_book_id,
    visitPlaceName: r.visits?.places?.name ?? null,
    visitRating: r.visits?.rating ?? null,
    visitNote: r.visits?.note ?? null,
    visitPhotoId: (explicitPhoto ?? photos[0])?.id ?? null,
    boardName: r.boards?.name ?? null,
    placeName: r.places?.name ?? null,
    travelBookName: r.travel_books?.title ?? null,
    coverPhotoId: r.cover_photo_id,
    displayMode: r.display_mode === 'grid' ? 'grid' : r.display_mode === 'cover' ? 'cover' : null,
    gridPhotoIds: r.grid_photo_ids ?? [],
  };
}

export async function listPrompts(userId: string): Promise<ProfilePrompt[]> {
  const { data, error } = await supabase
    .from('profile_prompts')
    .select(PROMPT_SELECT)
    .eq('user_id', userId)
    .order('position', { ascending: true });
  if (error) throw error;

  return (data as unknown as RawPrompt[]).map((r) => ({
    id: r.id,
    promptSlug: r.prompt_slug,
    position: r.position,
    attachments: [...r.profile_prompt_attachments].sort((a, b) => a.position - b.position).map(mapAttachment),
  }));
}

export type AttachmentInput = {
  attachmentType: AttachmentType;
  textValue?: string | null;
  photoR2Key?: string | null;
  visitId?: string | null;
  boardId?: string | null;
  placeId?: string | null;
  travelBookId?: string | null;
  // 'review' only — an explicit choice of which of the visit's photos to
  // feature; null falls back to the first photo by position.
  visitPhotoId?: string | null;
  // 'place': the chosen cover photo. 'board'/'travel_book': the chosen
  // cover photo when displayMode is 'cover'.
  coverPhotoId?: string | null;
  // 'board'/'travel_book' only.
  displayMode?: AttachmentDisplayMode | null;
  // 'board'/'travel_book' in 'grid' mode: up to 4 chosen photos.
  gridPhotoIds?: string[] | null;
};

type SavePromptParams = {
  id?: string;
  userId: string;
  promptSlug: string;
  position: number;
  attachments: AttachmentInput[];
};

// Full-replace on save (delete all attachments for this prompt, then
// re-insert the current list) rather than diffing individual rows —
// simpler and safe enough for a table only its own owner ever writes.
export async function savePrompt(params: SavePromptParams): Promise<void> {
  let promptId = params.id;

  if (promptId) {
    const { error } = await supabase
      .from('profile_prompts')
      .update({ prompt_slug: params.promptSlug, position: params.position })
      .eq('id', promptId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from('profile_prompts')
      .insert({ user_id: params.userId, prompt_slug: params.promptSlug, position: params.position })
      .select('id')
      .single();
    if (error) throw error;
    promptId = data.id;
  }

  const { error: deleteError } = await supabase
    .from('profile_prompt_attachments')
    .delete()
    .eq('prompt_id', promptId);
  if (deleteError) throw deleteError;

  if (params.attachments.length > 0) {
    const { error: insertError } = await supabase.from('profile_prompt_attachments').insert(
      params.attachments.map((a, index) => ({
        prompt_id: promptId,
        position: index,
        attachment_type: a.attachmentType,
        text_value: a.textValue ?? null,
        photo_r2_key: a.photoR2Key ?? null,
        visit_id: a.visitId ?? null,
        board_id: a.boardId ?? null,
        place_id: a.placeId ?? null,
        travel_book_id: a.travelBookId ?? null,
        visit_photo_id: a.visitPhotoId ?? null,
        cover_photo_id: a.coverPhotoId ?? null,
        display_mode: a.displayMode ?? null,
        grid_photo_ids: a.gridPhotoIds && a.gridPhotoIds.length > 0 ? a.gridPhotoIds : null,
      }))
    );
    if (insertError) throw insertError;
  }
}

export async function deletePrompt(promptId: string): Promise<void> {
  const { error } = await supabase.from('profile_prompts').delete().eq('id', promptId);
  if (error) throw error;
}

// Called after a drag-and-drop reorder with the prompts' full new order —
// position has no uniqueness constraint (see the migration), so writing
// every row's index independently (not a single atomic statement) is
// harmless for a table only its owner ever writes.
export async function reorderPrompts(orderedIds: string[]): Promise<void> {
  for (let position = 0; position < orderedIds.length; position++) {
    const { error } = await supabase.from('profile_prompts').update({ position }).eq('id', orderedIds[position]);
    if (error) throw error;
  }
}

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function uploadPromptPhoto(uri: string, mimeType?: string): Promise<string> {
  const contentType = mimeType && ALLOWED_CONTENT_TYPES.includes(mimeType) ? mimeType : 'image/jpeg';

  const { data, error: fnError } = await supabase.functions.invoke('create-prompt-photo-upload-url', {
    body: { contentType },
  });
  if (fnError) throw fnError;
  const { uploadUrl, r2Key } = data as { uploadUrl: string; r2Key: string };

  const fileResponse = await fetch(uri);
  const blob = await fileResponse.blob();

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Upload to storage failed (${uploadResponse.status})`);
  }

  return r2Key;
}

export async function getPromptPhotoUrls(attachmentIds: string[]): Promise<Record<string, string>> {
  if (attachmentIds.length === 0) return {};

  return getCachedUrls(attachmentIds, async (missingIds) => {
    const { data, error } = await supabase.functions.invoke('get-prompt-photo-urls', {
      body: { attachmentIds: missingIds },
    });
    if (error) throw error;

    const { urls } = data as { urls: { attachmentId: string; url: string }[] };
    return Object.fromEntries(urls.map((u) => [u.attachmentId, u.url]));
  });
}

export type VisitPhotoOption = { id: string; url: string };

// Powers the "which photo?" picker in prompt-editor.tsx once a review has
// been picked for a 'review' attachment — separate from the read path's
// PROMPT_SELECT join since that only ever covers a visit already attached
// to an existing prompt, not an arbitrary one just picked in the editor.
export async function getVisitPhotoOptions(visitId: string): Promise<VisitPhotoOption[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('id, position')
    .eq('visit_id', visitId)
    .order('position');
  if (error) throw error;
  if (data.length === 0) return [];

  const urls = await getPhotoViewUrls(data.map((p) => p.id));
  return data.map((p) => ({ id: p.id, url: urls[p.id] })).filter((p): p is VisitPhotoOption => p.url != null);
}

async function resolvePhotoOptions(photoIds: string[]): Promise<VisitPhotoOption[]> {
  if (photoIds.length === 0) return [];
  const urls = await getPhotoViewUrls(photoIds);
  return photoIds.map((id) => ({ id, url: urls[id] })).filter((p): p is VisitPhotoOption => p.url != null);
}

// Powers the cover-photo picker for a 'place' attachment — every photo on
// every review of this place the caller can see (photos_select RLS governs
// visibility the same as anywhere else), not just the caller's own reviews.
export async function getPlacePhotoOptions(placeId: string): Promise<VisitPhotoOption[]> {
  const { data, error } = await supabase.from('visits').select('photos(id, position)').eq('place_id', placeId);
  if (error) throw error;

  const photoIds = (data ?? [])
    .flatMap((v) => [...v.photos].sort((a, b) => a.position - b.position))
    .map((p) => p.id);
  return resolvePhotoOptions(photoIds);
}

type BoardItemPhotoRow = {
  item_type: 'visit' | 'photo' | 'place';
  photo_id: string | null;
  visits: { photos: { id: string; position: number }[] } | null;
};

// Powers the cover/grid photo picker for a 'board' attachment — every photo
// already saved to the board, either directly ('photo' items) or via a
// saved review's own photos ('visit' items); 'place' items have no photo.
export async function getBoardPhotoOptions(boardId: string): Promise<VisitPhotoOption[]> {
  const { data, error } = await supabase
    .from('board_items')
    .select('item_type, photo_id, visits(photos(id, position))')
    .eq('board_id', boardId)
    .in('item_type', ['visit', 'photo']);
  if (error) throw error;

  const rows = data as unknown as BoardItemPhotoRow[];
  const photoIds: string[] = [];
  for (const row of rows) {
    if (row.item_type === 'photo' && row.photo_id) {
      photoIds.push(row.photo_id);
    } else if (row.item_type === 'visit' && row.visits) {
      for (const p of [...row.visits.photos].sort((a, b) => a.position - b.position)) photoIds.push(p.id);
    }
  }
  return resolvePhotoOptions(photoIds);
}

// Powers the cover/grid photo picker for a 'travel_book' attachment — every
// photo on every review saved in the book (travel_book_items is always
// visit-backed, unlike board_items).
export async function getTravelBookPhotoOptions(travelBookId: string): Promise<VisitPhotoOption[]> {
  const { data, error } = await supabase
    .from('travel_book_items')
    .select('visits(photos(id, position))')
    .eq('travel_book_id', travelBookId);
  if (error) throw error;

  const photoIds = (data ?? [])
    .flatMap((row) => [...(row.visits?.photos ?? [])].sort((a, b) => a.position - b.position))
    .map((p) => p.id);
  return resolvePhotoOptions(photoIds);
}
