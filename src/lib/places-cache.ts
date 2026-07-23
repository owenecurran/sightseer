import type { PlaceDetails } from '@/lib/google-places';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type PlaceRow = Database['public']['Tables']['places']['Row'];
type PlaceLevel = PlaceRow['level'];

function levelFromTypes(types: string[]): PlaceLevel {
  if (types.includes('country')) return 'country';
  if (types.includes('administrative_area_level_1')) return 'admin_area_1';
  if (types.includes('locality')) return 'locality';
  return 'poi';
}

function findComponent(components: PlaceDetails['addressComponents'], type: string) {
  return components.find((c) => c.types.includes(type));
}

async function getOrCreatePlace(params: {
  level: PlaceLevel;
  name: string;
  parentId: string | null;
  googlePlaceId?: string;
  lat?: number;
  lng?: number;
}): Promise<PlaceRow> {
  const { level, name, parentId, googlePlaceId, lat, lng } = params;

  if (googlePlaceId) {
    const { data: byGoogleId } = await supabase
      .from('places')
      .select('*')
      .eq('google_place_id', googlePlaceId)
      .maybeSingle();
    if (byGoogleId) return byGoogleId;
  }

  let matchQuery = supabase.from('places').select('*').eq('level', level).eq('name', name);
  matchQuery = parentId ? matchQuery.eq('parent_id', parentId) : matchQuery.is('parent_id', null);
  const { data: existing } = await matchQuery.maybeSingle();

  if (existing) {
    // Upgrade a chain-inferred row (no google_place_id yet) once we have the
    // authoritative one from looking the place up directly.
    if (googlePlaceId && !existing.google_place_id) {
      const { data: updated, error } = await supabase
        .from('places')
        .update({ google_place_id: googlePlaceId, lat, lng })
        .eq('id', existing.id)
        .select()
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
