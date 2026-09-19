import { getCurrentLocationIfPermitted, type Coordinate } from '@/lib/current-location';
import { getVisitsByIds, type FeedVisit } from '@/lib/feed';
import { getPhotoThumbUrls } from '@/lib/photo-view';
import { supabase } from '@/lib/supabase';

// What the Discover tab is built out of: somewhere to go, and something to
// read from outside your own follow graph.
//
// Both rankings live in SQL (see the 20260918120000_discover migration) rather
// than being assembled here, because both of them have to see every visit in
// order to rank anything — including the ones this viewer cannot read. Doing
// that client-side would mean shipping the corpus to the phone to sort it.

export type DiscoverPlace = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  avgRating: number | null;
  reviewCount: number;
  // The decayed visit count the ranking uses — roughly "how many reviews has
  // this had lately", where a review today counts once and one a month ago
  // counts half. Surfaced so the card can say a place is busy without
  // re-deriving it.
  recentActivity: number;
  // Null whenever the viewer's own location is unknown, which is the normal
  // case rather than a failure — see resolveViewerLocation.
  distanceKm: number | null;
};

// Where the viewer is, as well as can be known without asking them.
//
// Three sources, cheapest and least intrusive first:
//
//  1. the device, but ONLY if location permission is already granted. Discover
//     opens on a tap and works fine without it, so it never prompts;
//  2. the home place on the account, which is a real place row with real
//     coordinates;
//  3. the map's saved default centre, which someone who has panned their map
//     somewhere and left it there has effectively told us.
//
// All three can miss, and null is a perfectly good answer: the ranking simply
// drops its proximity term and returns a global list. Worth knowing that most
// accounts land here — of 40 users, 4 have a home place and 2 a map centre.
export async function resolveViewerLocation(userId: string): Promise<Coordinate | null> {
  const device = await getCurrentLocationIfPermitted();
  if (device) return device;

  const { data, error } = await supabase
    .from('users')
    .select('map_default_center_lat, map_default_center_lng, places!home_place_id(lat, lng)')
    .eq('id', userId)
    .maybeSingle();
  // A profile that will not load is not a reason to fail Discover.
  if (error || !data) return null;

  const home = data.places as { lat: number | null; lng: number | null } | null;
  if (home?.lat != null && home.lng != null) return { lat: home.lat, lng: home.lng };

  if (data.map_default_center_lat != null && data.map_default_center_lng != null) {
    return { lat: data.map_default_center_lat, lng: data.map_default_center_lng };
  }
  return null;
}

// Places worth going to, best first. See the migration for what "best" means:
// a rating blended against the global mean so one glowing review cannot top
// the list, plus a bonus for recent activity and one for being near the
// viewer.
export async function getDiscoverPlaces(
  limit: number,
  viewer: Coordinate | null,
): Promise<DiscoverPlace[]> {
  const { data, error } = await supabase.rpc('get_discover_places', {
    result_limit: limit,
    viewer_lat: viewer?.lat,
    viewer_lng: viewer?.lng,
  });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.place_id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    avgRating: row.avg_rating == null ? null : Number(row.avg_rating),
    reviewCount: Number(row.review_count),
    recentActivity: Number(row.recent_activity),
    distanceKm: row.distance_km == null ? null : Number(row.distance_km),
  }));
}

// One photograph per place, for the cards in the places section.
//
// A place has no picture of its own — what it has is other people's reviews —
// so this takes the newest visible review that carries one. Whatever RLS
// already hides stays hidden: this is an ordinary table read under invoker
// rights, not one of the security-definer ranking functions, so a place can
// rank on a private account's review and still show no photograph from it.
//
// One query for every place rather than one each. The obvious shape for this
// is a lateral or a distinct-on, neither of which PostgREST exposes, so the
// pick happens here — the rows are small, bounded by the section's own limit,
// and the alternative was a round trip per card.
export async function getPlacePhotoUrls(placeIds: string[]): Promise<Record<string, string>> {
  if (placeIds.length === 0) return {};

  const { data, error } = await supabase
    .from('visits')
    .select('place_id, created_at, photos(id, position)')
    .in('place_id', placeIds)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as {
    place_id: string;
    photos: { id: string; position: number }[];
  }[];

  // First row wins per place, and the rows arrive newest first.
  const photoIdByPlace = new Map<string, string>();
  for (const row of rows) {
    if (photoIdByPlace.has(row.place_id) || row.photos.length === 0) continue;
    const first = [...row.photos].sort((a, b) => a.position - b.position)[0];
    photoIdByPlace.set(row.place_id, first.id);
  }
  if (photoIdByPlace.size === 0) return {};

  // Thumbnails, not originals. These are small cards in a horizontal strip,
  // and the backfill means the derivatives now actually exist for the backlog.
  const urls = await getPhotoThumbUrls([...photoIdByPlace.values()]);

  const byPlace: Record<string, string> = {};
  for (const [placeId, photoId] of photoIdByPlace) {
    const url = urls[photoId];
    if (url) byPlace[placeId] = url;
  }
  return byPlace;
}

// Reviews from people the viewer does not follow, as the same postcard the
// feed draws.
//
// Two steps on purpose. The RPC ranks and returns ids only; the hydration
// goes through getVisitsByIds, which is the exact path the feed, boards and
// the place page already use — so a Discover card arrives with its likes,
// tags, tagged users, photographs and card stock, and stays identical to the
// same review seen anywhere else. Returning whole rows from the RPC would
// have meant a second shape to keep in step with FEED_VISIT_SELECT, which is
// how the old board views drifted into lookalikes in the first place.
export async function getDiscoverReviews(
  limit: number,
  viewerId: string,
): Promise<FeedVisit[]> {
  const { data, error } = await supabase.rpc('get_discover_reviews', {
    result_limit: limit,
  });
  if (error) throw error;

  const ranked = (data ?? []).map((row) => row.visit_id);
  if (ranked.length === 0) return [];

  const visits = await getVisitsByIds(ranked, viewerId);

  // getVisitsByIds orders by created_at, which is right for a feed and wrong
  // here — the whole point of the RPC was to decide an order. Put its one
  // back.
  const rank = new Map(ranked.map((id, index) => [id, index]));
  return visits.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}
