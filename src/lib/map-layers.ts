// Shared between profile-map.native.tsx/.tsx (the small preview) and
// profile-map-modal.native.tsx/.tsx (the full-screen expanded view) — both
// now render the same 4 toggleable layers, so the layer set/labels and the
// overlay colors live here once instead of drifting across 4 files.
// `regionsToFeatureCollection` itself stays duplicated per platform (native
// uses the `geojson` package's types, web uses the DOM lib's global
// `GeoJSON` types — structurally identical but different type sources, not
// worth fighting for one shared helper).
export type LayerKey = 'pins' | 'countries' | 'states' | 'national_parks';

export const LAYER_OPTIONS: { key: LayerKey; label: string }[] = [
  { key: 'pins', label: 'Pins' },
  { key: 'countries', label: 'Countries' },
  { key: 'states', label: 'States' },
  { key: 'national_parks', label: 'National Parks' },
];

// Matches the `map_default_layers` column's own default
// (20260801090000_profile_map_default_layers.sql) — used as a fallback here
// too, e.g. for a profile fetched before that migration's default backfilled,
// or any other edge case where the stored array is empty/unrecognized.
export const DEFAULT_LAYERS: LayerKey[] = ['pins', 'national_parks'];

function isLayerKey(value: string): value is LayerKey {
  return LAYER_OPTIONS.some((option) => option.key === value);
}

export function parseDefaultLayers(stored: string[] | null | undefined): Set<LayerKey> {
  const filtered = (stored ?? []).filter(isLayerKey);
  return new Set(filtered.length > 0 ? filtered : DEFAULT_LAYERS);
}

// Same "row -> prop" shape both profile.tsx and user/[id].tsx need for the
// locked map-thumbnail camera (map_default_center_lat/lng/zoom) — all three
// columns are nullable together (unset = "not locked, use auto-centroid"),
// so this only returns a camera when all three are actually present.
export function parseDefaultCamera(row: {
  map_default_center_lat: number | null;
  map_default_center_lng: number | null;
  map_default_zoom: number | null;
}): { lat: number; lng: number; zoom: number } | null {
  if (row.map_default_center_lat == null || row.map_default_center_lng == null || row.map_default_zoom == null) {
    return null;
  }
  return { lat: row.map_default_center_lat, lng: row.map_default_center_lng, zoom: row.map_default_zoom };
}

// Overlay colours, drawn from the brand palette rather than stock Material
// hues (they were #1E88E5 / #F4511E / #2E7D32 — a blue, an orange and a
// green that belong to no other screen in this app). Two problems with
// those, both fixed here: they read as someone else's palette on top of the
// dark editorial map, and at 0.2 opacity the darker ones barely separated
// from the dark-v10 basemap underneath.
//
// The three layers are told apart by hue, not brightness, so they stay
// distinguishable when two overlap: cream for countries (the broadest wash,
// deliberately the most neutral), amber for states, sage for parks — green
// being the obvious one for parkland, and sage is the brand's own accent.
export const COUNTRY_FILL = '#eae7cf';
export const COUNTRY_FILL_OPACITY = 0.22;
export const COUNTRY_LINE = '#eae7cf';
export const STATE_FILL = '#e0a458';
export const STATE_FILL_OPACITY = 0.3;
export const STATE_LINE = '#e0a458';
export const NATIONAL_PARK_COLOR = '#a0bd91';
