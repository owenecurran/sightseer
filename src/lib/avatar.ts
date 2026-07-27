import { getCachedUrls } from '@/lib/media-url-cache';
import { supabase } from '@/lib/supabase';

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type UploadAvatarParams = {
  userId: string;
  uri: string;
  mimeType?: string;
};

// Same architecture as visit photo upload: an Edge Function holding the R2
// secrets issues a short-lived presigned PUT URL, the client uploads
// directly to R2, then the resulting key is recorded in Postgres.
export async function uploadAvatar(params: UploadAvatarParams): Promise<string> {
  const { userId, uri, mimeType } = params;
  const contentType = mimeType && ALLOWED_CONTENT_TYPES.includes(mimeType) ? mimeType : 'image/jpeg';

  const { data, error: fnError } = await supabase.functions.invoke('create-avatar-upload-url', {
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

  const { error: updateError } = await supabase
    .from('users')
    .update({ avatar_r2_key: r2Key })
    .eq('id', userId);
  if (updateError) throw updateError;

  return r2Key;
}

// Batched, not one call per avatar — a feed load may need many at once.
// Cached across calls (see media-url-cache).
export async function getAvatarViewUrls(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};

  return getCachedUrls(userIds, async (missingIds) => {
    const { data, error } = await supabase.functions.invoke('get-avatar-urls', {
      body: { userIds: missingIds },
    });
    if (error) throw error;

    const { urls } = data as { urls: { userId: string; url: string }[] };
    return Object.fromEntries(urls.map((u) => [u.userId, u.url]));
  });
}
