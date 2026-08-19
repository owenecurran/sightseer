import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type PlaceRow = Database['public']['Tables']['places']['Row'];

// Mirrors the server-side cap (see enforce_home_location_limit in
// 20260819090000_home_locations_and_trips.sql). Duplicated here only so the
// UI can disable the picker before a doomed round-trip — the trigger is
// what actually holds the invariant.
export const MAX_HOME_LOCATIONS = 5;

export type HomeLocation = {
  id: string;
  placeId: string;
  name: string;
  // The city/state/country line under the name, when this place sits inside
  // something broader — null for a country, which has no parent to show.
  parentName: string | null;
};

type RawHomeLocation = {
  id: string;
  place_id: string;
  places: { name: string; parent: { name: string } | null } | null;
};

export async function listHomeLocations(userId: string): Promise<HomeLocation[]> {
  const { data, error } = await supabase
    .from('home_locations')
    .select('id, place_id, places!place_id(name, parent:places!parent_id(name))')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  return (data as unknown as RawHomeLocation[]).map((row) => ({
    id: row.id,
    placeId: row.place_id,
    name: row.places?.name ?? 'Somewhere',
    parentName: row.places?.parent?.name ?? null,
  }));
}

// Surfaces the two failures worth distinguishing to the user — already
// saved, and at the cap — as plain messages rather than raw Postgres error
// text. The unique constraint and the limit trigger are both server-side,
// so this maps their errors instead of pre-checking (which would race).
export async function addHomeLocation(userId: string, place: PlaceRow): Promise<void> {
  const { error } = await supabase
    .from('home_locations')
    .insert({ user_id: userId, place_id: place.id });
  if (!error) return;

  if (error.code === '23505') {
    throw new Error(`${place.name} is already one of your home locations.`);
  }
  // check_violation — raised by enforce_home_location_limit.
  if (error.code === '23514') {
    throw new Error(`You can have at most ${MAX_HOME_LOCATIONS} home locations. Remove one first.`);
  }
  throw error;
}

export async function removeHomeLocation(id: string): Promise<void> {
  const { error } = await supabase.from('home_locations').delete().eq('id', id);
  if (error) throw error;
}
