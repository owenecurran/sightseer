// A map of where a review happened, used as its image when the author
// posted none.
//
// A Mapbox static image rather than a photo from the Places API, for two
// reasons. Google's Maps Platform terms do not allow storing or caching
// place photos (place IDs are the documented exception, photos are not), so
// every render would have to be a fresh billed request, on top of moving
// Place Details into a higher SKU by asking for the photos field at all. A
// feed of photoless reviews would bill per card per scroll.
//
// This costs nothing extra: Mapbox is already a dependency with a token in
// the environment, the URL is built on device, expo-image caches it, and
// nothing is stored anywhere. It is also the more honest image — the actual
// location, rather than a stock photograph that implies someone took it.
//
// The same static endpoint trip-map-square.tsx already uses, deliberately
// not shared with it: that one frames a set of pins for a whole trip and
// carries its own percentile logic, this one centres a single place. The
// only real overlap is the URL shape.

// Satellite, deliberately NOT the dark-v10 vector style trip-map-square.tsx
// uses. That style is right for a 72px trip square, where the map is
// texture; at card width standing in for a photo it is a near-black
// rectangle. Checked against the real endpoint: the Golden Gate Bridge in
// dark-v10 is a grey line on black, and in satellite it is the bay, the
// headland and the bridge in orange — an image of somewhere, which is what
// this slot is for.
const STATIC_STYLE = 'mapbox/satellite-streets-v12';

// Mapbox rejects requests over 1280 in either dimension, and the @2x
// suffix doubles the delivered pixels, so the requested box has to stay at
// or under half the limit.
const MAX_REQUEST_DIMENSION = 640;

// Retina via the suffix rather than by asking for twice the pixels: @2x
// renders labels at the right size for the layout box, where doubling the
// requested dimensions would deliver the same pixel count with every road
// name at half size. trip-map-square.tsx does the same.
const RETINA = '@2x';

// How far out to sit for each kind of place. A review is usually attached
// to a POI, but a place page's own reviews can be a city, a country or a
// whole continent, and one zoom cannot serve all of them: a country at a
// POI's zoom is a field, a POI at a country's is an empty map.
//
// These sit roughly a step and a half wider than "fills the frame". Framing
// a place so it fills the image answers "what shape is it" and not "where is
// it" — Madagascar at 3.5 was an island in an empty ocean, which could have
// been anywhere. Pulled out, the mainland it sits off is in shot and the
// picture finally places it. The pin below is what keeps the subject
// findable once there is this much else on screen.
const ZOOM_BY_LEVEL: Record<string, number> = {
  poi: 11.5,
  locality: 9,
  admin_area_1: 4.5,
  country: 2.5,
  continent: 1.5,
};

// Anything unrecognised sits between a city and a region, which is the
// least wrong place to be wrong.
const DEFAULT_ZOOM = 6.5;

export function zoomForPlaceLevel(level: string | null): number {
  if (!level) return DEFAULT_ZOOM;
  return ZOOM_BY_LEVEL[level] ?? DEFAULT_ZOOM;
}

export type PlaceMapUrlOptions = {
  lat: number;
  lng: number;
  level: string | null;
  // Layout size in points. Doubled internally for retina, then clamped.
  width: number;
  height: number;
};

// Null when there is nothing to draw — no token configured, or a place
// cached without coordinates (every POI has them, but broader places often
// do not). Callers render their existing empty state in that case rather
// than a broken image.
export function buildPlaceMapUrl(opts: PlaceMapUrlOptions): string | null {
  const token = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token) return null;
  if (!Number.isFinite(opts.lat) || !Number.isFinite(opts.lng)) return null;

  // Clamped to what the endpoint accepts. Clamping the request rather than
  // the layout means an unusually wide card degrades in resolution instead
  // of returning a 422 and rendering nothing.
  const scale = Math.min(1, MAX_REQUEST_DIMENSION / Math.max(opts.width, opts.height, 1));
  const w = Math.max(1, Math.round(opts.width * scale));
  const h = Math.max(1, Math.round(opts.height * scale));

  const zoom = zoomForPlaceLevel(opts.level);

  // A pin, which this deliberately did without before.
  //
  // The old reasoning was that a pin covers the thing it points at — true at
  // the POI zoom this used to sit at, where the subject filled the frame.
  // At these wider zooms the opposite holds: without a mark there is nothing
  // saying WHICH part of the visible land the review is about, and the image
  // stops being about the place at all.
  //
  // Cream rather than a colour, matching the unrated pin in
  // trip-map-square.tsx — the rating already has a stamp of its own on the
  // card, and a second coloured token would be reading the same number twice.
  const pin = `pin-s+EAE7CF(${opts.lng.toFixed(5)},${opts.lat.toFixed(5)})`;

  return (
    `https://api.mapbox.com/styles/v1/${STATIC_STYLE}/static/${pin}/` +
    `${opts.lng.toFixed(5)},${opts.lat.toFixed(5)},${zoom}/${w}x${h}${RETINA}` +
    `?access_token=${token}&attribution=false&logo=false`
  );
}
