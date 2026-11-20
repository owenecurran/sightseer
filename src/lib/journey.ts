import type { FeedItem } from '@/lib/feed';

// One end of a leg between two posts: where it was, at each level the post
// knows, and when.
export type JourneyStop = {
  lat: number | null;
  lng: number | null;
  date: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

export type JourneyMode = 'same-place' | 'walk' | 'drive' | 'fly' | 'unknown';

// The leg between two postcards in a feed, as it reads beside the line that
// joins them: where from and to, how far apart the places are, how far
// apart the days.
export type JourneyLeg = {
  mode: JourneyMode;
  // At the broadest level the two differ: "Washington → Illinois" between
  // states, "United States → France" between countries. "Within Illinois"
  // when they share every level known. A bare distance said nothing about
  // what it was the distance between.
  places: string | null;
  distance: string | null;
  gap: string | null;
};

const EARTH_RADIUS_KM = 6371;
// Under this, two posts are the same place told twice.
const SAME_PLACE_KM = 0.15;
const WALK_KM = 4;
const DRIVE_KM = 800;
const DAY_MS = 24 * 60 * 60 * 1000;

// Where a feed item starts or ends, for the leg to the item beside it. A
// trip runs from its first visit to its last, so the leg into it lands on
// the first and the leg out of it leaves from the last. A recap has no one
// place, so it has no leg.
export function journeyStop(item: FeedItem | undefined, end: 'first' | 'last'): JourneyStop | null {
  if (!item) return null;
  if (item.type === 'visit') return stopOf(item.visit);
  if (item.type === 'trip') {
    const visits = item.feedTrip.days.flatMap((day) => day.visits);
    const visit = end === 'first' ? visits[0] : visits[visits.length - 1];
    return visit ? stopOf(visit) : null;
  }
  return null;
}

// What a feed item is, for seeding the leg beside it: stable across reloads
// and new posts arriving, unlike its position in the list.
export function journeyItemId(item: FeedItem | undefined): string {
  if (!item) return '';
  if (item.type === 'visit') return item.visit.id;
  if (item.type === 'trip') return item.feedTrip.trip.key;
  if (item.type === 'recap') return item.recap.id;
  return 'divider';
}

export function stopOf(visit: {
  placeLat: number | null;
  placeLng: number | null;
  visited_on: string;
  placeName: string;
  placeLevel: string | null;
  stateCountry: string | null;
}): JourneyStop {
  // "Washington, United States", or one of the two alone, which is then the
  // country: resolve_state_countries writes the state first and drops it
  // when there is none.
  const parts = visit.stateCountry?.split(', ') ?? [];
  let state = parts.length > 1 ? parts[0] : null;
  let country = parts.length > 0 ? parts[parts.length - 1] : null;
  let city: string | null = null;
  // A post about a city, state or country is its own name at that level.
  // Below that the city is not known: posts carry no city for a place
  // inside one.
  if (visit.placeLevel === 'locality') city = visit.placeName;
  if (visit.placeLevel === 'admin_area_1') state = visit.placeName;
  if (visit.placeLevel === 'country') country = visit.placeName;
  return { lat: visit.placeLat, lng: visit.placeLng, date: visit.visited_on, city, state, country };
}

function placesBetween(from: JourneyStop, to: JourneyStop): string | null {
  if (from.country && to.country && from.country !== to.country) return `${from.country} → ${to.country}`;
  if (from.state && to.state && from.state !== to.state) return `${from.state} → ${to.state}`;
  if (from.city && to.city && from.city !== to.city) return `${from.city} → ${to.city}`;
  const shared =
    from.city && from.city === to.city
      ? from.city
      : from.state && from.state === to.state
        ? from.state
        : from.country && from.country === to.country
          ? from.country
          : null;
  return shared ? `Within ${shared}` : null;
}

// Null when there is nothing to say about the leg at all, which the caller
// shows as a plain divider.
export function legBetween(from: JourneyStop | null, to: JourneyStop | null): JourneyLeg | null {
  if (!from || !to) return null;
  const km = distanceKm(from, to);
  const days = daysBetween(from.date, to.date);
  if (km == null && days == null) return null;
  return {
    mode: km == null ? 'unknown' : km < SAME_PLACE_KM ? 'same-place' : km < WALK_KM ? 'walk' : km < DRIVE_KM ? 'drive' : 'fly',
    places: placesBetween(from, to),
    distance: km == null ? null : km < SAME_PLACE_KM ? 'Same place' : formatDistance(km),
    gap: days == null ? null : formatGap(days),
  };
}

// Great-circle distance: as the crow flies, which is what a dashed line on
// a postcard map means anyway.
function distanceKm(a: JourneyStop, b: JourneyStop): number | null {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Kilometres, as the rest of the app gives distances ("8970 km away").
function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round(km * 100) * 10)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

// Whole days between two visited_on dates (YYYY-MM-DD), either way round:
// the feed is ordered by when things were posted, not when they happened,
// so the later card is not reliably the later day.
function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const from = Date.parse(`${a}T00:00:00Z`);
  const to = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round(Math.abs(to - from) / DAY_MS);
}

function formatGap(days: number): string {
  if (days === 0) return 'Same day';
  if (days === 1) return '1 day apart';
  if (days < 60) return `${days} days apart`;
  if (days < 365) return `${Math.round(days / 30.44)} months apart`;
  const years = Math.round(days / 365.25);
  return years === 1 ? '1 year apart' : `${years} years apart`;
}
