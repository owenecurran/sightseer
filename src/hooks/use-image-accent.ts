import { useImage } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';

import { accentFromImage, type ImageAccent } from '@/lib/image-accent';

// Results, by url. A feed recycles rows constantly and the answer for a given
// picture never changes, so without this the same photograph is decoded and
// sampled again every time it scrolls back into view — and worse, the name
// visibly re-colours each time as the new read lands.
//
// Module-level and unbounded on purpose: the entries are one short string
// each, and the set is bounded in practice by how many photographs a person
// scrolls past in one sitting.
const cache = new Map<string, ImageAccent | null>();

// The colour to letter a review's name in, read from its own picture.
//
// Sampled on device rather than stored on the photo when it is uploaded. That
// would be cheaper at render — one column, read with the row — but it would
// only ever apply to photographs uploaded after it shipped, and every existing
// review would keep a hardcoded colour forever. Doing it here covers the whole
// feed from the first run.
//
// Returns null while it is working and for any picture with no colour worth
// taking; the caller keeps its own variant colour in both cases.
export function useImageAccent(url: string | undefined): ImageAccent | null {
  const cached = url != null ? cache.get(url) : undefined;

  // Skia decodes it; expo-image has already fetched the same url, so this is a
  // decode rather than a download. Skipped entirely once the answer is known.
  const image = useImage(cached === undefined && url != null ? url : null);

  // Derived during render rather than pushed into state from an effect. The
  // sampling is synchronous, so state would only be a copy of something
  // already computable — and setting it from an effect makes every picture
  // render twice, which the compiler's lint calls out as a cascading render.
  const sampled = useMemo(() => (image == null ? null : accentFromImage(image)), [image]);

  // Writing the cache is the one thing that genuinely is a side effect, so it
  // happens after the render that produced the value rather than during it.
  useEffect(() => {
    if (url == null || cached !== undefined || image == null) return;
    cache.set(url, sampled);
  }, [url, cached, image, sampled]);

  return cached ?? sampled;
}
