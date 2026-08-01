import { supabase } from '@/lib/supabase';
import type { LayerKey } from '@/lib/map-layers';

// Persists the profile map's default layer selection (ProfileMapModal's
// "Set as default" action) — RLS already restricts `users` updates to the
// authenticated user's own row, so this is only ever meaningful called with
// the current session's own id (enforced by the caller only showing the
// affordance on your own profile, not by anything here).
export async function saveDefaultMapLayers(userId: string, layers: LayerKey[]): Promise<void> {
  const { error } = await supabase.from('users').update({ map_default_layers: layers }).eq('id', userId);
  if (error) throw error;
}

export type VisitedPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

type RawCategoryRow = {
  places: { id: string; name: string; lat: number | null; lng: number | null; category: string | null } | null;
};

// Same shape/reasoning as getVisitedPlaces below (client-side filter over a
// small per-user dataset rather than a fragile nested-table PostgREST
// filter) — this just also keeps `category` so the caller can filter to
// `'national_park'` for the profile map's National Parks overlay.
export async function getVisitedPlacesWithCategory(
  userId: string
): Promise<(VisitedPlace & { category: string | null })[]> {
  const { data, error } = await supabase
    .from('visits')
    .select('places!place_id(id, name, lat, lng, category)')
    .eq('user_id', userId);
  if (error) throw error;

  const seen = new Set<string>();
  const places: (VisitedPlace & { category: string | null })[] = [];
  for (const row of data as unknown as RawCategoryRow[]) {
    const place = row.places;
    if (!place || place.lat == null || place.lng == null || seen.has(place.id)) continue;
    seen.add(place.id);
    places.push({ id: place.id, name: place.name, lat: place.lat, lng: place.lng, category: place.category });
  }
  return places;
}

type RawRow = {
  places: { id: string; name: string; lat: number | null; lng: number | null } | null;
};

// No lat/lng filter at the query level — PostgREST's embedded-resource
// filter syntax for a nested table is easy to get subtly wrong, and this is
// a small per-user dataset, so filtering out places missing coordinates
// (chain-inferred country/admin_area rows, mainly) client-side is simpler
// and just as cheap. RLS on `visits` already governs exactly what the
// caller may see here — same reasoning already relied on for "Nth visit"
// and aggregate ratings.
export async function getVisitedPlaces(userId: string): Promise<VisitedPlace[]> {
  const { data, error } = await supabase
    .from('visits')
    .select('places!place_id(id, name, lat, lng)')
    .eq('user_id', userId);
  if (error) throw error;

  const seen = new Set<string>();
  const places: VisitedPlace[] = [];
  for (const row of data as unknown as RawRow[]) {
    const place = row.places;
    if (!place || place.lat == null || place.lng == null || seen.has(place.id)) continue;
    seen.add(place.id);
    places.push({ id: place.id, name: place.name, lat: place.lat, lng: place.lng });
  }
  return places;
}

export type VisitedRegion = {
  id: string;
  name: string;
  level: 'country' | 'admin_area_1';
  // One entry per polygon in the underlying (Multi)Polygon, each the outer
  // ring only (interior rings/holes are dropped, same simplification the
  // expo-maps version made). Kept as raw [lng, lat] tuples — GeoJSON's own
  // coordinate order — rather than {latitude, longitude} objects, since
  // these feed a Mapbox ShapeSource/FillLayer now, which wants real GeoJSON.
  rings: [number, number][][];
};

function parseMultiPolygonRings(geojson: string): [number, number][][] {
  const parsed = JSON.parse(geojson) as { type: string; coordinates: unknown };
  const polygons =
    parsed.type === 'MultiPolygon'
      ? (parsed.coordinates as number[][][][])
      : [parsed.coordinates as number[][][]];

  return polygons.map((polygon) => polygon[0].map(([lng, lat]) => [lng, lat] as [number, number]));
}

// Fetches cached region boundaries, triggers a fetch-place-boundary call
// for any still missing one (first-ever view of a given country/state is
// slower — every view after is instant, since the result is cached
// server-side in `places.boundary_geometry` and shared across every user).
export async function getVisitedRegions(userId: string): Promise<VisitedRegion[]> {
  const { data, error } = await supabase.rpc('get_visited_regions', { profile_user_id: userId });
  if (error) throw error;

  const missingIds = data.filter((r) => !r.boundary_geojson).map((r) => r.id);

  let rows = data;
  if (missingIds.length > 0) {
    await Promise.all(
      missingIds.map((id) =>
        supabase.functions.invoke('fetch-place-boundary', { body: { placeId: id } }).catch(() => null)
      )
    );
    const refetch = await supabase.rpc('get_visited_regions', { profile_user_id: userId });
    if (refetch.error) throw refetch.error;
    rows = refetch.data;
  }

  return rows
    .filter((r): r is typeof r & { level: 'country' | 'admin_area_1' } =>
      Boolean(r.boundary_geojson) && (r.level === 'country' || r.level === 'admin_area_1')
    )
    .map((r) => ({
      id: r.id,
      name: r.name,
      level: r.level,
      rings: parseMultiPolygonRings(r.boundary_geojson as string),
    }));
}
