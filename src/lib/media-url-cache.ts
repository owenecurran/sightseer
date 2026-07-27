// Shared in-memory cache for presigned R2 view URLs (avatars, visit photos,
// prompt photos) — every screen that shows the same photo was re-fetching
// its signed URL from scratch on every mount, which was the main
// contributor to "images load slowly" (a full Edge Function round trip +
// R2 signature per image, repeated on every navigation). Signed URLs are
// valid for 1 hour server-side; cached a bit short of that so a stale URL
// is never served.
const CACHE_TTL_MS = 50 * 60 * 1000;

type CacheEntry = { url: string; expiresAt: number };

const cache = new Map<string, CacheEntry>();

export async function getCachedUrls(
  ids: string[],
  fetchMissing: (missingIds: string[]) => Promise<Record<string, string>>
): Promise<Record<string, string>> {
  const now = Date.now();
  const result: Record<string, string> = {};
  const missing: string[] = [];

  for (const id of ids) {
    const cached = cache.get(id);
    if (cached && cached.expiresAt > now) {
      result[id] = cached.url;
    } else {
      missing.push(id);
    }
  }

  if (missing.length > 0) {
    const fetched = await fetchMissing(missing);
    const expiresAt = now + CACHE_TTL_MS;
    for (const [id, url] of Object.entries(fetched)) {
      cache.set(id, { url, expiresAt });
      result[id] = url;
    }
  }

  return result;
}
