import { supabase } from '@/lib/supabase';

// Only the levels deepest_common_area can return (see the migration) — a
// trip is always labeled with a city or broader, never an individual venue.
export type TripAreaLevel = 'locality' | 'admin_area_1' | 'country';

// 'trip'   — 2+ reviews across 2+ days away from every home location.
// 'outing' — 3+ reviews on a single day, counted whether or not they're
//            away from home. This is what keeps a dense day worth grouping
//            ("a night out on the town") after somewhere becomes a home
//            location and its clusters stop qualifying as trips.
export type TripKind = 'trip' | 'outing';

export type Trip = {
  // Stable per (author, trip start) — see trip_overrides' own key comment.
  key: string;
  kind: TripKind;
  userId: string;
  areaPlaceId: string;
  // What detection picked before any user override, so the level picker can
  // offer "back to automatic" without recomputing anything.
  autoAreaPlaceId: string;
  // "Lisbon" / "Colorado" / "Portugal", whichever is the deepest place all
  // of the trip's reviews sit inside. Chosen server-side, not here.
  areaName: string;
  areaLevel: TripAreaLevel;
  // The displayed area's own coordinates — what the map thumbnail centres
  // on. Null for a place cached without them.
  areaLat: number | null;
  areaLng: number | null;
  startDate: string;
  endDate: string;
  // Recent enough that more reviews are plausibly still coming — the feed
  // keeps these split by day rather than collapsing them into one block.
  isOngoing: boolean;
  // Already filtered to what the caller is allowed to see, though the trip's
  // own date range reflects all of the author's visits (see the RPC).
  visitIds: string[];
  travelBookId: string | null;
};

type RawTrip = {
  user_id: string;
  trip_key: string;
  kind: string;
  area_place_id: string;
  area_name: string;
  area_level: string;
  area_lat: number | null;
  area_lng: number | null;
  auto_area_place_id: string;
  start_date: string;
  end_date: string;
  is_ongoing: boolean;
  visit_ids: string[];
  travel_book_id: string | null;
};

function isAreaLevel(level: string): level is TripAreaLevel {
  return level === 'locality' || level === 'admin_area_1' || level === 'country';
}

// One batched call for every author appearing in the caller's feed, rather
// than per-post — trip boundaries depend on ALL of an author's visits, not
// just the ones currently on screen, so this can't be derived from the feed
// rows themselves.
export async function getTripsForUsers(userIds: string[]): Promise<Trip[]> {
  if (userIds.length === 0) return [];

  const { data, error } = await supabase.rpc('get_trips_for_users', { user_ids: userIds });
  if (error) throw error;

  return (data as unknown as RawTrip[]).map((row) => ({
    key: row.trip_key,
    kind: row.kind === 'outing' ? 'outing' : 'trip',
    userId: row.user_id,
    areaPlaceId: row.area_place_id,
    autoAreaPlaceId: row.auto_area_place_id,
    areaName: row.area_name,
    areaLat: row.area_lat,
    areaLng: row.area_lng,
    // Falls back rather than throwing on an unexpected level — a label
    // that renders is better than a feed that doesn't.
    areaLevel: isAreaLevel(row.area_level) ? row.area_level : 'locality',
    startDate: row.start_date,
    endDate: row.end_date,
    isOngoing: row.is_ongoing,
    visitIds: row.visit_ids ?? [],
    travelBookId: row.travel_book_id,
  }));
}

// How long an ongoing trip has to run before staying somewhere starts
// looking less like travel and more like living there. Deliberately well
// past a normal holiday so a two-week trip doesn't get nagged.
const LONG_STAY_DAYS = 21;

export type HomeLocationSuggestion = {
  trip: Trip;
  dayCount: number;
};

function daysBetween(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split('-').map(Number);
  const [ty, tm, td] = toDate.split('-').map(Number);
  // Local noon on both ends, so a DST shift between the two dates can't
  // round this to the wrong number of whole days.
  const from = new Date(fy, fm - 1, fd, 12).getTime();
  const to = new Date(ty, tm - 1, td, 12).getTime();
  return Math.round((to - from) / 86_400_000);
}

