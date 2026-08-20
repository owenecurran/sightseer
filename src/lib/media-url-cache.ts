import AsyncStorage from '@react-native-async-storage/async-storage';

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

// Persisted across launches, not just across screens. In-memory alone meant
// every cold start re-signed every URL before a single image could render —
// and since expo-image keys its disk cache on the URL path (see
// image-cache.ts), the bytes were usually already on disk, waiting on a
// round trip that only existed to rediscover the address. Restoring the map
// first means a cold start paints from disk immediately.
const STORAGE_KEY = 'media-url-cache-v1';
let hydrated = false;
let hydrating: Promise<void> | null = null;

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (!hydrating) {
    hydrating = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const now = Date.now();
          for (const [id, entry] of Object.entries(JSON.parse(raw) as Record<string, CacheEntry>)) {
            // Expired entries are dropped rather than restored — a stale
            // signed URL 403s, which is worse than a round trip.
            if (entry.expiresAt > now) cache.set(id, entry);
          }
        }
      } catch {
        // A corrupt or unreadable cache is not worth failing a screen over.
      } finally {
        hydrated = true;
      }
    })();
  }
  return hydrating;
}

// Debounced: a feed load resolves many ids in quick succession, and writing
// the whole map per batch would thrash storage on the main path.
let flushTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(cache))).catch(() => {});
  }, 1000);
}

export async function getCachedUrls(
  ids: string[],
  fetchMissing: (missingIds: string[]) => Promise<Record<string, string>>
): Promise<Record<string, string>> {
  await hydrate();
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
    scheduleFlush();
  }

  return result;
}
