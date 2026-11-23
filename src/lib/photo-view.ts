import { getCachedUrls } from '@/lib/media-url-cache';
import { supabase } from '@/lib/supabase';

const THUMB_PREFIX = 'thumb:';
const SIGNING_BATCH_SIZE = 100;

type SignedPhoto = { photoId: string; url: string; thumbUrl: string | null };

export async function getPhotoUrls(photoIds: string[]) {
  const ids = [...new Set(photoIds)];
  if (ids.length === 0) return { photos: {}, thumbs: {} };

  const batches: Promise<Record<string, string>>[] = [];
  for (let index = 0; index < ids.length; index += SIGNING_BATCH_SIZE) {
    const cacheKeys = ids.slice(index, index + SIGNING_BATCH_SIZE)
      .flatMap((id) => [id, `${THUMB_PREFIX}${id}`]);
    batches.push(getCachedUrls('photo', cacheKeys, async (missingKeys) => {
      const missingIds = [...new Set(missingKeys.map((key) => key.startsWith(THUMB_PREFIX)
        ? key.slice(THUMB_PREFIX.length)
        : key))];
      const { data, error } = await supabase.functions.invoke('get-photo-urls', {
        body: { photoIds: missingIds },
      });
      if (error) throw error;
      return Object.fromEntries((data as { urls: SignedPhoto[] }).urls.flatMap(({ photoId, url, thumbUrl }) => [
        [photoId, url],
        [`${THUMB_PREFIX}${photoId}`, thumbUrl ?? url],
      ]));
    }));
  }

  const results = await Promise.allSettled(batches);
  const successful = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  if (successful.length === 0 && results[0].status === 'rejected') throw results[0].reason;
  const cached: Record<string, string> = Object.assign({}, ...successful);

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
