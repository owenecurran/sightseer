import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_TTL_MS = 50 * 60 * 1000;
const MAX_ENTRIES = 2000;
const LEGACY_STORAGE_KEY = 'media-url-cache-v1';

type CacheEntry = { url: string; expiresAt: number };
type ViewerCache = {
  viewerId: string;
  storageKey: string;
  entries: Map<string, CacheEntry>;
  pending: Map<string, Promise<string | undefined>>;
  hydration?: Promise<void>;
  flushTimer?: ReturnType<typeof setTimeout>;
};

let active: ViewerCache | undefined;
let removedLegacyCache = false;

export function setMediaCacheViewer(viewerId: string | undefined) {
  if (!removedLegacyCache) {
    removedLegacyCache = true;
    void AsyncStorage.removeItem(LEGACY_STORAGE_KEY).catch(() => {});
  }
  if (active?.viewerId === viewerId) return;

  if (active) {
    if (active.flushTimer) clearTimeout(active.flushTimer);
    void AsyncStorage.removeItem(active.storageKey).catch(() => {});
  }

  active = viewerId ? {
    viewerId,
    storageKey: `media-url-cache-v2:${viewerId}`,
    entries: new Map(),
    pending: new Map(),
  } : undefined;
}

function hydrate(cache: ViewerCache) {
  cache.hydration ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(cache.storageKey);
      if (!raw || active !== cache) return;
      const now = Date.now();
      for (const [id, entry] of Object.entries(JSON.parse(raw) as Record<string, CacheEntry>)) {
        if (entry.expiresAt > now) cache.entries.set(id, entry);
      }
    } catch {
      // A corrupt or unreadable cache can be rebuilt from the signer.
    }
  })();
  return cache.hydration;
}

async function flush(cache: ViewerCache) {
  if (active !== cache) return;
  if (cache.flushTimer !== undefined) clearTimeout(cache.flushTimer);
  cache.flushTimer = undefined;
  const now = Date.now();
  for (const [id, entry] of cache.entries) {
    if (entry.expiresAt <= now || cache.entries.size > MAX_ENTRIES) cache.entries.delete(id);
  }
  await AsyncStorage.setItem(cache.storageKey, JSON.stringify(Object.fromEntries(cache.entries))).catch(() => {});
}

function scheduleFlush(cache: ViewerCache) {
  if (cache.flushTimer !== undefined) clearTimeout(cache.flushTimer);
  cache.flushTimer = setTimeout(() => { void flush(cache); }, 1000);
}

export async function invalidateCachedUrl(namespace: string, id: string) {
  const cache = active;
  if (!cache) return;
  await hydrate(cache);
  if (active !== cache) return;
  const key = `${namespace}:${id}`;
  cache.pending.delete(key);
  if (cache.entries.delete(key)) await flush(cache);
}

export async function getCachedUrls(
  namespace: string,
  ids: string[],
  fetchMissing: (missingIds: string[]) => Promise<Record<string, string>>,
): Promise<Record<string, string>> {
  const cache = active;
  if (!cache || ids.length === 0) return {};
  await hydrate(cache);
  if (active !== cache) return {};

  const result: Record<string, string> = {};
  const missing: string[] = [];
  const waiting: Promise<void>[] = [];
  const now = Date.now();

  for (const id of new Set(ids)) {
    const key = `${namespace}:${id}`;
    const entry = cache.entries.get(key);
    const pending = cache.pending.get(key);
    if (entry && entry.expiresAt > now) result[id] = entry.url;
    else if (pending) waiting.push(pending.then((url) => { if (url) result[id] = url; }));
    else missing.push(id);
  }

  if (missing.length > 0) {
    const requests = new Map<string, Promise<string | undefined>>();
    const batch = fetchMissing(missing).then((urls) => {
      if (active !== cache) return {};
      const expiresAt = Date.now() + CACHE_TTL_MS;
      const currentUrls: Record<string, string> = {};
      for (const [id, pending] of requests) {
        const key = `${namespace}:${id}`;
        const url = urls[id];
        if (!url || cache.pending.get(key) !== pending) continue;
        cache.entries.delete(key);
        cache.entries.set(key, { url, expiresAt });
        currentUrls[id] = url;
      }
      if (Object.keys(currentUrls).length) scheduleFlush(cache);
      return currentUrls;
    }).finally(() => {
      for (const [id, pending] of requests) {
        const key = `${namespace}:${id}`;
        if (cache.pending.get(key) === pending) cache.pending.delete(key);
      }
    });

    for (const id of missing) {
      const pending = batch.then((urls) => urls[id]);
      requests.set(id, pending);
      cache.pending.set(`${namespace}:${id}`, pending);
      waiting.push(pending.then((url) => { if (url) result[id] = url; }));
    }
  }

  await Promise.all(waiting);
  return active === cache ? result : {};
}
