// The "state, country" line that sits under a place's name.
//
// Suppressed when it only repeats the name. A country-level place carries
// itself as its own region, so Madagascar rendered as the headline
// MADAGASCAR with "Madagascar" set directly beneath it — and on the feed
// card's written side, as "Madagascar" twice in a four-line address block.
// Comparison is case- and space-insensitive because the two strings come
// from different fields of the cached place and are not guaranteed to be
// byte-identical.
export function regionLabel(
  placeName: string | null | undefined,
  stateCountry: string | null | undefined,
): string | null {
  if (!stateCountry) return null;
  if (!placeName) return stateCountry;
  const normalize = (value: string) => value.trim().toLowerCase();
  return normalize(stateCountry) === normalize(placeName) ? null : stateCountry;
}
