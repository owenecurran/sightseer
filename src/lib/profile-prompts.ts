import { getCachedUrls } from '@/lib/media-url-cache';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

export type AttachmentType = Database['public']['Tables']['profile_prompt_attachments']['Row']['attachment_type'];

export type PromptAttachment = {
  id: string;
  attachmentType: AttachmentType;
  textValue: string | null;
  photoR2Key: string | null;
  visitId: string | null;
  boardId: string | null;
  placeId: string | null;
  visitPlaceName: string | null;
  visitRating: number | null;
  visitNote: string | null;
  visitPhotoId: string | null;
  boardName: string | null;
  placeName: string | null;
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
  visits: {
    rating: number;
    note: string | null;
    places: { name: string } | null;
    photos: { id: string; position: number }[];
  } | null;
  boards: { name: string } | null;
  places: { name: string } | null;
};

type RawPrompt = {
  id: string;
  prompt_slug: string;
  position: number;
  profile_prompt_attachments: RawAttachment[];
};

const PROMPT_SELECT =
  'id, prompt_slug, position, profile_prompt_attachments(id, position, attachment_type, text_value, photo_r2_key, visit_id, board_id, place_id, visits(rating, note, places!place_id(name), photos(id, position)), boards(name), places!place_id(name))';

function mapAttachment(r: RawAttachment): PromptAttachment {
  const firstPhoto = [...(r.visits?.photos ?? [])].sort((a, b) => a.position - b.position)[0];
  return {
    id: r.id,
    attachmentType: r.attachment_type,
    textValue: r.text_value,
    photoR2Key: r.photo_r2_key,
    visitId: r.visit_id,
    boardId: r.board_id,
    placeId: r.place_id,
    visitPlaceName: r.visits?.places?.name ?? null,
    visitRating: r.visits?.rating ?? null,
    visitNote: r.visits?.note ?? null,
    visitPhotoId: firstPhoto?.id ?? null,
    boardName: r.boards?.name ?? null,
    placeName: r.places?.name ?? null,
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
      }))
    );
    if (insertError) throw insertError;
  }
}

export async function deletePrompt(promptId: string): Promise<void> {
  const { error } = await supabase.from('profile_prompts').delete().eq('id', promptId);
  if (error) throw error;
}

// Two independent updates, not a single atomic swap — position has no
// uniqueness constraint (see the migration), so a momentary shared value
// between these two calls is harmless for a table only its owner writes.
export async function swapPromptPositions(
  a: { id: string; position: number },
  b: { id: string; position: number }
): Promise<void> {
  const { error: errorA } = await supabase.from('profile_prompts').update({ position: b.position }).eq('id', a.id);
  if (errorA) throw errorA;
  const { error: errorB } = await supabase.from('profile_prompts').update({ position: a.position }).eq('id', b.id);
  if (errorB) throw errorB;
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
