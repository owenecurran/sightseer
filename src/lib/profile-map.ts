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

// Locks the profile map's starting camera position (center + zoom only —
// still a live, interactive map once opened, this just fixes the initial
// framing instead of the default auto-centroid). Nullable columns: a user
// who's never locked a view falls back to today's auto-centroid behavior.
export async function saveDefaultMapCamera(
  userId: string,
  center: { lat: number; lng: number },
  zoom: number
): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ map_default_center_lat: center.lat, map_default_center_lng: center.lng, map_default_zoom: zoom })
    .eq('id', userId);
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

export type VisitedCity = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

export type VisitedHierarchy = {
  cities: VisitedCity[];
  countries: number;
  states: number;
};

type PlaceNode = {
  id: string;
  name: string;
  level: string;
  lat: number | null;
  lng: number | null;
  parent_id: string | null;
};

const PLACE_NODE_COLUMNS = 'id, name, level, lat, lng, parent_id';

// The cities, states and countries someone's reviews are in, for the profile
// map's Cities layer and its caption.
//
// A review is of one place, and places are a chain (a spot, in its city, in
// its state, in its country: see places-cache.ts), so each reviewed place is
// walked up to find what it is in. Done here rather than in a database
// function so it needs nothing deployed: two or three small reads, over a
// person's own reviews. The states and countries counted are the same set
// get_visited_regions outlines, found the same way.
export async function getVisitedHierarchy(userId: string): Promise<VisitedHierarchy> {
  const { data, error } = await supabase
    .from('visits')
    .select(`places!place_id(${PLACE_NODE_COLUMNS})`)
    .eq('user_id', userId);
  if (error) throw error;

  const known = new Map<string, PlaceNode>();
  const reviewed: PlaceNode[] = [];
  for (const row of data as unknown as { places: PlaceNode | null }[]) {
    const place = row.places;
    if (!place || known.has(place.id)) continue;
    known.set(place.id, place);
    reviewed.push(place);
  }

  // Up the chain until every reviewed place's line is known. Four steps at
  // most: a trail or spot, its city, its state, its country.
  let missing = [...new Set(reviewed.map((p) => p.parent_id).filter((id): id is string => id != null && !known.has(id)))];
  for (let step = 0; step < 4 && missing.length > 0; step++) {
    const { data: parents, error: parentError } = await supabase
      .from('places')
      .select(PLACE_NODE_COLUMNS)
      .in('id', missing);
    if (parentError) throw parentError;
    for (const parent of parents as PlaceNode[]) known.set(parent.id, parent);
    missing = [
      ...new Set(
        (parents as PlaceNode[]).map((p) => p.parent_id).filter((id): id is string => id != null && !known.has(id)),
      ),
    ];
  }

  const countries = new Set<string>();
  const states = new Set<string>();
  const cities = new Map<string, { city: PlaceNode; lats: number[]; lngs: number[] }>();
  for (const place of reviewed) {
    let node: PlaceNode | undefined = place;
    let city: PlaceNode | undefined;
    for (let step = 0; node && step < 6; step++) {
      if (node.level === 'locality' && !city) city = node;
      if (node.level === 'admin_area_1') states.add(node.id);
      if (node.level === 'country') countries.add(node.id);
      node = node.parent_id ? known.get(node.parent_id) : undefined;
    }
    if (!city) continue;
    const entry = cities.get(city.id) ?? { city, lats: [], lngs: [] };
    if (place.lat != null && place.lng != null) {
      entry.lats.push(place.lat);
      entry.lngs.push(place.lng);
    }
    cities.set(city.id, entry);
  }

  const average = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
  return {
    countries: countries.size,
    states: states.size,
    cities: [...cities.values()].flatMap(({ city, lats, lngs }) => {
      // The city's own point where it has one. A city filled in from a
      // review's address often has none, and then the middle of the places
      // reviewed in it stands in for it.
      if (city.lat != null && city.lng != null) return [{ id: city.id, name: city.name, lat: city.lat, lng: city.lng }];
      if (lats.length === 0) return [];
      return [{ id: city.id, name: city.name, lat: average(lats), lng: average(lngs) }];
    }),
  };
}
