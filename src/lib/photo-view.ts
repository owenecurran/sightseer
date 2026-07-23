import { supabase } from '@/lib/supabase';

// Batched, not one call per photo: a feed screen may show many photos at
// once, and each resolution is a real network round trip + S3 signing op.
export async function getPhotoViewUrls(photoIds: string[]): Promise<Record<string, string>> {
  if (photoIds.length === 0) return {};

  const { data, error } = await supabase.functions.invoke('get-photo-urls', {
    body: { photoIds },
  });
  if (error) throw error;

  const { urls } = data as { urls: { photoId: string; url: string }[] };
  return Object.fromEntries(urls.map((u) => [u.photoId, u.url]));
}
