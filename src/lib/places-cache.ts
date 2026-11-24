import { FunctionsHttpError } from '@supabase/supabase-js';

import type { PlaceDetails } from '@/lib/google-places';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type PlaceRow = Database['public']['Tables']['places']['Row'];
export type PlaceLevel = PlaceRow['level'];

export function getLocalityName(details: PlaceDetails): string | null {
  return details.addressComponents.find((component) => component.types.includes('locality'))?.longText ?? null;
}

export async function cachePlaceHierarchy(details: PlaceDetails): Promise<PlaceRow> {
  // The server uses this ID to verify the details it writes to the shared catalog.
  const { data, error } = await supabase.functions.invoke<{ place: PlaceRow }>('cache-google-place', {
    body: { placeId: details.id },
  });
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null);
    if (typeof body?.error === 'string') throw new Error(body.error);
  }
  if (error) throw error;
  if (!data?.place) throw new Error('Could not load the place.');
  return data.place;
}

// Walks parent_id up to the root for display (breadcrumb), e.g.
// "United States > Colorado > Denver". Hierarchy is at most 4 levels deep
// by design, so this is always a short, bounded chain of lookups.
// One step of the containment chain above a place, broadest first — the
// scopes a place page can widen out to.
export type PlaceAncestor = { id: string; name: string; level: string };

// The places that CONTAIN this one, as rows you can navigate to rather than
// the flat string getPlaceBreadcrumb returns.
//
// One RPC rather than that function's loop, which issues a separate query
// per level (up to four sequential round trips for a venue: locality,
// state, country, continent). The ids are the point — a breadcrumb you can
// only read is a dead end on a page whose whole purpose is moving between
// scopes.
export async function getPlaceAncestors(placeId: string): Promise<PlaceAncestor[]> {
  const { data, error } = await supabase.rpc('get_place_ancestry', { p_id: placeId });
  if (error) throw error;

  return (data as { id: string; name: string; level: string; depth: number }[])
    // depth 0 is the place being viewed. It's already the page's title, and
    // it's only present at all for non-POI places (the RPC filters POIs out
    // of its own result), so this is what makes a country page list just
    // its continent rather than leading with itself.
    .filter((row) => row.depth > 0)
    // The RPC returns narrowest-first; reading order is the other way round.
    .sort((a, b) => b.depth - a.depth)
    .map(({ id, name, level }) => ({ id, name, level }));
}

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

// A single-line "state, country" (or just one of the two, or null if the
// hierarchy is missing/incomplete) for compact display on list rows —
// batched across a whole list's place ids in one round trip via the
// resolve_state_countries RPC, so it's safe to use once per list load
// without an N+1 fetch pattern.
//
// This used to be computed client-side by walking a PostgREST nested
// self-embed (places!place_id(...parent:places!places_parent_id_fkey(...))),
// which turned out not to work on this project: confirmed live that a plain
// column-name hint (places!parent_id) resolves to the *children* direction
// (reverse FK), not the parent one, and the constraint-name hint doesn't
// resolve at all ("no matches found" in the schema cache, even after a
// manual reload). The RPC (a recursive SQL function, see its migration)
// sidesteps PostgREST's embedding resolution entirely.
export async function resolveStateCountries(placeIds: string[]): Promise<Map<string, string | null>> {
  const uniqueIds = [...new Set(placeIds)];
  const result = new Map<string, string | null>();
  if (uniqueIds.length === 0) return result;

  const { data, error } = await supabase.rpc('resolve_state_countries', { place_ids: uniqueIds });
  if (error) throw error;

  for (const row of data) {
    const parts = [row.state_name, row.country_name].filter((s): s is string => s != null);
    result.set(row.place_id, parts.length > 0 ? parts.join(', ') : null);
  }
  return result;
}
