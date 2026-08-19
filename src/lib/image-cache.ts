// Presigned R2 URLs rotate: the in-memory URL cache clears on app restart
// and re-signs after 50 minutes, and every re-sign changes the query string.
// expo-image keys its disk cache on the full URL by default, so each
// rotation re-downloaded every image — full-resolution originals, again —
// which was the single biggest contributor to "images feel slow". The R2
// object PATH is stable and content-immutable (photo/avatar keys are
// generated fresh per upload, objects are never rewritten in place), so it
// is the correct cache identity; only the signature moves.
export function stableImageSource(uri: string | null | undefined) {
  if (!uri) return undefined;
  return { uri, cacheKey: uri.split('?')[0] };
}
