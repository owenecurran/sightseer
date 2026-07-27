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