// "You've been in Lisbon a while — add it as a home location?" Returns the
// longest qualifying stay, or null when there's nothing worth asking about.
//
// Only ever about the viewer's OWN trips: it prompts them to change their
// own settings, and home_locations is owner-only anyway.
export async function getHomeLocationSuggestion(
  userId: string,
  homePlaceIds: string[]
): Promise<HomeLocationSuggestion | null> {
  const [trips, { data: overrides, error }] = await Promise.all([
    getTripsForUsers([userId]),
    supabase
      .from('trip_overrides')
      .select('start_date')
      .eq('user_id', userId)
      .eq('home_prompt_dismissed', true),
  ]);
  if (error) throw error;

  const silenced = new Set((overrides ?? []).map((row) => row.start_date));
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;

  const candidates = trips
    .filter(
      (trip) =>
        trip.kind === 'trip' &&
        trip.isOngoing &&
        !silenced.has(trip.startDate) &&
        // Somewhere already saved as home can't need adding again.
        !homePlaceIds.includes(trip.areaPlaceId)
    )
    .map((trip) => ({ trip, dayCount: daysBetween(trip.startDate, todayKey) }))
    .filter((candidate) => candidate.dayCount >= LONG_STAY_DAYS)
    .sort((a, b) => b.dayCount - a.dayCount);

  return candidates[0] ?? null;
}

