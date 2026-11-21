import { getCachedUrls } from '@/lib/media-url-cache';
import { supabase } from '@/lib/supabase';

const THUMB_PREFIX = 'thumb:';
const SIGNING_BATCH_SIZE = 100;

type SignedPhoto = { photoId: string; url: string; thumbUrl: string | null };

export async function getPhotoUrls(photoIds: string[]) {
  const ids = [...new Set(photoIds)];
  if (ids.length === 0) return { photos: {}, thumbs: {} };

  const cached = await getCachedUrls('photo', ids.flatMap((id) => [id, `${THUMB_PREFIX}${id}`]), async (missingKeys) => {
    const missingIds = [...new Set(missingKeys.map((key) => key.startsWith(THUMB_PREFIX)
      ? key.slice(THUMB_PREFIX.length)
      : key))];
    const batches = [];
    for (let index = 0; index < missingIds.length; index += SIGNING_BATCH_SIZE) {
      batches.push(missingIds.slice(index, index + SIGNING_BATCH_SIZE));
    }
    const rows = await Promise.all(batches.map(async (batch) => {
      const { data, error } = await supabase.functions.invoke('get-photo-urls', {
        body: { photoIds: batch },
      });
      if (error) throw error;
      return (data as { urls: SignedPhoto[] }).urls;
    }));

    return Object.fromEntries(rows.flat().flatMap(({ photoId, url, thumbUrl }) => [
      [photoId, url],
      [`${THUMB_PREFIX}${photoId}`, thumbUrl ?? url],
    ]));
  });

  const photos: Record<string, string> = {};
  const thumbs: Record<string, string> = {};
  for (const id of ids) {
    if (cached[id]) photos[id] = cached[id];
    const thumb = cached[`${THUMB_PREFIX}${id}`];
    if (thumb) thumbs[id] = thumb;
  }
  return { photos, thumbs };
}

export async function getPhotoViewUrls(photoIds: string[]): Promise<Record<string, string>> {
  return (await getPhotoUrls(photoIds)).photos;
}

// Older photos fall back to the original when they have no derivative.
export async function getPhotoThumbUrls(photoIds: string[]): Promise<Record<string, string>> {
  return (await getPhotoUrls(photoIds)).thumbs;
}
