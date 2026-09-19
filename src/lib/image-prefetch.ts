import { Image } from 'expo-image';

// Pulling the small copies into the cache before anything asks to draw them.
//
// THUMBNAILS ONLY, and that restriction is not a matter of taste — it is the
// only thing this API can do correctly here.
//
// expo-image caches under a key, and the app deliberately overrides that key
// for full-size photographs: LoadableImage runs their source through
// stableImageSource, which strips the query string so a presigned url can
// rotate without orphaning what was already downloaded. Image.prefetch takes
// urls and a cache policy and NOTHING ELSE — there is no cacheKey on
// ImagePrefetchOptions — so a prefetched original lands under the full url
// while the card looks for it under the stripped one. It would never be
// found. Prefetching them would not speed anything up; it would download
// every photograph in the feed twice.
//
// Thumbnails have no such override — they are handed to expo-image's
// `placeholder` as a plain uri — so prefetching them under that same plain
// uri hits. That is also where the benefit is: the thumbnail is what a card
// needs in order to show itself at all.
//
// (Image.loadAsync does take a full ImageSource, cacheKey included, but it
// loads to memory and hands back a reference rather than filling the shared
// cache — holding one per photograph in a feed would pin the lot.)

// How many requests are in flight at a time.
//
// Unbounded is worse than it sounds: handing fifty urls to the platform at
// once does not make them arrive sooner, it makes all fifty contend, and the
// first one — the one a card is actually waiting on — finishes later than it
// would have alone. Six is roughly what a browser allows per host, and the
// same reasoning applies.
const CONCURRENCY = 6;

export async function prefetchThumbnails(urls: string[]): Promise<void> {
  const queue = urls.filter((url) => typeof url === 'string' && url.length > 0);
  if (queue.length === 0) return;

  const worker = async () => {
    for (;;) {
      const url = queue.shift();
      if (url == null) return;
      try {
        await Image.prefetch(url, { cachePolicy: 'memory-disk' });
      } catch {
        // One unreachable thumbnail is not a reason to stop warming the rest.
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
}