export async function dismissHomeLocationPrompt(trip: Trip): Promise<void> {
  const { error } = await supabase.from('trip_overrides').upsert(
    {
      user_id: trip.userId,
      start_date: trip.startDate,
      home_prompt_dismissed: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,start_date' }
  );
  if (error) throw error;
}

export type AreaOption = {
  placeId: string;
  name: string;
  level: TripAreaLevel;
};

// The city -> state -> country chain the trip can be labeled with. Only
// goes *upward* from what detection picked, which is the only direction
// that's meaningful: a narrower place wouldn't contain every review on the
// trip. So a trip auto-labeled "San Francisco" can also show as
// "California" or "United States", while one already at country level has
// nothing broader to offer.
export async function getAreaOptions(autoAreaPlaceId: string): Promise<AreaOption[]> {
  const { data, error } = await supabase.rpc('get_place_ancestry', { p_id: autoAreaPlaceId });
  if (error) throw error;

  return (data as unknown as { id: string; name: string; level: string }[])
    .filter((row): row is { id: string; name: string; level: TripAreaLevel } => isAreaLevel(row.level))
    .map((row) => ({ placeId: row.id, name: row.name, level: row.level }));
}

// null resets to whatever detection picks on its own.
export async function setTripDisplayPlace(
  trip: Trip,
  displayPlaceId: string | null
): Promise<void> {
  const { error } = await supabase.from('trip_overrides').upsert(
    {
      user_id: trip.userId,
      start_date: trip.startDate,
      display_place_id: displayPlaceId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,start_date' }
  );
  if (error) throw error;
}

// --- Trip suggestion: "should this day be a trip?" ---------------------

// Two reviews are enough to ask when the cluster is genuinely far from home
// — a different city entirely reads as a trip immediately. Closer than that
// and a pair is ambiguous (a long lunch out), so it waits for a third.
const FAR_FROM_HOME_M = 80_000;

export type TripSuggestion = {
  date: string;
  areaPlaceId: string | null;
  areaName: string;
  visitCount: number;
  distanceFromHomeM: number | null;
};

// Whether a given day is worth offering as a trip. Returns null when it
// isn't — already promoted or declined, at home, or not enough reviews yet.
export async function getTripSuggestion(
  userId: string,
  date: string
): Promise<TripSuggestion | null> {
  const { data, error } = await supabase.rpc('get_trip_suggestion', {
    target_user_id: userId,
    target_date: date,
  });
  if (error) throw error;

  const row = (data as unknown as {
    area_place_id: string | null;
    area_name: string | null;
    visit_count: number;
    distance_from_home_m: number | null;
  }[])?.[0];
  if (!row || !row.area_name) return null;

  const distance = row.distance_from_home_m;
  const isFar = distance != null && distance >= FAR_FROM_HOME_M;
  // 3+ always qualifies; 2 only when it's clearly a trip rather than an
  // errand — see FAR_FROM_HOME_M.
  if (row.visit_count < 3 && !isFar) return null;

  return {
    date,
    areaPlaceId: row.area_place_id,
    areaName: row.area_name,
    visitCount: Number(row.visit_count),
    distanceFromHomeM: distance,
  };
}

// "Yes, this is a trip."
export async function promoteToTrip(userId: string, date: string): Promise<void> {
  const { error } = await supabase.from('trip_overrides').upsert(
    { user_id: userId, start_date: date, promoted: true, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,start_date' }
  );
  if (error) throw error;
}

// "No" — silences it for good. Simply ignoring the prompt writes nothing,
// which is what lets it come back later.
export async function declineTripPrompt(userId: string, date: string): Promise<void> {
  const { error } = await supabase.from('trip_overrides').upsert(
    {
      user_id: userId,
      start_date: date,
      trip_prompt_declined: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,start_date' }
  );
  if (error) throw error;
}

// Manually created trip: an anchor row the detection RPC unions in, rather
// than a second kind of trip with its own table and code path.
export async function createManualTrip(
  userId: string,
  startDate: string,
  endDate: string,
  displayPlaceId: string | null
): Promise<void> {
  const { error } = await supabase.from('trip_overrides').upsert(
    {
      user_id: userId,
      start_date: startDate,
      manual_end_date: endDate,
      display_place_id: displayPlaceId,
      promoted: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,start_date' }
  );
  if (error) throw error;
}

// --- Trip membership -----------------------------------------------------

// "This review wasn't part of the trip." Keyed by the visit rather than by
// the trip (see the migration): it applies before clustering, so removing a
// stray review also corrects the trip's dates and its name, and no later
// review can quietly drag it back in.
export async function excludeVisitFromTrip(userId: string, visitId: string): Promise<void> {
  const { error } = await supabase
    .from('trip_excluded_visits')
    .upsert({ user_id: userId, visit_id: visitId }, { onConflict: 'user_id,visit_id' });
  if (error) throw error;
}

// Undo — the review rejoins whatever trip it naturally falls into.
export async function restoreVisitToTrip(userId: string, visitId: string): Promise<void> {
  const { error } = await supabase
    .from('trip_excluded_visits')
    .delete()
    .eq('user_id', userId)
    .eq('visit_id', visitId);
  if (error) throw error;
}

// Reviews this user has removed from their trips, for an "excluded" list.
export async function getExcludedVisitIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('trip_excluded_visits')
    .select('visit_id')
    .eq('user_id', userId);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.visit_id));
}

// The span of the user's own reviews in or under a place — what a manually
// created trip uses instead of asking for dates. Null when they haven't
// reviewed anything there, since a trip with no reviews is nothing.
//
// One RPC call, not one per review: the containment test walks the place
// hierarchy, so doing it client-side is an N+1 by construction.
export async function getVisitRangeForPlace(
  userId: string,
  placeId: string
): Promise<{ startDate: string; endDate: string; visitCount: number } | null> {
  const { data, error } = await supabase.rpc('get_visit_range_for_place', {
    target_user_id: userId,
    target_place_id: placeId,
  });
  if (error) throw error;

  const row = (data as unknown as { start_date: string; end_date: string; visit_count: number }[])?.[0];
  if (!row) return null;
  return {
    startDate: row.start_date,
    endDate: row.end_date,
    visitCount: Number(row.visit_count),
  };
}
