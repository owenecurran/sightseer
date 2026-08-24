import { getCachedUrls } from '@/lib/media-url-cache';
import { supabase } from '@/lib/supabase';

// Batched, not one call per photo: a feed screen may show many photos at
// once, and each resolution is a real network round trip + S3 signing op.
// Cached across calls (see media-url-cache) — repeat visits to the same
// photo within the cache window skip the round trip entirely.
export async function getPhotoViewUrls(photoIds: string[]): Promise<Record<string, string>> {
  if (photoIds.length === 0) return {};

  return getCachedUrls(photoIds, async (missingIds) => {
    const { data, error } = await supabase.functions.invoke('get-photo-urls', {
      body: { photoIds: missingIds },
    });
    if (error) throw error;

    const { urls } = data as { urls: { photoId: string; url: string }[] };
    return Object.fromEntries(urls.map((u) => [u.photoId, u.url]));
  });
}

// Grid-sized copies of the same photos.
//
// Cached under a prefixed key so a thumb and its full image never collide in
// the shared URL cache. Falls back to the full URL for anything uploaded
// before thumbnails existed (thumb_r2_key null), so callers can use this
// unconditionally without checking.
export async function getPhotoThumbUrls(photoIds: string[]): Promise<Record<string, string>> {
  if (photoIds.length === 0) return {};

  const cached = await getCachedUrls(
    photoIds.map((id) => `thumb:${id}`),
    async (missingKeys) => {
      const ids = missingKeys.map((key) => key.slice('thumb:'.length));
      const { data, error } = await supabase.functions.invoke('get-photo-urls', {
        body: { photoIds: ids },
      });
      if (error) throw error;

      const { urls } = data as { urls: { photoId: string; url: string; thumbUrl: string | null }[] };
      return Object.fromEntries(urls.map((u) => [`thumb:${u.photoId}`, u.thumbUrl ?? u.url]));
    }
  );

  return Object.fromEntries(
    Object.entries(cached).map(([key, url]) => [key.slice('thumb:'.length), url])
  );
}
