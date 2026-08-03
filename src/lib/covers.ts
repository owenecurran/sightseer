import { getCachedUrls } from '@/lib/media-url-cache';
import { supabase } from '@/lib/supabase';

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export type CoverTable = 'boards' | 'travel_books';

type UploadCoverParams = {
  table: CoverTable;
  id: string;
  uri: string;
  mimeType?: string;
};

// Same architecture as avatar upload: an Edge Function holding the R2
// secrets checks the caller owns this board/travel_book and issues a
// short-lived presigned PUT URL, the client uploads directly to R2, then
// the resulting key is recorded on the row directly (boards/travel_books
// already have owner-only UPDATE RLS policies, unlike `places`).
export async function uploadCoverPhoto(params: UploadCoverParams): Promise<string> {
  const { table, id, uri, mimeType } = params;
  const contentType = mimeType && ALLOWED_CONTENT_TYPES.includes(mimeType) ? mimeType : 'image/jpeg';

  const { data, error: fnError } = await supabase.functions.invoke('create-cover-upload-url', {
    body: { table, id, contentType },
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

  const { error: updateError } = await supabase.from(table).update({ cover_photo_r2_key: r2Key }).eq('id', id);
  if (updateError) throw updateError;

  return r2Key;
}

// Batched per table (a boards-list load may need several at once) and
// cached across calls, same convention as getAvatarViewUrls/getPhotoViewUrls.
export async function getCoverViewUrls(table: CoverTable, ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};

  return getCachedUrls(ids, async (missingIds) => {
    const { data, error } = await supabase.functions.invoke('get-cover-urls', {
      body: { table, ids: missingIds },
    });
    if (error) throw error;

    const { urls } = data as { urls: { id: string; url: string }[] };
    return Object.fromEntries(urls.map((u) => [u.id, u.url]));
  });
}
