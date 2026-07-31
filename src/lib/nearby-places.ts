import { getPhotoViewUrls } from '@/lib/photo-view';
import { supabase } from '@/lib/supabase';

export type MapBounds = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

export type NearbyPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  avgRating: number;
  reviewCount: number;
};

// Lightweight marker data only (no photos/reviewer info) — cheap enough to
// re-fetch on every viewport settle. get_nearby_reviewed_places already
// respects visits_select's RLS (can_view_user_content) via the caller's
// auth.uid(), same as every other RPC in this codebase — no extra
// visibility filtering needed here.
export async function getNearbyReviewedPlaces(bounds: MapBounds): Promise<NearbyPlace[]> {
  const { data, error } = await supabase.rpc('get_nearby_reviewed_places', {
    min_lng: bounds.minLng,
    min_lat: bounds.minLat,
    max_lng: bounds.maxLng,
    max_lat: bounds.maxLat,
  });
  if (error) throw error;

  return data
    .filter((row) => row.lat != null && row.lng != null)
    .map((row) => ({
      id: row.place_id,
      name: row.name,
      lat: row.lat as number,
      lng: row.lng as number,
      avgRating: Number(row.avg_rating),
      reviewCount: Number(row.review_count),
    }));
}

export type PlacePreview = {
  placeName: string;
  rating: number;
  note: string | null;
  authorName: string;
  photoUrl: string | null;
};

type RawPreviewVisit = {
  rating: number;
  note: string | null;
  users: { handle: string | null; name: string | null } | null;
  places: { name: string } | null;
  photos: { id: string; position: number }[];
};

// Fetched lazily, only for the one marker actually tapped — never for every
// pin up front. Returns null (not an error) both when the place has no
// visible review right now (e.g. a slightly stale viewport query) and when
// RLS hides it, same privacy-preserving "indistinguishable on purpose"
// reasoning as getVisitDetail (src/lib/visit-detail.ts).
export async function getPlacePreviewReview(placeId: string): Promise<PlacePreview | null> {
  const { data, error } = await supabase
    .from('visits')
    .select('rating, note, users!user_id(handle, name), places!place_id(name), photos(id, position)')
    .eq('place_id', placeId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const v = data as unknown as RawPreviewVisit;
  const firstPhotoId = [...v.photos].sort((a, b) => a.position - b.position)[0]?.id;
  const photoUrl = firstPhotoId ? (await getPhotoViewUrls([firstPhotoId]))[firstPhotoId] : null;

  return {
    placeName: v.places?.name ?? 'Unknown place',
    rating: v.rating,
    note: v.note,
    authorName: v.users?.name ?? v.users?.handle ?? 'Someone',
    photoUrl: photoUrl ?? null,
  };
}
