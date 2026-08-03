import type { PlaceDetails } from '@/lib/google-places';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type PlaceRow = Database['public']['Tables']['places']['Row'];
type PlaceLevel = PlaceRow['level'];
type PlaceCategory = PlaceRow['category'];

function levelFromTypes(types: string[]): PlaceLevel {
  if (types.includes('country')) return 'country';
  if (types.includes('administrative_area_level_1')) return 'admin_area_1';
  if (types.includes('locality')) return 'locality';
  return 'poi';
}

const WATER_TYPES = ['beach', 'lake', 'river', 'island'];
const TRAIL_TYPES = ['hiking_area', 'nature_preserve', 'scenic_spot'];
const NATIONAL_PARK_TYPES = ['national_park'];
const FOOD_DRINK_TYPES = [
  'restaurant',
  'bar',
  'pub',
  'cocktail_bar',
  'wine_bar',
  'sports_bar',
  'lounge_bar',
  'cafe',
  'coffee_shop',
  'tea_house',
  'bakery',
  'ice_cream_shop',
  'brewery',
  'food',
];

// Drives tag-chip coloring. Based on Google's actual published place types
// (verified against live API responses, not guessed) — cuisine-specific
// restaurant types (e.g. "italian_restaurant") all end in "_restaurant"
// rather than being individually enumerated, since Google adds more over
// time and hardcoding each one would silently miss new ones.
function categorizeFromTypes(types: string[]): PlaceCategory {
  // Checked first — a national park can also carry a generic type like
  // "nature_preserve" (TRAIL_TYPES below), and the more specific, more
  // useful category should win rather than falling into the generic bucket.
  if (types.some((t) => NATIONAL_PARK_TYPES.includes(t))) return 'national_park';
  if (types.some((t) => WATER_TYPES.includes(t))) return 'water';
  if (types.some((t) => TRAIL_TYPES.includes(t))) return 'trail';
  if (types.some((t) => t.endsWith('_restaurant') || FOOD_DRINK_TYPES.includes(t))) return 'food_drink';
  return null;
}

function findComponent(components: PlaceDetails['addressComponents'], type: string) {
  return components.find((c) => c.types.includes(type));
}

// Shared with the location-search modal's candidate rows, which show a
// locality sub-line using the same addressComponents findNearbyPlaces
// already populates — no extra API call needed.
export function getLocalityName(details: PlaceDetails): string | null {
  return findComponent(details.addressComponents, 'locality')?.longText ?? null;
}

async function getOrCreatePlace(params: {
  level: PlaceLevel;
  name: string;
  parentId: string | null;
  googlePlaceId?: string;
  lat?: number;
  lng?: number;
  category?: PlaceCategory;
}): Promise<PlaceRow> {
  const { level, name, parentId, googlePlaceId, lat, lng, category = null } = params;

  if (googlePlaceId) {
    const { data: byGoogleId } = await supabase
      .from('places')
      .select('*')
      .eq('google_place_id', googlePlaceId)
      .maybeSingle();
    // Doesn't upgrade a stale row's category here even if one is now known
    // (a place cached before national_park classification existed keeps
    // reporting category: null via this path) — this lookup only ever
    // matches a row that already HAS a google_place_id, so there's nothing
    // to upgrade about the id itself; only the below (bare chain-inferred
    // rows, no google_place_id yet) needs the upgrade path.
    if (byGoogleId) return byGoogleId;
  }

  let matchQuery = supabase.from('places').select('*').eq('level', level).eq('name', name);
  matchQuery = parentId ? matchQuery.eq('parent_id', parentId) : matchQuery.is('parent_id', null);
  const { data: existing } = await matchQuery.maybeSingle();

  if (existing) {
    // Upgrade a chain-inferred row (no google_place_id/category yet) once we
    // have the authoritative details from looking the place up directly.
    // `places` is deliberately client-append-only (RLS has no UPDATE policy
    // — "corrections happen server-side only") so this can't be a plain
    // .update() call; upgrade_place_details is a security-definer RPC for
    // exactly this, same pattern as store_place_boundary.
    if ((googlePlaceId && !existing.google_place_id) || (category && !existing.category)) {
      // The RPC's generated Args type is non-nullable, but the underlying SQL
      // params are plain (nullable) columns — Postgres/PostgREST accept a
      // JSON null for any of these just fine, the generated type is just
      // stricter than the actual function signature.
      const { data: updated, error } = await supabase
        .rpc('upgrade_place_details', {
          place_id: existing.id,
          p_google_place_id: (googlePlaceId ?? existing.google_place_id) as string,
          p_category: (category ?? existing.category) as string,
          p_lat: (lat ?? existing.lat) as number,
          p_lng: (lng ?? existing.lng) as number,
        })
        .single();
      if (error) throw error;
      return updated;
    }
    return existing;
  }

  const { data: created, error } = await supabase
    .from('places')
    .insert({
      level,
      name,
      parent_id: parentId,
      google_place_id: googlePlaceId ?? null,
      category,
      source: 'google',
      lat,
      lng,
    })
    .select()
    .single();
  if (error) throw error;
  return created;
}

// Decomposes a Place Details result into the places hierarchy chain
// (country -> admin_area_1 -> locality -> the selected place itself, if it's
// a POI/trail rather than one of those levels already), get-or-creating each
// level. Returns the leaf row representing the place the user searched for.
export async function cachePlaceHierarchy(details: PlaceDetails): Promise<PlaceRow> {
  const selectedLevel = levelFromTypes(details.types);

  const countryComponent = findComponent(details.addressComponents, 'country');
  const adminAreaComponent = findComponent(details.addressComponents, 'administrative_area_level_1');
  const localityComponent = findComponent(details.addressComponents, 'locality');

  let parent: PlaceRow | null = null;

  if (countryComponent && selectedLevel !== 'country') {
    parent = await getOrCreatePlace({
      level: 'country',
      name: countryComponent.longText,
      parentId: null,
    });
  }

  if (adminAreaComponent && selectedLevel !== 'admin_area_1' && selectedLevel !== 'country') {
    parent = await getOrCreatePlace({
      level: 'admin_area_1',
      name: adminAreaComponent.longText,
      parentId: parent?.id ?? null,
    });
  }

  if (localityComponent && (selectedLevel === 'poi' || selectedLevel === 'trail')) {
    parent = await getOrCreatePlace({
      level: 'locality',
      name: localityComponent.longText,
      parentId: parent?.id ?? null,
    });
  }

  // The selected place itself: for country/admin_area_1/locality searches,
  // this *is* the parent chain's leaf, just now confirmed with its real
  // google_place_id and coordinates. For POIs, it's a new leaf under parent.
  return getOrCreatePlace({
    level: selectedLevel,
    name: details.displayName,
    parentId: selectedLevel === 'country' ? null : (parent?.id ?? null),
    googlePlaceId: details.id,
    lat: details.lat,
    lng: details.lng,
    category: categorizeFromTypes(details.types),
  });
}

// Walks parent_id up to the root for display (breadcrumb), e.g.
// "United States > Colorado > Denver". Hierarchy is at most 4 levels deep
// by design, so this is always a short, bounded chain of lookups.
export async function getPlaceBreadcrumb(place: PlaceRow): Promise<string> {
  const names: string[] = [place.name];
  let currentParentId = place.parent_id;

  while (currentParentId) {
    const { data: parent } = await supabase
      .from('places')
      .select('*')
      .eq('id', currentParentId)
      .single();
    if (!parent) break;
    names.unshift(parent.name);
    currentParentId = parent.parent_id;
  }

  return names.join(' > ');
}
